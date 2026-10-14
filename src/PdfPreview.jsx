import React, { memo, useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

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

export const PageCanvas = memo(function PageCanvas({ pdf, index, thumbnail = false, scrollRoot }) {
  const canvas = useRef(null);
  const container = useRef(null);
  const [visible, setVisible] = useState(!thumbnail);
  const [status, setStatus] = useState('loading');

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
    // Each render owns its canvas. Cancelled PDF.js work cannot race with a new
    // edit on the same canvas, including rapid undo/redo and page selection.
    const element = canvas.current;
    setStatus('loading');
    (async () => {
      try {
        const page = await pdf.getPage(index + 1);
        if (cancelled) return;
        const natural = page.getViewport({ scale: 1 });
        const scale = thumbnail ? Math.min(112 / natural.width, 150 / natural.height) : 1.25;
        const viewport = page.getViewport({ scale });
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
        if (!cancelled) setStatus('ready');
      } catch (error) {
        if (!cancelled && error.name !== 'RenderingCancelledException') setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [pdf, index, thumbnail, visible]);

  return <div ref={container} className={thumbnail ? 'thumbnail-preview' : 'page-preview'}>
    <canvas ref={canvas} aria-label={`${thumbnail ? 'Thumbnail' : 'Preview'} of page ${index + 1}`}
      style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }} />
    {status !== 'ready' && <span className="preview-status" role={thumbnail ? undefined : 'status'}>
      {status === 'error' ? 'Preview unavailable' : 'Loading preview…'}
    </span>}
  </div>;
});
