import { describe, expect, it, vi } from 'vitest';
import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFStream, decodePDFRawStream, StandardFonts } from 'pdf-lib';
import { redactToImagePdf, validateRects, pixelBounds, assertImageOnlyPdf } from './redaction';

function crc(bytes) { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; }
function chunk(type, bytes) {
  const name = Buffer.from(type); const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc(Buffer.concat([name, bytes])));
  return Buffer.concat([size, name, bytes, checksum]);
}
function png(canvas) {
  const header = Buffer.alloc(13); header.writeUInt32BE(canvas.width); header.writeUInt32BE(canvas.height, 4); header[8] = 8; header[9] = 2;
  const rows = Buffer.alloc((canvas.width * 3 + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y++) Buffer.from(canvas.pixels.subarray(y * canvas.width * 3, (y + 1) * canvas.width * 3)).copy(rows, y * (canvas.width * 3 + 1) + 1);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
}

function setup({ views = [[0, 0, 8, 6]], rotations = [], rejectRender = -1, rejectEncode = false } = {}) {
  const canvases = []; const tasks = [];
  const pages = views.map((view, index) => ({ view, cleanup: vi.fn(),
    getViewport({ scale }) {
      const [x0, y0, x1, y1] = view; const rotation = rotations[index] ?? 0;
      const point = (x, y) => ({
        0: [(x - x0) * scale, (y1 - y) * scale],
        90: [(y - y0) * scale, (x - x0) * scale],
        180: [(x1 - x) * scale, (y - y0) * scale],
        270: [(y1 - y) * scale, (x1 - x) * scale],
      })[rotation];
      return { width: (rotation % 180 ? y1 - y0 : x1 - x0) * scale,
        height: (rotation % 180 ? x1 - x0 : y1 - y0) * scale,
        convertToViewportRectangle: rect => [...point(rect[0], rect[1]), ...point(rect[2], rect[3])] };
    },
    render: vi.fn(({ canvasContext, viewport }) => {
      canvasContext.fillStyle = '#ff0000'; canvasContext.fillRect(0, 0, viewport.width, viewport.height);
      const task = { cancel: vi.fn(), promise: index === rejectRender ? Promise.reject(new Error('Decode failed')) : Promise.resolve() };
      tasks.push(task); return task;
    }),
  }));
  const document = { numPages: pages.length, getPage: vi.fn(async number => pages[number - 1]), destroy: vi.fn().mockResolvedValue(undefined) };
  const platform = {
    createCanvas: vi.fn((width, height) => {
      const canvas = { width, height, pixels: new Uint8Array(width * height * 3), fills: [], masks: [] };
      const context = { setTransform: vi.fn(), fillStyle: '',
        createImageData: vi.fn((width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) })),
        putImageData: vi.fn((image, x, y) => {
          canvas.masks.push({ x, y, width: image.width, height: image.height, data: new Uint8Array(image.data) });
          for (let row = 0; row < image.height; row++) for (let column = 0; column < image.width; column++) {
            const source = (row * image.width + column) * 4;
            canvas.pixels.set(image.data.subarray(source, source + 3), ((y + row) * width + x + column) * 3);
          }
        }),
        fillRect(x, y, w, h) {
          canvas.fills.push({ color: this.fillStyle, x, y, width: w, height: h });
          const color = this.fillStyle === '#ffffff' ? [255, 255, 255] : this.fillStyle === '#ff0000' ? [255, 0, 0] : [0, 0, 0];
          for (let cy = Math.max(0, Math.floor(y)); cy < Math.min(height, Math.ceil(y + h)); cy++) for (let cx = Math.max(0, Math.floor(x)); cx < Math.min(width, Math.ceil(x + w)); cx++) canvas.pixels.set(color, (cy * width + cx) * 3);
        },
      };
      canvas.getContext = vi.fn(() => context); canvases.push(canvas); return canvas;
    }),
    toPng: vi.fn(async canvas => { if (rejectEncode) throw new Error('PNG failed'); return png(canvas); }),
    yield: vi.fn().mockResolvedValue(undefined),
  };
  return { document, pages, tasks, canvases, platform, options: { renderDocument: vi.fn(async () => document), platform } };
}
async function source() {
  const document = await PDFDocument.create(); const page = document.addPage();
  page.drawText('DO NOT RECOVER THIS SECRET', { font: await document.embedFont(StandardFonts.Helvetica) });
  document.setTitle('Private title'); document.setAuthor('Private author');
  page.node.set(PDFName.of('Annots'), document.context.obj([{ Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 10, 10], Contents: 'Private note' }]));
  await document.attach(new Uint8Array([1, 2, 3]), 'private.txt');
  return document.save();
}

