import { PDFDocument, PDFArray, PDFDict, PDFName, PDFStream, decodePDFRawStream } from 'pdf-lib';

export const DEFAULT_REDACTION_LIMITS = Object.freeze({ maxPages: 200, maxPagePixels: 16_000_000,
  maxTotalPixels: 128_000_000, maxSourceBytes: 100 * 1024 * 1024 });

function abortError() { const error = new Error('Redaction cancelled.'); error.name = 'AbortError'; return error; }
function checkAbort(signal) { if (signal?.aborted) throw abortError(); }
function abortable(promise, signal, cancel) {
  if (!signal) return Promise.resolve(promise);
  return new Promise((resolve, reject) => {
    const aborted = () => { try { Promise.resolve(cancel?.()).catch(() => {}); } catch { /* Main cleanup still runs. */ } reject(abortError()); };
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
    if (signal.aborted) aborted();
  });
}

export function validateRects(marks, pageCount, views) {
  if (!Array.isArray(marks) || !marks.length) throw new Error('Mark at least one area to redact.');
  return marks.map(mark => {
    if (!Number.isInteger(mark?.page) || mark.page < 0 || mark.page >= pageCount) throw new Error('A redaction references an invalid page.');
    const rect = mark.rect;
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite) || rect[0] >= rect[2] || rect[1] >= rect[3]) {
      throw new Error('Every redaction must have a finite, non-empty rectangle.');
    }
    const view = views[mark.page];
    if (!view || rect[0] < view[0] || rect[1] < view[1] || rect[2] > view[2] || rect[3] > view[3]) {
      throw new Error(`A redaction is outside the visible area of page ${mark.page + 1}.`);
    }
    return { page: mark.page, rect: [...rect] };
  });
}

export function pixelBounds(viewport, rect) {
  const converted = viewport.convertToViewportRectangle(rect);
  if (!converted?.every(Number.isFinite)) throw new Error('Invalid redaction pixel coordinates.');
  // Cover antialiased edge pixels too. Never leave a fractional-pixel seam.
  const left = Math.max(0, Math.floor(Math.min(converted[0], converted[2])) - 1);
  const top = Math.max(0, Math.floor(Math.min(converted[1], converted[3])) - 1);
  const right = Math.min(Math.ceil(viewport.width), Math.ceil(Math.max(converted[0], converted[2])) + 1);
  const bottom = Math.min(Math.ceil(viewport.height), Math.ceil(Math.max(converted[1], converted[3])) + 1);
  if (right <= left || bottom <= top) throw new Error('The redaction does not cover visible pixels.');
  return { x: left, y: top, width: right - left, height: bottom - top };
}

async function loadDocument(bytes, { signal }) {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  checkAbort(signal);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const loading = pdfjs.getDocument({ data: new Uint8Array(bytes), stopAtErrors: true, isEvalSupported: false });
  try { return await abortable(loading.promise, signal); }
  catch (cause) { try { await loading.destroy(); } catch { /* Preserve original failure. */ } throw cause; }
}

const browserPlatform = {
  createCanvas(width, height) { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas; },
  async toPng(canvas) {
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not encode redacted page.')), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  },
  yield: () => new Promise(resolve => setTimeout(resolve, 0)),
};

// A second, structural check of the freshly generated artifact. This never
// copies the input document: only decoded page images enter the output graph.
export async function assertImageOnlyPdf(bytes, expectedPages) {
  const output = await PDFDocument.load(bytes, { updateMetadata: false });
  if (output.getPageCount() !== expectedPages) throw new Error('Redacted output has an unexpected page count.');
  for (const key of output.catalog.keys()) if (!['Type', 'Pages'].includes(key.decodeText())) throw new Error('Unexpected document structure in redacted output.');
  const info = output.context.trailerInfo.Info && output.context.lookup(output.context.trailerInfo.Info, PDFDict);
  if (info && info.keys().some(key => !['Producer', 'Creator'].includes(key.decodeText()))) throw new Error('Unexpected metadata in redacted output.');
  for (const page of output.getPages()) {
    if (page.getRotation().angle !== 0 || page.node.has(PDFName.of('Annots'))) throw new Error('Unexpected annotation or rotation in redacted output.');
    const resources = page.node.Resources();
    const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict);
    if (fonts?.keys().length) throw new Error('Text fonts are forbidden in redacted output.');
    const images = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!images || images.keys().length !== 1) throw new Error('Every redacted page must contain exactly one image.');
    for (const ref of images.values()) {
      const image = output.context.lookup(ref, PDFStream);
      if (image.dict.lookup(PDFName.of('Subtype'))?.toString() !== '/Image' || image.dict.has(PDFName.of('SMask')) || image.dict.has(PDFName.of('Mask'))) {
        throw new Error('Redacted page images must be opaque.');
      }
    }
    const contents = page.node.lookup(PDFName.of('Contents'), PDFArray);
    const commands = Array.from({ length: contents.size() }, (_, i) => new TextDecoder().decode(decodePDFRawStream(output.context.lookup(contents.get(i))).decode())).join('\n');
    if (/\b(?:BT|ET|Tf|Tj|TJ|BDC|BMC|DP|MP)\b/.test(commands)) throw new Error('Text or marked content is forbidden in redacted output.');
  }
}

