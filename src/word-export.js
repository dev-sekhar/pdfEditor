export const WORD_EXPORT_LIMITS = Object.freeze({ maxPages: 200, maxSourceBytes: 100 * 1024 * 1024,
  maxPagePixels: 16_000_000, maxTotalPixels: 128_000_000, maxTextCharacters: 2_000_000 });

function abortError() { const error = new Error('Word export cancelled.'); error.name = 'AbortError'; return error; }
function checkAbort(signal) { if (signal?.aborted) throw abortError(); }
function abortable(promise, signal, cancel) {
  if (!signal) return Promise.resolve(promise);
  return new Promise((resolve, reject) => {
    const aborted = () => { try { Promise.resolve(cancel?.()).catch(() => {}); } catch { /* Cleanup runs below. */ } reject(abortError()); };
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
    if (signal.aborted) aborted();
  });
}

export function cleanWordText(value) {
  const text = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
  return text.toWellFormed ? text.toWellFormed() : text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

// Simple visual reading order only. Every source line becomes an editable
// paragraph; this does not infer headings, tables, columns, or semantic layout.
export function groupTextLines(items, viewport) {
  const chunks = [];
  for (const [order, item] of items.entries()) {
    if (typeof item.str !== 'string') continue;
    const transform = item.transform;
    if (!Array.isArray(transform) || transform.length !== 6 || !transform.every(Number.isFinite)) throw new Error('PDF text has invalid positioning.');
    const [x, y] = viewport.convertToViewportPoint(transform[4], transform[5]);
    const [fx, fy] = viewport.convertToViewportPoint(transform[4] + transform[2], transform[5] + transform[3]);
    const fontSize = Math.hypot(fx - x, fy - y) || Math.abs(item.height) || 12;
    if (![x, y, fontSize].every(Number.isFinite)) throw new Error('PDF text has invalid dimensions.');
    // Entirely crop-hidden text is excluded. Partial runs and hidden OCR layers
    // are not reliably distinguishable; editable mode makes no security claim.
    if (x < -Math.abs(item.width ?? 0) || x > viewport.width || y < -fontSize || y > viewport.height + fontSize) continue;
    const lines = cleanWordText(item.str).replace(/\r\n?/g, '\n').split('\n');
    lines.forEach((text, line) => chunks.push({ text, x, y: y + line * fontSize * 1.2,
      fontSize, width: Math.abs(item.width ?? 0), order, eol: line < lines.length - 1 || Boolean(item.hasEOL) }));
  }
  chunks.sort((a, b) => a.y - b.y || a.x - b.x || a.order - b.order);
  const lines = [];
  for (const chunk of chunks) {
    let line = lines.at(-1);
    if (!line || Math.abs(chunk.y - line.y) > Math.max(2, Math.min(chunk.fontSize, line.fontSize) * 0.3)) {
      line = { y: chunk.y, fontSize: chunk.fontSize, chunks: [] }; lines.push(line);
    }
    line.chunks.push(chunk);
  }
  const output = [];
  for (const line of lines) {
    let runs = [];
    const flush = () => { if (runs.some(run => run.text.trim())) output.push({ text: runs.map(run => run.text).join(''), runs: runs.map(({ text, size }) => ({ text, size })) }); runs = []; };
    for (const chunk of line.chunks.sort((a, b) => a.x - b.x || a.order - b.order)) {
      const previous = runs.at(-1);
      const gap = previous ? chunk.x - (previous.x + previous.width) : 0;
      if (previous && previous.text && chunk.text && !/\s$/.test(previous.text) && !/^\s/.test(chunk.text) && gap > chunk.fontSize * 0.12) runs.push({ text: ' ', size: chunk.fontSize, x: chunk.x, width: 0 });
      if (chunk.text) runs.push({ text: chunk.text, size: chunk.fontSize, x: chunk.x, width: chunk.width });
      if (chunk.eol) flush();
    }
    flush();
  }
  return output;
}

export function wordPageGeometry(viewport) {
  const { width, height } = viewport;
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw new Error('PDF page has invalid visible dimensions.');
  const scale = Math.min(1, 1584 / Math.max(width, height)); // Word's 22-inch page limit.
  const widthPoints = Math.max(72, width * scale); const heightPoints = Math.max(72, height * scale);
  return { widthPoints, heightPoints, widthTwips: Math.round(widthPoints * 20), heightTwips: Math.round(heightPoints * 20),
    // Display dimensions are CSS pixels (96 DPI), independent of PNG's 144 DPI.
    imageWidth: width * scale * 4 / 3, imageHeight: height * scale * 4 / 3, scaled: scale < 1 };
}

async function loadDocument(bytes, { signal }) {
  const pdfjs = await import('pdfjs-dist'); const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  checkAbort(signal); pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const loading = pdfjs.getDocument({ data: new Uint8Array(bytes), stopAtErrors: true, isEvalSupported: false });
  try { return await abortable(loading.promise, signal); }
  catch (cause) { try { await loading.destroy(); } catch { /* Preserve the original error. */ } throw cause; }
}

const browserPlatform = {
  createCanvas(width, height) { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas; },
  async toPng(canvas) {
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not encode a Word page image.')), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  },
  yield: () => new Promise(resolve => setTimeout(resolve, 0)),
};

export async function exportPdfToWord(bytes, options = {}) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength) throw new Error('Open a PDF before exporting to Word.');
  const mode = options.mode;
  if (mode !== 'text' && mode !== 'images') throw new Error('Choose editable text or page images for Word export.');
  const limits = { ...WORD_EXPORT_LIMITS, ...options.limits };
  for (const [key, value] of Object.entries(limits)) if (!(key in WORD_EXPORT_LIMITS) || !Number.isSafeInteger(value) || value < 1 || value > WORD_EXPORT_LIMITS[key]) throw new Error('Invalid Word export resource limit.');
  if (bytes.byteLength > limits.maxSourceBytes) throw new Error('This PDF exceeds the Word export input size limit.');
  const platform = { ...browserPlatform, ...options.platform }; const signal = options.signal;
  const warnings = [mode === 'text' ? 'Editable text uses simple reading order. Tables, columns, images and exact layout are not preserved; OCR or partially visible text may be included.' : 'Pages are exported as images; their text is not editable.'];
  let fallbackCount = 0; let scaledCount = 0;
  let document; let candidate; let released = false; let canvas; let render; let failure; let result; let pageCount;
  const cleanup = new Map();
  const destroy = source => {
    if (!source) return Promise.resolve();
    if (!cleanup.has(source)) cleanup.set(source, Promise.resolve().then(() => source.destroy()));
    return cleanup.get(source);
  };
  try {
    checkAbort(signal);
    const loading = Promise.resolve().then(() => (options.renderDocument ?? loadDocument)(new Uint8Array(bytes), { signal })).then(async source => {
      candidate = source;
      if (released || signal?.aborted) { await destroy(source); throw abortError(); }
      return source;
    });
    document = await abortable(loading, signal); pageCount = document.numPages;
    if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > limits.maxPages) throw new Error(`Word export supports at most ${limits.maxPages} pages.`);
    const pages = []; let totalPixels = 0; let totalCharacters = 0;
    for (let index = 0; index < pageCount; index++) {
      checkAbort(signal);
      const page = await abortable(document.getPage(index + 1), signal);
      const natural = page.getViewport({ scale: 1 }); const geometry = wordPageGeometry(natural);
      let lines = [];
      if (mode === 'text') {
        const content = await abortable(page.getTextContent(), signal);
        totalCharacters += content.items.reduce((sum, item) => sum + (typeof item.str === 'string' ? item.str.length : 0), 0);
        if (totalCharacters > limits.maxTextCharacters) throw new Error('This PDF exceeds the Word export text size limit.');
        lines = groupTextLines(content.items, natural);
      }
      const image = mode === 'images' || !lines.length;
      let viewport;
      if (image) {
        viewport = page.getViewport({ scale: 2 });
        const pixels = Math.ceil(viewport.width) * Math.ceil(viewport.height);
        if (![viewport.width, viewport.height].every(value => Number.isFinite(value) && value > 0) || !Number.isSafeInteger(pixels) || pixels > limits.maxPagePixels || totalPixels + pixels > limits.maxTotalPixels) throw new Error('This PDF exceeds Word export image pixel limits.');
        totalPixels += pixels;
        if (mode === 'text') fallbackCount++;
      }
      if (geometry.scaled) scaledCount++;
      pages.push({ page, natural, viewport, geometry, lines, image });
      options.onProgress?.({ completed: index + 1, total: pageCount, phase: 'reading' });
      await abortable(platform.yield(), signal);
    }
    if (fallbackCount) warnings.push(`${fallbackCount} ${fallbackCount === 1 ? 'page had' : 'pages had'} no extractable text and ${fallbackCount === 1 ? 'was' : 'were'} included as page images. OCR is not available.`);
    if (scaledCount) warnings.push(`${scaledCount} ${scaledCount === 1 ? 'page was' : 'pages were'} scaled uniformly to fit Word's 22-inch page limit.`);
    const { Document, Paragraph, TextRun, ImageRun, Packer, SectionType, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType } = await import('docx');
    checkAbort(signal);
    const sections = [];
    for (const [index, item] of pages.entries()) {
      checkAbort(signal); let children;
      if (item.image) {
        canvas = platform.createCanvas(Math.ceil(item.viewport.width), Math.ceil(item.viewport.height));
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Could not create a Word export page canvas.');
        context.setTransform(1, 0, 0, 1, 0, 0); context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
        render = item.page.render({ canvasContext: context, viewport: item.viewport, background: 'rgb(255,255,255)', intent: 'display' });
        await abortable(render.promise, signal, () => render?.cancel()); render = null; checkAbort(signal);
        const png = await abortable(platform.toPng(canvas), signal); checkAbort(signal);
        children = [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new ImageRun({ type: 'png', data: png,
          transformation: { width: item.geometry.imageWidth, height: item.geometry.imageHeight },
          floating: { horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
            allowOverlap: true, behindDocument: false, wrap: { type: TextWrappingType.NONE } },
          altText: { title: `Page ${index + 1} image`, description: 'Rendered PDF page' },
        })] })];
        canvas.width = 0; canvas.height = 0; canvas = null;
      } else {
        children = item.lines.map(line => new Paragraph({ spacing: { before: 0, after: 0 }, children: line.runs.map(run => new TextRun({
          text: run.text, font: 'Arial', size: Math.max(12, Math.min(288, Math.round(run.size * 2))),
        })) }));
      }
      const margin = item.image ? 0 : Math.min(36, item.geometry.widthPoints / 8, item.geometry.heightPoints / 8);
      const landscape = item.geometry.widthTwips > item.geometry.heightTwips;
      // docx swaps supplied size dimensions for landscape sections. Supply the
      // underlying portrait dimensions so final OOXML retains the actual ratio.
      sections.push({ properties: { type: SectionType.NEXT_PAGE,
        page: { size: { width: landscape ? item.geometry.heightTwips : item.geometry.widthTwips,
          height: landscape ? item.geometry.widthTwips : item.geometry.heightTwips, orientation: landscape ? 'landscape' : 'portrait' },
          margin: { top: margin * 20, bottom: margin * 20, left: margin * 20, right: margin * 20, header: 0, footer: 0 } } }, children });
      item.page.cleanup?.();
      options.onProgress?.({ completed: index + 1, total: pageCount, phase: 'exporting' });
      await abortable(platform.yield(), signal);
    }
    checkAbort(signal); options.onProgress?.({ completed: pageCount, total: pageCount, phase: 'packing' });
    const output = new Document({ creator: 'PDF Studio', lastModifiedBy: 'PDF Studio', title: '', subject: '', description: '', keywords: '', sections });
    result = new Uint8Array(await abortable(Packer.toArrayBuffer(output), signal)); checkAbort(signal);
  } catch (cause) { failure = cause; }
  finally {
    released = true;
    try { render?.cancel(); } catch (cause) { failure ??= cause; }
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    try { await destroy(document ?? candidate); } catch (cause) { failure ??= cause; }
  }
  if (failure) throw failure;
  options.onProgress?.({ completed: pageCount, total: pageCount, phase: 'done' });
  return { bytes: result, warnings };
}
