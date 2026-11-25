import { PDFDocument, PDFArray, PDFDict, PDFName, PDFRawStream, PDFString, PDFHexString, StandardFonts, decodePDFRawStream } from 'pdf-lib';
import { requireEditableForm } from './form-diagnostics';

const unsupported = () => { throw new Error('This page uses unsupported content. Only simple horizontal, single-run text in standard Latin fonts can be edited. Use Add text for a clearly labeled overlay.'); };
const latin = value => Array.from(value, c => c.charCodeAt(0)).every(c => c >= 32 && c <= 126);

// Deliberately small content grammar. Never guess at glyph encodings, text
// positioning, shared XObjects, clipping, kerning arrays, or graphics state.
function tokens(source) {
  const result = [];
  const pattern = /\s+|%[^\r\n]*|\((?:\\[\s\S]|[^()\\])*\)|<[\da-fA-F\s]*>|\/[A-Za-z0-9_.+-]+|[-+]?(?:\d+\.?\d*|\.\d+)|[A-Za-z*]+/y;
  let offset = 0;
  while (offset < source.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    if (!match) unsupported();
    offset = pattern.lastIndex;
    if (!/^\s|^%/.test(match[0])) result.push({ raw: match[0], start: match.index, end: offset });
  }
  return result;
}

async function analyze(bytes, pageIndex) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  requireEditableForm(doc);
  const page = doc.getPage(pageIndex);
  if (!page) unsupported();
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map(ref => doc.context.lookup(ref)) : contents ? [contents] : [];
  const fonts = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
  const runs = [], decoded = [];
  let depth = 0;
  for (const [streamIndex, stream] of streams.entries()) {
    if (!(stream instanceof PDFRawStream)) unsupported();
    const source = new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode());
    decoded.push(source);
    let inText = false, font, size, matrix, shown = false;
    let args = [];
    for (const token of tokens(source)) {
      if (!/^[A-Za-z*]+$/.test(token.raw)) { args.push(token); continue; }
      const op = token.raw, nums = args.map(x => Number(x.raw));
      const numeric = n => args.length === n && nums.every(Number.isFinite);
      if (op === 'q' && !inText && !args.length) depth++;
      else if (op === 'Q' && !inText && !args.length && depth > 0) depth--;
      else if (op === 'BT' && !inText && !args.length) { inText = true; font = null; size = null; matrix = null; shown = false; }
      else if (op === 'ET' && inText && !args.length) inText = false;
      else if (op === 'Tf' && inText && args.length === 2 && args[0].raw.startsWith('/') && Number.isFinite(nums[1]) && nums[1] > 0) {
        font = fonts?.lookupMaybe(PDFName.of(args[0].raw.slice(1)), PDFDict); size = nums[1];
      } else if (op === 'Tm' && inText && numeric(6) && nums.slice(0,4).join(',') === '1,0,0,1' && !shown) matrix = nums;
      else if (op === 'TL' && inText && numeric(1)) { /* no second text show allowed */ }
      else if (op === 'T*' && inText && shown && !args.length) { /* terminal line advance */ }
      else if ((op === 'rg' && numeric(3)) || (op === 'g' && numeric(1))) { /* retain fill color */ }
      else if (op === 'Tj' && inText && !shown && matrix && font && args.length === 1) {
        const base = font.lookup(PDFName.of('BaseFont'))?.toString().slice(1);
        const encoding = font.lookup(PDFName.of('Encoding'))?.toString();
        if (font.lookup(PDFName.of('Subtype'))?.toString() !== '/Type1' || !Object.values(StandardFonts).includes(base) || /Symbol|Zapf/.test(base) || ['ToUnicode', 'FontDescriptor', 'Widths'].some(key => font.has(PDFName.of(key))) || (encoding && encoding !== '/WinAnsiEncoding')) unsupported();
        const value = args[0].raw;
        if (!value.startsWith('(') && !value.startsWith('<')) unsupported();
        const text = value.startsWith('(') ? PDFString.of(value.slice(1,-1)).decodeText() : PDFHexString.of(value.slice(1,-1)).decodeText();
        if (!latin(text)) unsupported();
        const metrics = await doc.embedFont(base);
        const width = metrics.widthOfTextAtSize(text, size);
        const [, , , , x, y] = matrix;
        const box = page.getCropBox();
        if (x < box.x || y < box.y || x + width > box.x + box.width || y + size > box.y + box.height) unsupported();
        runs.push({ id: runs.length, streamIndex, start: args[0].start, end: args[0].end, text, x, y, size, width, base });
        shown = true;
      } else unsupported();
      args = [];
    }
    if (inText || args.length) unsupported();
  }
  if (depth) unsupported();
  // Overlapping text cannot be safely hit-tested or replaced.
  for (const a of runs) for (const b of runs) if (a.id < b.id && a.x < b.x+b.width && b.x < a.x+a.width && a.y < b.y+b.size && b.y < a.y+a.size) unsupported();
  return { doc, page, streams, decoded, runs };
}

export async function inspectInlineText(bytes, pageIndex) {
  return (await analyze(bytes, pageIndex)).runs;
}

export async function replaceInlineText(bytes, pageIndex, id, expected, value) {
  if (typeof value !== 'string' || !latin(value)) throw new Error('Use printable basic Latin characters; multiline and other scripts are unsupported.');
  const { doc, page, streams, decoded, runs } = await analyze(bytes, pageIndex);
  const run = runs.find(item => item.id === id);
  if (!run || run.text !== expected) throw new Error('The selected text changed. Select it again.');
  const font = await doc.embedFont(run.base);
  if (font.widthOfTextAtSize(value, run.size) > run.width + 0.01) throw new Error('Replacement must fit the original text width. Reflow and font substitution are unsupported.');
  const source = decoded[run.streamIndex];
  const next = source.slice(0, run.start) + font.encodeText(value).toString() + source.slice(run.end);
  // Give this page a new stream; shared original streams remain untouched.
  const refs = streams.map((stream, index) => doc.context.register(index === run.streamIndex ? doc.context.flateStream(next) : stream));
  page.node.set(PDFName.of('Contents'), doc.context.obj(refs));
  return new Uint8Array(await doc.save({ updateFieldAppearances: false }));
}
