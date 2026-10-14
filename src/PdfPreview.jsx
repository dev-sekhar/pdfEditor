import React, { memo, useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { previewScale } from './view';
import { selectionRects } from './text-selection';
import 'pdfjs-dist/web/pdf_viewer.css';

pdfjs.GlobalWorkerOptions.workerSrc = worker;

// Viewer and thumbnails share one PDF.js document per edited PDF.
export function usePreviewDocument(bytes) {
  const [state, setState] = useState({ bytes: null, pdf: null, error: '' });
  const generation = useRef(0);
  useEffect(() => {
    if (!bytes) return;
    let cancelled = false;
    const id = ++generation.current;
    // PDF.js transfers its input to a worker; keep history's original bytes intact.
    const loading = pdfjs.getDocument({ data: new Uint8Array(bytes) });
    loading.promise.then(
      pdf => { if (!cancelled) setState({ bytes, pdf, id, error: '' }); },
      error => { if (!cancelled) setState({ bytes, pdf: null, error: String(error) }); },
    );
    return () => {
      cancelled = true;
      void loading.destroy().catch(() => {});
    };
  }, [bytes]);
  // Never display a document from the previous edit while the new one loads.
  return state.bytes === bytes ? state : { pdf: null, error: '' };
}

export const PageCanvas = memo(function PageCanvas({ pdf, index, thumbnail = false, scrollRoot,
  zoom = 100, viewportRef, onScale, onSelection, onViewport }) {
  const canvas = useRef(null);
  const container = useRef(null);
  const textContainer = useRef(null);
  const currentViewport = useRef(null);
  const callbacks = useRef({ onSelection, onViewport });
  callbacks.current = { onSelection, onViewport };
  const [visible, setVisible] = useState(!thumbnail);
  const [status, setStatus] = useState('loading');
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (thumbnail) return;
    const captureSelection = () => {
      const selection = window.getSelection();
      const rects = selectionRects(selection, textContainer.current, currentViewport.current);
      // Keep the last PDF selection while the user clicks a markup tool.
      if (rects.length) callbacks.current.onSelection?.({ rects, text: selection.toString() });
    };
    document.addEventListener('selectionchange', captureSelection);
    return () => document.removeEventListener('selectionchange', captureSelection);
  }, [thumbnail]);

  useEffect(() => {
    if (thumbnail || !viewportRef?.current) return;
    const viewport = viewportRef.current;
    const measure = () => {
      const next = { width: Math.max(1, viewport.clientWidth - 50), height: Math.max(1, viewport.clientHeight - 50) };
      setViewportSize(previous => previous.width === next.width && previous.height === next.height ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [thumbnail, viewportRef]);

  useEffect(() => {
    if (!thumbnail || visible) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { root: scrollRoot?.current ?? null, rootMargin: '150px' });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [thumbnail, visible, scrollRoot]);

  useEffect(() => {
    if (!pdf || !visible) return;
    let cancelled = false;
    let render;
    let textLayer;
    if (!thumbnail) {
      textContainer.current.replaceChildren();
      callbacks.current.onSelection?.(null);
    }
    // Give every render its own canvas so rapid zoom/resize cannot race with
    // an old PDF.js rendering task that is still finishing cancellation.
    const element = document.createElement('canvas');
    element.setAttribute('aria-label', `${thumbnail ? 'Thumbnail' : 'Preview'} of page ${index + 1}`);
    canvas.current.replaceChildren(element);
    setStatus('loading');
    (async () => {
      try {
        const page = await pdf.getPage(index + 1);
        if (cancelled) return;
        const natural = page.getViewport({ scale: 1 });
        const scale = thumbnail ? Math.min(112 / natural.width, 150 / natural.height) : previewScale(zoom, natural, viewportSize);
        if (!thumbnail) onScale?.(Math.round(scale * 100));
        const viewport = page.getViewport({ scale });
        currentViewport.current = viewport;
        if (!thumbnail) {
          callbacks.current.onViewport?.(viewport);
          textContainer.current.style.setProperty('--scale-factor', scale);
          textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textContainer.current, viewport });
        }
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        element.width = Math.ceil(viewport.width * ratio);
        element.height = Math.ceil(viewport.height * ratio);
        element.style.width = `${viewport.width}px`;
        element.style.height = `${viewport.height}px`;
        render = page.render({
          canvasContext: element.getContext('2d'),
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        await render.promise;
        if (textLayer && !cancelled) await textLayer.render();
        if (!cancelled) setStatus('ready');
      } catch (error) {
        if (!cancelled && error.name !== 'RenderingCancelledException') setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      render?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, index, thumbnail, visible, zoom, viewportSize, onScale]);

  return <div ref={container} className={thumbnail ? 'thumbnail-preview' : 'page-preview'}>
    <div ref={canvas} className="canvas-holder" style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }} />
    {!thumbnail && <div ref={textContainer} className="textLayer" aria-label="Selectable page text"
      style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }} onMouseUp={() => {
        const selection = window.getSelection();
        const rects = selectionRects(selection, textContainer.current, currentViewport.current);
        callbacks.current.onSelection?.(rects.length ? { rects, text: selection.toString() } : null);
      }} />}
    {status !== 'ready' && <span className="preview-status" role={thumbnail ? undefined : 'status'}>
      {status === 'error' ? 'Preview unavailable' : 'Loading preview…'}
    </span>}
  </div>;
});
