import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { assemble, move } from './pdf';
import { createHistory, historyReducer, historyShortcut } from './history';
import { PageCanvas, usePreviewDocument } from './PdfPreview';
import { savePdf } from './save';
import { stepZoom, reorderAt, ZOOM_LEVELS } from './view';
import { APP_VERSION } from './releases';
import ReleaseNotes from './ReleaseNotes';
import MergeDialog from './MergeDialog';
import { insertPages } from './merge';
import { isTauri } from '@tauri-apps/api/core';
import UnsavedDialog from './UnsavedDialog';
import { registerNativeCloseProtection } from './native-close';
import MarkupControls from './MarkupControls';
import { createMarkup } from './markup';
import CommentsPanel, { CommentMarkers } from './CommentsPanel';
import { createComment, addPageComment } from './comments';
import TextOverlayLayer from './TextOverlayLayer';
import { editPageAnnotation, DEFAULT_TEXT_STYLE } from './text-overlays';
import TextStyleControls from './TextStyleControls';
import AnnotationInspector from './AnnotationInspector';
import { updateAnnotation, removeAnnotation } from './annotation-editing';
import { importStudioAnnotations } from './annotation-import';

export default function App() {
  const [history, dispatch] = useReducer(historyReducer, undefined, createHistory);
  const { sources, pages, index, bytes } = history.present;
  const [text, setText] = useState('');
  const [selection, setSelection] = useState(null);

  const [placingText, setPlacingText] = useState(false);
  const [textStyle, setTextStyle] = useState(DEFAULT_TEXT_STYLE);
  const [textStyleValid, setTextStyleValid] = useState(true);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);
  const selectedText = pages[index]?.annotations?.find(item => item.id === selectedAnnotationId && item.type === 'text') ?? null;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingFiles, setPendingFiles] = useState(null);
  const [savedBytes, setSavedBytes] = useState(null);
  const [currentPath, setCurrentPath] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const documentName = useRef('edited.pdf');
  const live = useRef({});
  const dirty = bytes !== savedBytes;
  const [zoom, setZoom] = useState('fit-width');
  const [displayZoom, setDisplayZoom] = useState(100);
  const [saveStatus, setSaveStatus] = useState('');
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const dragId = useRef(null);
  const busyRef = useRef(false);
  const sidebar = useRef(null);
  const viewport = useRef(null);
  const preview = usePreviewDocument(bytes);
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  useEffect(() => setSelection(null), [index, bytes]);
  useEffect(() => { setPlacingText(false); setSelectedAnnotationId(null); }, [pages[index]?.id]);
  useEffect(() => { if (!textStyleValid) setPlacingText(false); }, [textStyleValid]);

  const navigateHistory = useCallback(type => {
    if (busyRef.current) return;
    dispatch({ type });
    setError('');
    setSaveStatus('');
  }, []);

  useEffect(() => {
    const handleKey = event => {
      const type = historyShortcut(event);
      if (!type) return;
      // Prevent the webview's own navigation shortcut, even at a history edge.
      event.preventDefault();
      navigateHistory(type);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [navigateHistory]);

  // A change is committed only after its PDF is successfully assembled. The
  // immediate ref prevents double clicks or keyboard input from overlapping.
  async function perform(operation) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setSaveStatus('');
    try { return await operation(); }
    catch (cause) { setError(String(cause)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function commit(nextSources, nextPages, nextIndex, label) {
    const nextBytes = nextPages.length ? await assemble(nextSources, nextPages) : null;
    dispatch({ type: 'commit', document: {
      sources: nextSources, pages: nextPages,
      index: Math.max(0, Math.min(nextIndex, nextPages.length - 1)),
      bytes: nextBytes, label,
    } });
    return nextBytes;
  }

  function open(files, offset = pages.length, selections = null) {
    void perform(async () => {
      const nextSources = [...sources];
      const incoming = [];
      for (const [fileIndex, file] of files.entries()) {
        if (!file.name.toLowerCase().endsWith('.pdf')) continue;
        const selection = selections?.[fileIndex];
        const sourceBytes = selection?.bytes ?? new Uint8Array(await file.arrayBuffer());
        const imported = await importStudioAnnotations(sourceBytes);
        const pageCount = imported.count;
        const source = nextSources.length;
        nextSources.push({ name: file.name, bytes: imported.bytes });
        const indices = selection?.indices ?? Array.from({ length: pageCount }, (_, i) => i);
        for (const page of indices) {
          incoming.push({ id: crypto.randomUUID(), source, index: page, rotation: 0, annotations: imported.annotations[page] });
        }
      }
      if (!incoming.length) return;
      const nextBytes = await commit(nextSources, insertPages(pages, incoming, offset), offset, pages.length ? 'Merge PDFs' : 'Open PDFs');
      if (sources.length === 0) {
        setCurrentPath(null); documentName.current = files.length === 1 ? files[0].name : 'edited.pdf';
        if (files.length === 1) setSavedBytes(nextBytes);
      }
    });
  }

  function change(nextPages, nextIndex, label) {
    void perform(() => commit(sources, nextPages, nextIndex, label));
  }

  function addComment(content) {
    void perform(async () => {
      const document = await PDFDocument.load(bytes);
      const box = document.getPage(index).getCropBox();
      const count = (pages[index].annotations ?? []).filter(item => item.type === 'comment').length;
      const x = box.x + Math.min(24, Math.max(0, box.width - 20));
      const y = box.y + Math.max(0, box.height - 44 - (count % Math.max(1, Math.floor(box.height / 28))) * 28);
      const comment = createComment(content, x, y);
      await commit(sources, addPageComment(pages, pages[index].id, comment), index, 'Add comment');
      setSelectedAnnotationId(comment.id);
    });
  }

  function placeText(x, y) {
    const annotation = { id: crypto.randomUUID(), type: 'text', text, x, y,
      ...textStyle };
    change(pages.map((page, i) => i === index ? { ...page,
      annotations: [...(page.annotations ?? []), annotation] } : page), index, 'Add text');
    setPlacingText(false);
    setSelectedAnnotationId(annotation.id);
  }

  async function save(extract = false, saveAs = true) {
    return perform(async () => {
      const output = extract ? await assemble(sources, [pages[index]]) : bytes;
      if (!output) throw new Error('There are no pages to save. Undo the deletion or discard changes.');
      const result = await savePdf(output, extract ? 'page.pdf' : documentName.current, !extract && !saveAs ? currentPath : null);
      if (result.kind === 'saved') {
        setSaveStatus(`Saved: ${result.path}`);
        if (!extract) { setSavedBytes(bytes); setCurrentPath(result.path); }
        return true;
      }
      if (result.kind === 'downloaded') setSaveStatus('PDF download started; completion cannot be confirmed.');
      if (result.kind === 'cancelled') setSaveStatus('Save cancelled. Changes have not been saved.');
      return false;
    });
  }

  function requestAction(action) {
    if (busyRef.current) return;
    if (dirty) setPendingAction(() => action);
    else void continueAction(action);
  }

  async function continueAction(action) {
    try { await action(); } catch (cause) { setError('Could not continue: ' + String(cause)); }
  }

  async function replaceDocument(file) {
    await perform(async () => {
      const sourceBytes = new Uint8Array(await file.arrayBuffer());
      const imported = await importStudioAnnotations(sourceBytes);
      const nextSources = [{ name: file.name, bytes: imported.bytes }];
      const nextPages = Array.from({ length: imported.count }, (_, index) => ({ id: crypto.randomUUID(), source: 0, index, rotation: 0, annotations: imported.annotations[index] }));
      const nextBytes = await assemble(nextSources, nextPages);
      dispatch({ type: 'replace', document: { sources: nextSources, pages: nextPages, index: 0, bytes: nextBytes, label: 'Open document' } });
      setSavedBytes(nextBytes); setCurrentPath(null); documentName.current = file.name;
      setText(''); setPendingFiles(null);
    });
  }

  live.current = { dirty, pendingAction: Boolean(pendingAction), requestAction, save };
  useEffect(() => {
    const beforeUnload = event => { if (live.current.dirty || busyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    const shortcut = event => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      if (!document.querySelector('dialog[open]')) void live.current.save(false, event.shiftKey);
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('keydown', shortcut);
    const closeProtection = isTauri() ? registerNativeCloseProtection({
      getState: () => ({ ...live.current, busy: busyRef.current }),
      requestAction: action => live.current.requestAction(action), onError: setError,
    }) : null;
    return () => { closeProtection?.dispose(); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('keydown', shortcut); };
  }, []);

  function addMarkup(type, color) {
    if (!selection || busyRef.current) return;
    const annotation = createMarkup(type, selection, color);
    change(pages.map((page, i) => i === index ? { ...page, annotations: [...(page.annotations || []), annotation] } : page), index,
      type === 'highlight' ? 'Highlight text' : 'Underline text');
    setSelectedAnnotationId(annotation.id);
  }

  function removeMarkup(id) {
    change(pages.map((page, i) => i === index ? { ...page, annotations: (page.annotations || []).filter(item => item.id !== id) } : page), index, 'Delete markup');
  }

  function finishDrag() {
    dragId.current = null;
    setDragging(null);
    setDropTarget(null);
  }

  function dropPosition(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  }

  function dragOver(event, targetId) {
    if (!dragId.current || busyRef.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget({ id: targetId, position: dropPosition(event) });
    const area = sidebar.current.getBoundingClientRect();
    if (event.clientY < area.top + 40) sidebar.current.scrollTop -= 16;
    if (event.clientY > area.bottom - 40) sidebar.current.scrollTop += 16;
  }

  function drop(event, targetId) {
    event.preventDefault();
    const sourceId = dragId.current;
    const position = dropPosition(event);
    finishDrag();
    if (!sourceId || busyRef.current) return;
    const nextPages = reorderAt(pages, sourceId, targetId, position);
    if (nextPages === pages) return;
    change(nextPages, nextPages.findIndex(page => page.id === sourceId), 'Move page');
  }

  const undoLabel = canUndo ? `Undo ${history.present.label}` : 'Undo';
  const redoLabel = canRedo ? `Redo ${history.future[0].label}` : 'Redo';

  return <div className="app" aria-busy={busy}>
    <header>
      <strong>▣ PDF Studio</strong>
      <div className="file-actions">
        <label className={`button ${busy ? 'disabled' : ''}`}>Open new document
          <input type="file" aria-label="Open new document" accept=".pdf" disabled={busy}
            onChange={event => { const file = event.target.files[0]; event.target.value = ''; if (file) requestAction(() => replaceDocument(file)); }} />
        </label>
        <label className={`button primary ${busy ? 'disabled' : ''}`}>
          ＋ Open / merge
          <input type="file" aria-label="Open or merge PDFs" accept=".pdf" multiple disabled={busy}
            onChange={event => { const files = Array.from(event.target.files); event.target.value = ''; if (!files.length) return; if (pages.length) setPendingFiles(files); else open(files, 0); }} />
        </label>
        <button aria-label="Save PDF" disabled={busy || !pages.length} onClick={() => save(false, false)}>Save</button>
        <button aria-label="Save As / Export PDF" disabled={busy || !pages.length} onClick={() => save()}>↓ Save As…</button>
      </div>
    </header>
    <nav aria-label="Page editing tools">
      <button aria-label={undoLabel} title={`${undoLabel} (Ctrl+Z)`} disabled={busy || !canUndo}
        onClick={() => navigateHistory('undo')}>↶ Undo</button>
      <button aria-label={redoLabel} title={`${redoLabel} (Ctrl+Y or Ctrl+Shift+Z)`} disabled={busy || !canRedo}
        onClick={() => navigateHistory('redo')}>↷ Redo</button>
      <span className="tool-divider" />
      <button disabled={busy || !pages.length || index === 0}
        onClick={() => change(move(pages, index, index - 1), index - 1, 'Move page')}>↑ Move</button>
      <button disabled={busy || !pages.length || index === pages.length - 1}
        onClick={() => change(move(pages, index, index + 1), index + 1, 'Move page')}>↓ Move</button>
      <button disabled={busy || !pages.length} onClick={() => change(pages.map((page, i) =>
        i === index ? { ...page, rotation: (page.rotation + 90) % 360 } : page), index, 'Rotate page')}>↻ Rotate</button>
      <button disabled={busy || !pages.length} onClick={() => change(pages.filter((_, i) => i !== index),
        Math.max(0, index - 1), 'Delete page')}>✕ Delete</button>
      <button disabled={busy || !pages.length} onClick={() => save(true)}>⇩ Extract</button>
      <span className="page-count" role="status">{busy ? 'Updating…' : `${pages.length} pages`}</span>
    </nav>
    <div className="view-toolbar" role="group" aria-label="Zoom controls">
      <button aria-label="Zoom out" disabled={!pages.length || displayZoom <= 25}
        onClick={() => setZoom(stepZoom(displayZoom, -1))}>−</button>
      <select aria-label="Zoom level" value={zoom} disabled={!pages.length}
        onChange={event => setZoom(event.target.value.startsWith('fit-') ? event.target.value : Number(event.target.value))}>
        <option value="fit-width">Fit width</option><option value="fit-page">Fit page</option>
        {ZOOM_LEVELS.map(level => <option key={level} value={level}>{level}%</option>)}
      </select>
      <button aria-label="Zoom in" disabled={!pages.length || displayZoom >= 300}
        onClick={() => setZoom(stepZoom(displayZoom, 1))}>＋</button>
      <span className="zoom-value">{pages.length ? `${displayZoom}%` : ''}</span>
      <span className="save-status" role="status">{saveStatus}</span>
      <span className="document-status" role="status">{dirty ? 'Unsaved changes' : 'No unsaved changes'}</span>
    </div>
    <main>
      <aside ref={sidebar} className="pages-sidebar" aria-label="Page thumbnails">
        <h3>Pages</h3>
        {!pages.length && <p className="muted">Open a PDF to see page previews.</p>}
        <p className="muted">Drag a thumbnail to move a page.</p>
        {pages.map((page, i) => <button key={page.id} className={`thumbnail ${index === i ? 'active' : ''} ${dragging === page.id ? 'dragging' : ''} ${dropTarget?.id === page.id ? `drop-${dropTarget.position}` : ''}`}
          disabled={busy} aria-label={`Select page ${i + 1}`} aria-current={index === i ? 'page' : undefined}
          draggable={!busy} title={`Page ${i + 1}: drag to reorder, or use the Move buttons`}
          onDragStart={event => {
            if (busyRef.current) { event.preventDefault(); return; }
            dragId.current = page.id;
            setDragging(page.id);
            dispatch({ type: 'select', index: i });
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('application/x-pdf-studio-page', page.id);
          }}
          onDragOver={event => dragOver(event, page.id)} onDrop={event => drop(event, page.id)}
          onDragEnd={finishDrag}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null); }}
          onClick={() => dispatch({ type: 'select', index: i })}>
          {preview.pdf ? <PageCanvas key={`${preview.id}-${i}`} pdf={preview.pdf} index={i}
            thumbnail scrollRoot={sidebar} /> : <div className="thumbnail-preview"><span className="muted">
              {preview.error ? 'Preview unavailable' : 'Loading preview…'}
            </span></div>}
          <span className="thumbnail-label">Page {i + 1}</span>
        </button>)}
      </aside>
      <section ref={viewport} aria-label="Selected page">
        {(error || preview.error) && <p className="error" role="alert">{error || preview.error}</p>}
        {bytes ? (preview.pdf ? <PageCanvas key={`${preview.id}-${index}`} pdf={preview.pdf} index={index}
          zoom={zoom} viewportRef={viewport} onScale={setDisplayZoom} onSelection={setSelection}
          renderOverlay={pageViewport => <>
            <TextOverlayLayer viewport={pageViewport} annotations={pages[index]?.annotations} placing={placingText} disabled={busy}
              onPlace={placeText} onSelect={setSelectedAnnotationId} onMove={(id, x, y) => change(editPageAnnotation(pages, pages[index].id, id, { x, y }), index, 'Move text')} />
            <CommentMarkers viewport={pageViewport} annotations={pages[index]?.annotations}
              selectedId={selectedAnnotationId} onSelect={setSelectedAnnotationId} />
          </>} /> :
          <p role="status">Loading document…</p>) : <div className="empty">
            <h1>Welcome to PDF Studio</h1>
            <p>Open PDFs to merge, rearrange, rotate, delete, extract, or add text.</p>
            <p>Files remain on your device.</p>
          </div>}
      </section>
      <aside className="text-sidebar">
        <MarkupControls selection={selection} annotations={pages[index]?.annotations} disabled={busy || !pages.length}
          onAdd={addMarkup} onRemove={removeMarkup} />
        <CommentsPanel annotations={pages[index]?.annotations} disabled={busy || !pages.length}
          onAdd={addComment} selectedId={selectedAnnotationId} onSelect={setSelectedAnnotationId} />
        <AnnotationInspector annotations={pages[index]?.annotations ?? []} selectedId={selectedAnnotationId} disabled={busy}
          onSelect={setSelectedAnnotationId} onApply={(id, draft) => {
            void perform(async () => {
              const nextPages = updateAnnotation(pages, pages[index].id, id, draft);
              if (nextPages !== pages) await commit(sources, nextPages, index, 'Edit annotation');
            });
          }} onDelete={id => {
            change(removeAnnotation(pages, pages[index].id, id), index, 'Delete annotation');
          }} />
        <h3>Add text</h3>
        <p>Overlay text on the selected page (existing text editing is not yet supported).</p>
        <textarea aria-label="Text to add" value={text} onChange={event => setText(event.target.value)} placeholder="Enter text" />
        <TextStyleControls defaults={textStyle} selected={selectedText} annotations={pages[index]?.annotations ?? []}
          disabled={busy} previewText={text} onDefaultsChange={setTextStyle} onSelect={setSelectedAnnotationId} onValidityChange={setTextStyleValid}
          onApply={style => { if (selectedText) change(editPageAnnotation(pages, pages[index].id, selectedText.id, style), index, 'Style text'); }} />
        <button className="primary" disabled={busy || !pages.length || !text.trim() || !textStyleValid} onClick={() => setPlacingText(value => !value)}>{placingText ? 'Cancel placement' : 'Place text'}</button>
        <p>{placingText ? 'Click the page to place your text.' : 'Drag a blue text handle to move an overlay. Focus it and use arrow keys for precise movement.'}</p>
        <p className="muted">Undo: Ctrl+Z<br />Redo: Ctrl+Y or Ctrl+Shift+Z</p>
      </aside>
    </main>
    {pendingFiles && <MergeDialog files={pendingFiles} count={pages.length} selectedIndex={index}
      onCancel={() => setPendingFiles(null)} onConfirm={(offset, selections) => { const files = pendingFiles; setPendingFiles(null); open(files, offset, selections); }} />}
    {pendingAction && <UnsavedDialog saving={busy} error={error} status={saveStatus} browser={!isTauri()} onCancel={() => setPendingAction(null)}
      onDiscard={() => { const action = pendingAction; setPendingAction(null); void continueAction(action); }}
      onSave={async () => { if (await save(false, false)) { const action = pendingAction; setPendingAction(null); void continueAction(action); } }} />}
    <footer><span>PDF Studio {APP_VERSION} · Page {pages.length ? index + 1 : 0} of {pages.length} · Up to 30 undo steps this session</span>
      <ReleaseNotes />
    </footer>
  </div>;
}