describe('fresh image-only PDF redaction', () => {
  it('rejects empty, malformed, bad-page, and outside/crop-hidden marks before rendering', async () => {
    const h = setup({ views: [[10, 20, 30, 40]] });
    const bytes = await source();
    for (const marks of [[], [{ page: 1, rect: [10, 20, 11, 21] }], [{ page: 0, rect: [10, 20, 10, 22] }],
      [{ page: 0, rect: [9, 20, 15, 25] }], [{ page: 0, rect: [0, 0, 5, 5] }], [{ page: 0, rect: [10, NaN, 15, 25] }]]) {
      await expect(redactToImagePdf(bytes, marks, h.options)).rejects.toThrow();
    }
    expect(h.platform.createCanvas).not.toHaveBeenCalled();
    expect(h.pages[0].render).not.toHaveBeenCalled();
    expect(h.document.destroy).toHaveBeenCalledTimes(5); // Empty marks fail before loading a document.
  });

  it('calculates outward masks for all rotations, zoom and nonzero crop offsets without mutating marks', () => {
    for (const rotation of [0, 90, 180, 270]) {
      const h = setup({ views: [[10, 20, 30, 35]], rotations: [rotation] });
      const mark = { page: 0, rect: [12.1, 23.2, 16.3, 27.4] };
      expect(validateRects([mark], 1, [h.pages[0].view])).toEqual([mark]);
      const bounds = pixelBounds(h.pages[0].getViewport({ scale: 3 }), mark.rect);
      expect(bounds.width).toBeGreaterThan(12);
      expect(bounds.height).toBeGreaterThan(12);
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(mark.rect).toEqual([12.1, 23.2, 16.3, 27.4]);
    }
    const h = setup();
    expect(pixelBounds(h.pages[0].getViewport({ scale: 3 }), [0, 0, 8, 6])).toEqual({ x: 0, y: 0, width: 24, height: 18 });
  });

  it('rebuilds every page as opaque image-only with flattened crop/rotation, burnt pixels, and no source text/metadata/attachments', async () => {
    const bytes = await source(); const original = new Uint8Array(bytes);
    const h = setup({ views: [[10, 20, 18, 26], [0, 0, 4, 3]], rotations: [90, 0] });
    const progress = vi.fn();
    const result = await redactToImagePdf(bytes, [{ page: 0, rect: [12, 21, 14, 23] }], { ...h.options, onProgress: progress });
    expect(bytes).toEqual(original);
    await expect(assertImageOnlyPdf(result, 2)).resolves.toBeUndefined();
    const output = await PDFDocument.load(result, { updateMetadata: false });
    expect(output.getPage(0).getSize()).toEqual({ width: 6, height: 8 });
    expect(output.getPage(0).getRotation().angle).toBe(0);
    expect(output.getTitle()).toBeUndefined(); expect(output.getAuthor()).toBeUndefined();
    expect(output.catalog.has(PDFName.of('Names'))).toBe(false);
    const images = output.getPage(0).node.Resources().lookup(PDFName.of('XObject'), PDFDict);
    const image = output.context.lookup(images.values()[0], PDFStream);
    expect(image.dict.lookup(PDFName.of('Width')).asNumber()).toBe(18);
    expect(image.dict.lookup(PDFName.of('Height')).asNumber()).toBe(24);
    const pixels = decodePDFRawStream(image).decode();
    const black = h.canvases[0].masks[0];
    for (let pixel = 0; pixel < black.data.length; pixel += 4) expect([...black.data.slice(pixel, pixel + 4)]).toEqual([0, 0, 0, 255]);
    expect(h.canvases[0].fills.some(fill => fill.color === '#000000')).toBe(false);
    const index = ((black.y + 1) * 18 + black.x + 1) * 3;
    expect([...pixels.slice(index, index + 3)]).toEqual([0, 0, 0]);
    expect([...pixels.slice(0, 3)]).toEqual([255, 0, 0]); // Unmarked visible content survives as pixels.
    expect(h.canvases.every(canvas => canvas.width === 0 && canvas.height === 0)).toBe(true);
    expect(h.document.destroy).toHaveBeenCalledOnce();
    expect(h.platform.yield).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith({ completed: 2, total: 2, phase: 'done' });
  });

  it('preflights total and per-page resource limits without creating a canvas', async () => {
    const bytes = await source();
    for (const limits of [{ maxPages: 1 }, { maxPagePixels: 10 }, { maxTotalPixels: 500 }]) {
      const h = setup({ views: [[0, 0, 8, 6], [0, 0, 8, 6]] });
      await expect(redactToImagePdf(bytes, [{ page: 0, rect: [1, 1, 2, 2] }], { ...h.options, limits })).rejects.toThrow(/limit|at most/);
      expect(h.platform.createCanvas).not.toHaveBeenCalled(); expect(h.document.destroy).toHaveBeenCalledOnce();
    }
  });

  it('fails closed on a page decode or PNG error, clears active canvas, and destroys the source', async () => {
    const bytes = await source();
    for (const option of [{ rejectRender: 0 }, { rejectEncode: true }]) {
      const h = setup(option);
      await expect(redactToImagePdf(bytes, [{ page: 0, rect: [1, 1, 2, 2] }], h.options)).rejects.toThrow(/failed/);
      expect(h.canvases[0].width).toBe(0); expect(h.canvases[0].height).toBe(0);
      expect(h.document.destroy).toHaveBeenCalledOnce();
    }
  });

  it('cancels active rendering and releases the source/canvas without producing an output', async () => {
    const bytes = await source(); const h = setup(); const controller = new AbortController();
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    const cancel = vi.fn();
    h.pages[0].render = vi.fn(() => { started(); return { cancel, promise: new Promise(() => {}) }; });
    const result = redactToImagePdf(bytes, [{ page: 0, rect: [1, 1, 2, 2] }], { ...h.options, signal: controller.signal });
    await ready; controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalled(); expect(h.document.destroy).toHaveBeenCalledOnce();
    expect(h.canvases[0].width).toBe(0); expect(h.platform.toPng).not.toHaveBeenCalled();
  });

  it('rejects an already-cancelled operation without loading the source', async () => {
    const h = setup(); const controller = new AbortController(); controller.abort();
    await expect(redactToImagePdf(await source(), [{ page: 0, rect: [1, 1, 2, 2] }], { ...h.options, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.options.renderDocument).not.toHaveBeenCalled();
  });

  it('destroys a document that resolves after its loading operation was cancelled', async () => {
    const h = setup(); const controller = new AbortController(); let resolveDocument;
    let started; const ready = new Promise(resolve => { started = resolve; });
    h.options.renderDocument = vi.fn(() => { started(); return new Promise(resolve => { resolveDocument = resolve; }); });
    const operation = redactToImagePdf(await source(), [{ page: 0, rect: [1, 1, 2, 2] }], { ...h.options, signal: controller.signal });
    await ready; controller.abort(); await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    resolveDocument(h.document);
    await vi.waitFor(() => expect(h.document.destroy).toHaveBeenCalledOnce());
    expect(h.platform.createCanvas).not.toHaveBeenCalled();
  });

  it('does not return an apparently successful result if source cleanup fails', async () => {
    const h = setup(); h.document.destroy.mockRejectedValue(new Error('Cleanup failed'));
    await expect(redactToImagePdf(await source(), [{ page: 0, rect: [1, 1, 2, 2] }], h.options)).rejects.toThrow('Cleanup failed');
  });
});
