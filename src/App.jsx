import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { assemble, move } from './pdf';
import { createHistory, historyReducer, historyShortcut } from './history';
import { PageCanvas, usePreviewDocument } from './PdfPreview';
import { savePdf } from './save';
import { stepZoom, reorderAt, ZOOM_LEVELS } from './view';
import { APP_VERSION } from './releases';
import ReleaseNotes from './ReleaseNotes';

export default function App() {
  const [history, dispatch] = useReducer(historyReducer, undefined, createHistory);
  const { sources, pages, index, bytes } = history.present;
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
    try { await operation(); }
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
  }

  function open(files) {
    void perform(async () => {
      const nextSources = [...sources];
      const nextPages = [...pages];
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.pdf')) continue;
        const sourceBytes = new Uint8Array(await file.arrayBuffer());
        const document = await PDFDocument.load(sourceBytes);
        const source = nextSources.length;
        nextSources.push({ name: file.name, bytes: sourceBytes });
        for (let page = 0; page < document.getPageCount(); page++) {
          nextPages.push({ id: crypto.randomUUID(), source, index: page, rotation: 0 });
        }
      }
      if (nextPages.length === pages.length) return;
      await commit(nextSources, nextPages, pages.length, pages.length ? 'Merge PDFs' : 'Open PDFs');
    });
  }

  function change(nextPages, nextIndex, label) {
    void perform(() => commit(sources, nextPages, nextIndex, label));
  }

  function stamp() {
    void perform(async () => {
      const edited = await assemble(sources, pages, { page: index, text, x: 50, y: 700, size: 14 });
      const nextPages = pages.map((page, i) => ({ ...page, source: 0, index: i, rotation: 0 }));
      await commit([{ name: 'Edited document', bytes: edited }], nextPages, index, 'Add text');
      setText('');
    });
  }

  function save(extract = false) {
    void perform(async () => {
      const output = extract ? await assemble(sources, [pages[index]]) : bytes;
      const result = await savePdf(output, extract ? 'page.pdf' : 'edited.pdf');
      if (result.kind === 'saved') setSaveStatus(`Saved: ${result.path}`);
      if (result.kind === 'downloaded') setSaveStatus('PDF download started.');
    });
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
        <label className={`button primary ${busy ? 'disabled' : ''}`}>
          ＋ Open / merge
          <input type="file" aria-label="Open or merge PDFs" accept=".pdf" multiple disabled={busy}
            onChange={event => { open(Array.from(event.target.files)); event.target.value = ''; }} />
        </label>
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
          zoom={zoom} viewportRef={viewport} onScale={setDisplayZoom} /> :
          <p role="status">Loading document…</p>) : <div className="empty">
            <h1>Welcome to PDF Studio</h1>
            <p>Open PDFs to merge, rearrange, rotate, delete, extract, or add text.</p>
            <p>Files remain on your device.</p>
          </div>}
      </section>
      <aside className="text-sidebar">
        <h3>Add text</h3>
        <p>Overlay text on the selected page (existing text editing is not yet supported).</p>
        <textarea aria-label="Text to add" value={text} onChange={event => setText(event.target.value)} placeholder="Enter text" />
        <button className="primary" disabled={busy || !pages.length || !text.trim()} onClick={stamp}>Apply text</button>
        <p>Text is placed at PDF coordinates (50, 700) using Helvetica 14pt.</p>
        <p className="muted">Undo: Ctrl+Z<br />Redo: Ctrl+Y or Ctrl+Shift+Z</p>
      </aside>
    </main>
    <footer><span>PDF Studio {APP_VERSION} · Page {pages.length ? index + 1 : 0} of {pages.length} · Up to 30 undo steps this session</span>
      <ReleaseNotes />
    </footer>
  </div>;
}