export async function redactToImagePdf(bytes, marks, options = {}) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength) throw new Error('Open a valid PDF before redacting.');
  const limits = { ...DEFAULT_REDACTION_LIMITS, ...options.limits };
  for (const [key, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value < 1 || value > DEFAULT_REDACTION_LIMITS[key]) throw new Error('Invalid redaction resource limit.');
  if (bytes.byteLength > limits.maxSourceBytes) throw new Error('This PDF exceeds the redaction input size limit.');
  if (!Array.isArray(marks) || !marks.length) throw new Error('Mark at least one area to redact.');
  const scale = options.scale ?? 3;
  if (!Number.isFinite(scale) || scale < 1 || scale > 4) throw new Error('Choose a redaction scale between 1 and 4.');
  const signal = options.signal;
  const platform = { ...browserPlatform, ...options.platform };
  let document;
  let canvas;
  let render;
  let failure;
  let result;
  let released = false;
  let candidate;
  const cleanup = new Map();
  const destroySource = source => {
    if (!source) return Promise.resolve();
    if (!cleanup.has(source)) cleanup.set(source, Promise.resolve().then(() => source.destroy()));
    return cleanup.get(source);
  };
  try {
    checkAbort(signal);
    const loading = Promise.resolve().then(() => (options.renderDocument ?? loadDocument)(new Uint8Array(bytes), { signal })).then(async source => {
      candidate = source;
      if (released || signal?.aborted) { await destroySource(source); throw abortError(); }
      return source;
    });
    document = await abortable(loading, signal);
    if (!Number.isInteger(document.numPages) || document.numPages < 1 || document.numPages > limits.maxPages) throw new Error(`Redaction supports at most ${limits.maxPages} pages.`);
    const pages = [];
    let totalPixels = 0;
    for (let index = 0; index < document.numPages; index++) {
      checkAbort(signal);
      const page = await abortable(document.getPage(index + 1), signal);
      const viewport = page.getViewport({ scale });
      const natural = page.getViewport({ scale: 1 });
      if (!Array.isArray(page.view) || page.view.length !== 4 || !page.view.every(Number.isFinite) || page.view[0] >= page.view[2] || page.view[1] >= page.view[3] ||
        ![viewport.width, viewport.height, natural.width, natural.height].every(value => Number.isFinite(value) && value > 0)) throw new Error(`Page ${index + 1} has invalid visible dimensions.`);
      const width = Math.ceil(viewport.width); const height = Math.ceil(viewport.height);
      const pixels = width * height;
      if (!Number.isSafeInteger(pixels) || pixels > limits.maxPagePixels || totalPixels + pixels > limits.maxTotalPixels) throw new Error('This PDF exceeds redaction pixel limits. Use fewer or smaller pages.');
      totalPixels += pixels;
      pages.push({ page, viewport, natural, width, height });
    }
    const valid = validateRects(marks, document.numPages, pages.map(item => item.page.view));
    // No output or canvas is created until all pages, marks and limits pass.
    const output = await PDFDocument.create({ updateMetadata: false });
    output.setProducer('PDF Studio image-only redaction'); output.setCreator('PDF Studio');
    options.onProgress?.({ completed: 0, total: pages.length, phase: 'rendering' });
    for (const [index, item] of pages.entries()) {
      checkAbort(signal);
      canvas = platform.createCanvas(item.width, item.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('A page canvas could not be created.');
      context.setTransform(1, 0, 0, 1, 0, 0); context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, item.width, item.height);
      render = item.page.render({ canvasContext: context, viewport: item.viewport, background: 'rgb(255,255,255)', intent: 'display' });
      await abortable(render.promise, signal, () => render?.cancel());
      render = null; checkAbort(signal);
      for (const mark of valid.filter(mark => mark.page === index)) {
        const box = pixelBounds(item.viewport, mark.rect);
        // putImageData bypasses renderer clipping, transforms, filters, alpha
        // and compositing. Every covered pixel is replaced, not overpainted.
        // Bounded tiles keep temporary mask allocation at most 1 MiB.
        for (let top = 0; top < box.height; top += 256) for (let left = 0; left < box.width; left += 1024) {
          checkAbort(signal);
          const mask = context.createImageData(Math.min(1024, box.width - left), Math.min(256, box.height - top));
          for (let alpha = 3; alpha < mask.data.length; alpha += 4) mask.data[alpha] = 255;
          context.putImageData(mask, box.x + left, box.y + top);
        }
      }
      const png = await abortable(platform.toPng(canvas), signal);
      checkAbort(signal);
      const image = await output.embedPng(png);
      const freshPage = output.addPage([item.natural.width, item.natural.height]);
      freshPage.drawImage(image, { x: 0, y: 0, width: item.natural.width, height: item.natural.height });
      // pdf-lib normalizes drawing pages with an empty Annots array. Remove
      // even that placeholder so the image-only output has no annotation key.
      freshPage.node.delete(PDFName.of('Annots'));
      canvas.width = 0; canvas.height = 0; canvas = null;
      item.page.cleanup?.();
      options.onProgress?.({ completed: index + 1, total: pages.length, phase: 'rendering' });
      await abortable(platform.yield(), signal);
    }
    checkAbort(signal);
    result = await output.save({ addDefaultPage: false });
    await assertImageOnlyPdf(result, pages.length); checkAbort(signal);
  } catch (cause) { failure = cause; }
  finally {
    released = true;
    try { render?.cancel(); } catch (cause) { failure ??= cause; }
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    try { await destroySource(document ?? candidate); } catch (cause) { failure ??= cause; }
  }
  if (failure) throw failure;
  options.onProgress?.({ completed: document.numPages, total: document.numPages, phase: 'done' });
  return result;
}
