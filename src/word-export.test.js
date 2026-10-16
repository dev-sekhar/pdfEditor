import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { cleanWordText, exportPdfToWord, groupTextLines, wordPageGeometry } from './word-export';

const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64'));
const item = (str, x, y, options = {}) => ({ str, transform: [12, 0, 0, 12, x, y], width: str.length * 6, height: 12, ...options });
function harness(contents = [[item('Page one', 20, 250)]], { sizes = [], rotation = [], failRender = -1 } = {}) {
  const canvases = []; const tasks = [];
  const pages = contents.map((items, index) => {
    const [width, height] = sizes[index] ?? [300, 400];
    return { cleanup: vi.fn(), getTextContent: vi.fn(async () => ({ items })),
      getViewport: vi.fn(({ scale }) => ({ width: (rotation[index] === 90 ? height : width) * scale,
        height: (rotation[index] === 90 ? width : height) * scale,
        convertToViewportPoint: (x, y) => rotation[index] === 90 ? [y * scale, x * scale] : [x * scale, (height - y) * scale] })),
      render: vi.fn(() => { const task = { promise: index === failRender ? Promise.reject(new Error('Render failed')) : Promise.resolve(), cancel: vi.fn() }; tasks.push(task); return task; }),
    };
  });
  const document = { numPages: pages.length, getPage: vi.fn(async number => pages[number - 1]), destroy: vi.fn().mockResolvedValue(undefined) };
  const platform = { createCanvas: vi.fn((width, height) => {
    const canvas = { width, height, context: { setTransform: vi.fn(), fillRect: vi.fn() } };
    canvas.getContext = vi.fn(() => canvas.context); canvases.push(canvas); return canvas;
  }), toPng: vi.fn(async () => png), yield: vi.fn().mockResolvedValue(undefined) };
  return { document, pages, canvases, tasks, platform, options: { renderDocument: vi.fn(async () => document), platform } };
}
const input = () => new Uint8Array([37, 80, 68, 70, 1, 2, 3]);
async function xml(result) { const zip = await JSZip.loadAsync(result.bytes); return { zip, body: await zip.file('word/document.xml').async('string') }; }

describe('Word export reading order and source fidelity', () => {
  it('groups unsorted runs by visual baseline and x, preserving Unicode, source line breaks and sensible spaces', () => {
    const h = harness(); const viewport = h.pages[0].getViewport({ scale: 1 });
    const lines = groupTextLines([item('world', 70, 249), item('Hello', 10, 250), item('Résumé 日本語 &<>', 10, 220, { hasEOL: true }), item('Next\nline', 10, 180)], viewport);
    expect(lines.map(line => line.text)).toEqual(['Hello world', 'Résumé 日本語 &<>', 'Next', 'line']);
    expect(lines[0].runs[0].size).toBe(12);
    expect(cleanWordText('A\u0000B\u000bC\ud800')).toBe('ABC\ufffd');
  });

  it('packages editable Unicode paragraphs with XML escaping, actual page order and no source metadata or invented headings', async () => {
    const h = harness([[item('Résumé 日本語 &<>', 10, 250)], [item('Second page', 10, 250)]]);
    const bytes = input(); const copy = new Uint8Array(bytes); const progress = vi.fn();
    const result = await exportPdfToWord(bytes, { ...h.options, mode: 'text', onProgress: progress });
    const { zip, body } = await xml(result);
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(body).toContain('Résumé 日本語 &amp;&lt;&gt;');
    expect(body.indexOf('Résumé')).toBeLessThan(body.indexOf('Second page'));
    expect(body.match(/<w:sectPr[ >]/g)).toHaveLength(2);
    expect(body).not.toMatch(/Heading|<w:drawing|PRIVATE SOURCE/i);
    expect(await zip.file('docProps/core.xml').async('string')).toContain('PDF Studio');
    expect(Object.keys(zip.files).some(name => /\.pdf$|embeddings\//i.test(name))).toBe(false);
    expect(h.platform.createCanvas).not.toHaveBeenCalled();
    expect(h.document.destroy).toHaveBeenCalledOnce(); expect(bytes).toEqual(copy);
    expect(h.options.renderDocument.mock.calls[0][0]).not.toBe(bytes);
    expect(progress).toHaveBeenLastCalledWith({ completed: 2, total: 2, phase: 'done' });
  });

  it('includes scanned pages as PNG images with aggregate OCR warning, preserving rotated ratio and orientation', async () => {
    const h = harness([[item('Editable', 20, 250)], []], { sizes: [[300, 400], [300, 600]], rotation: [0, 90] });
    const result = await exportPdfToWord(input(), { ...h.options, mode: 'text' });
    const { zip, body } = await xml(result);
    expect(body).toContain('Editable');
    expect(body.match(/<w:drawing>/g)).toHaveLength(1);
    expect(body).toContain('<w:pgSz w:w="12000" w:h="6000" w:orient="landscape"');
    expect(body).toContain('cx="7620000" cy="3810000"'); // 600pt x 300pt displayed at 96DPI.
    expect(result.warnings.some(text => /1 page had no extractable text/.test(text))).toBe(true);
    expect(h.platform.createCanvas).toHaveBeenCalledWith(1200, 600); // Actual rendering is 144 DPI.
    const media = Object.keys(zip.files).filter(name => /^word\/media\/.*\.png$/.test(name));
    expect(media).toHaveLength(1); expect(await zip.file(media[0]).async('uint8array')).toEqual(png);
    expect(h.canvases[0].width).toBe(0); expect(h.canvases[0].height).toBe(0);
    expect(h.canvases[0].getContext).toHaveBeenCalledWith('2d', { alpha: false });
  });

  it('exports image mode without extracting text and scales oversized page display uniformly to Word limits', async () => {
    const h = harness([[]], { sizes: [[2000, 1000]] });
    const result = await exportPdfToWord(input(), { ...h.options, mode: 'images' });
    const { body } = await xml(result);
    expect(h.pages[0].getTextContent).not.toHaveBeenCalled();
    expect(body).toContain('<w:pgSz w:w="31680" w:h="15840" w:orient="landscape"');
    expect(body).toContain('cx="20116800" cy="10058400"');
    expect(result.warnings.some(text => /1 page was scaled uniformly/.test(text))).toBe(true);
    const geometry = wordPageGeometry({ width: 2000, height: 1000 });
    expect(geometry.imageWidth / geometry.imageHeight).toBe(2);
    expect(geometry.widthTwips).toBe(31680);
  });
});

describe('Word export cancellation, errors and limits', () => {
  it('preflights page/image/text resource limits before creating any canvas', async () => {
    for (const [limits, mode] of [[{ maxPages: 1 }, 'images'], [{ maxPagePixels: 10 }, 'images'], [{ maxTotalPixels: 500_000 }, 'images'], [{ maxTextCharacters: 1 }, 'text']]) {
      const h = harness([[item('Text', 10, 250)], []]);
      await expect(exportPdfToWord(input(), { ...h.options, mode, limits })).rejects.toThrow(/limit|at most/);
      expect(h.platform.createCanvas).not.toHaveBeenCalled(); expect(h.document.destroy).toHaveBeenCalledOnce();
    }
  });

  it('does not silently skip a page after text extraction, render or PNG errors', async () => {
    for (const type of ['text', 'render', 'png']) {
      const h = harness([type === 'text' ? [item('Text', 10, 250)] : []], { failRender: type === 'render' ? 0 : -1 });
      if (type === 'text') h.pages[0].getTextContent.mockRejectedValue(new Error('Text failed'));
      if (type === 'png') h.platform.toPng.mockRejectedValue(new Error('PNG failed'));
      await expect(exportPdfToWord(input(), { ...h.options, mode: 'text' })).rejects.toThrow(/failed/);
      expect(h.document.destroy).toHaveBeenCalledOnce();
      expect(h.canvases.every(canvas => canvas.width === 0 && canvas.height === 0)).toBe(true);
    }
  });

  it('cancels active rendering and clears the canvas without returning a document', async () => {
    const h = harness([[]]); const controller = new AbortController(); let started;
    const ready = new Promise(resolve => { started = resolve; }); const cancel = vi.fn();
    h.pages[0].render.mockImplementation(() => { started(); return { cancel, promise: new Promise(() => {}) }; });
    const result = exportPdfToWord(input(), { ...h.options, mode: 'images', signal: controller.signal });
    await ready; controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalled(); expect(h.document.destroy).toHaveBeenCalledOnce();
    expect(h.canvases[0].width).toBe(0); expect(h.platform.toPng).not.toHaveBeenCalled();
  });

  it('destroys a document acquired after cancellation and does not mutate caller bytes', async () => {
    const h = harness(); const controller = new AbortController(); let started; let resolveDocument;
    const ready = new Promise(resolve => { started = resolve; });
    h.options.renderDocument = vi.fn(() => { started(); return new Promise(resolve => { resolveDocument = resolve; }); });
    const bytes = input(); const copy = new Uint8Array(bytes);
    const result = exportPdfToWord(bytes, { ...h.options, mode: 'text', signal: controller.signal });
    await ready; controller.abort(); await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    resolveDocument(h.document); await vi.waitFor(() => expect(h.document.destroy).toHaveBeenCalledOnce());
    expect(bytes).toEqual(copy); expect(h.platform.createCanvas).not.toHaveBeenCalled();
  });

  it('rejects invalid mode/input, pre-cancelled operations and cleanup failures', async () => {
    const h = harness();
    await expect(exportPdfToWord(input(), { ...h.options, mode: 'pdf' })).rejects.toThrow('Choose');
    await expect(exportPdfToWord(new Uint8Array(), { ...h.options, mode: 'text' })).rejects.toThrow('Open');
    const controller = new AbortController(); controller.abort();
    await expect(exportPdfToWord(input(), { ...h.options, mode: 'text', signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.options.renderDocument).not.toHaveBeenCalled();
    h.document.destroy.mockRejectedValue(new Error('Cleanup failed'));
    await expect(exportPdfToWord(input(), { ...h.options, mode: 'text' })).rejects.toThrow('Cleanup failed');
  });
});
