import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
const { PDFDocument, PDFName, PDFArray, PDFDict, PDFHexString, StandardFonts, rgb, degrees, decodePDFRawStream } = createRequire(import.meta.url)('pdf-lib');
const REDACTIONS = [[50, 240, 240, 340], [120, 120, 220, 180]];

// Lossless PNG fixture with a distinctive sensitive RGB pattern.
function patternedPng() {
  const crc = bytes => {
    let result = 0xffffffff;
    for (const byte of bytes) {
      result ^= byte;
      for (let bit = 0; bit < 8; bit++) result = (result >>> 1) ^ ((result & 1) ? 0xedb88320 : 0);
    }
    return (result ^ 0xffffffff) >>> 0;
  };
  const chunk = (kind, bytes) => {
    const type = Buffer.from(kind); const result = Buffer.alloc(bytes.length + 12);
    result.writeUInt32BE(bytes.length); type.copy(result, 4); bytes.copy(result, 8);
    result.writeUInt32BE(crc(Buffer.concat([type, bytes])), bytes.length + 8); return result;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(16); header.writeUInt32BE(16, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(16 * (1 + 16 * 3));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const offset = y * 49 + 1 + x * 3;
    pixels[offset] = 180 + x * 4; pixels[offset + 1] = y * 7; pixels[offset + 2] = 200;
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

async function sensitiveFixture() {
  const document = await PDFDocument.create(); const font = await document.embedFont(StandardFonts.Helvetica);
  const first = document.addPage([300, 400]);
  first.drawText('VISIBLE_SECRET_4829', { x: 60, y: 260, size: 10, font });
  first.drawText('HIDDEN_OCR_SECRET_7315', { x: 60, y: 250, size: 8, font, opacity: 0 });
  first.drawImage(await document.embedPng(patternedPng()), { x: 60, y: 280, width: 80, height: 40 });
  first.drawRectangle({ x: 20, y: 40, width: 40, height: 40, color: rgb(0, 0.8, 0) });
  first.drawText('Public information', { x: 20, y: 100, size: 12, font });
  const note = document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Text',
    Rect: [250, 350, 270, 370], Contents: PDFHexString.fromText('COMMENT_SECRET_2187'),
    T: PDFHexString.fromText('External author'), Name: 'Comment' }));
  const link = document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [50, 240, 240, 340],
    A: { S: 'URI', URI: PDFHexString.fromText('https://example.invalid/LINK_SECRET_6651') } }));
  first.node.set(PDFName.of('Annots'), document.context.obj([note, link]));
  const field = document.getForm().createTextField('secret-field'); field.setText('FORM_SECRET_1536');
  field.addToPage(first, { x: 60, y: 242, width: 150, height: 14, fontSize: 8 });
  document.setTitle('METADATA_SECRET_3348'); document.setSubject('Sensitive source');
  document.catalog.set(PDFName.of('Metadata'), document.context.register(document.context.stream(
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">XMP_SECRET_7052</x:xmpmeta>', { Type: 'Metadata', Subtype: 'XML' })));
  await document.attach(new TextEncoder().encode('ATTACHMENT_SECRET_8824'), 'sensitive.txt');
  const second = document.addPage([400, 300]); second.setCropBox(40, 30, 300, 200); second.setRotation(degrees(90));
  second.drawText('ROTATED_SECRET_9271', { x: 130, y: 145, size: 8, font });
  second.drawRectangle({ x: 135, y: 130, width: 30, height: 10, color: rgb(0.9, 0, 0.9) });
  second.drawRectangle({ x: 60, y: 50, width: 30, height: 30, color: rgb(0, 0.2, 1) });
  return Buffer.from(await document.save());
}

async function inspectWithReader(page, bytes, samplePoints) {
  return page.evaluate(async ({ data, points }) => {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
    const task = pdfjs.getDocument({ data: new Uint8Array(data) });
    try {
      const document = await task.promise; const result = [];
      for (let i = 1; i <= document.numPages; i++) {
        const pdfPage = await document.getPage(i); const viewport = pdfPage.getViewport({ scale: 1 });
        const canvas = window.document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d'); await pdfPage.render({ canvasContext: context, viewport }).promise;
        result.push({ width: viewport.width, height: viewport.height, rotation: pdfPage.rotate,
          text: (await pdfPage.getTextContent()).items.map(item => item.str).join(''),
          pixels: points[i - 1].map(([x, y]) => Array.from(context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data)) });
      }
      return result;
    } finally { await task.destroy(); }
  }, { data: Array.from(bytes), points: samplePoints });
}

async function fixtureGeometry(page, bytes) {
  return page.evaluate(async ({ data, rectangles }) => {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
    const task = pdfjs.getDocument({ data: new Uint8Array(data) });
    try {
      const document = await task.promise; const result = [];
      const sourcePoints = [[[95, 300], [40, 60]], [[150, 135], [75, 65]]];
      for (let index = 0; index < rectangles.length; index++) {
        const pdfPage = await document.getPage(index + 1); const viewport = pdfPage.getViewport({ scale: 1 });
        result.push({ width: viewport.width, height: viewport.height,
          rect: viewport.convertToViewportRectangle(rectangles[index]),
          samples: sourcePoints[index].map(point => viewport.convertToViewportPoint(...point)) });
      }
      return result;
    } finally { await task.destroy(); }
  }, { data: Array.from(bytes), rectangles: REDACTIONS });
}

async function markArea(page, geometry) {
  await page.getByLabel('Zoom level').selectOption('100');
  const enable = page.getByRole('button', { name: 'Mark redaction areas', exact: true });
  if (await enable.count()) await enable.click();
  const surface = page.getByLabel('Redaction marking canvas'); await expect(surface).toBeVisible();
  await expect(surface).toHaveAttribute('width', String(geometry.width));
  const box = await surface.boundingBox();
  const [x1, y1, x2, y2] = geometry.rect;
  const scale = box.width / geometry.width;
  await page.mouse.move(box.x + Math.min(x1, x2) * scale, box.y + Math.min(y1, y2) * scale);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.max(x1, x2) * scale, box.y + Math.max(y1, y2) * scale, { steps: 5 });
  await page.mouse.up();
}

function assertFreshImageOnly(bytes, expectedDimensions) {
  return PDFDocument.load(bytes).then(document => {
    for (const key of ['AcroForm', 'Names', 'Metadata', 'OpenAction', 'AA']) expect(document.catalog.get(PDFName.of(key))).toBeUndefined();
    expect(document.getTitle()).not.toBe('METADATA_SECRET_3348');
    document.getPages().forEach((pdfPage, index) => {
      expect(pdfPage.getRotation().angle).toBe(0);
      expect(pdfPage.getWidth()).toBeCloseTo(expectedDimensions[index].width, 3);
      expect(pdfPage.getHeight()).toBeCloseTo(expectedDimensions[index].height, 3);
      expect(pdfPage.node.lookupMaybe(PDFName.of('Annots'), PDFArray)?.size() ?? 0).toBe(0);
      const resources = pdfPage.node.Resources();
      expect(resources.lookupMaybe(PDFName.of('Font'), PDFDict)?.keys().length ?? 0).toBe(0);
      const objects = resources.lookup(PDFName.of('XObject'), PDFDict);
      expect(objects.keys()).toHaveLength(1);
      for (const ref of objects.values()) expect(document.context.lookup(ref).dict.get(PDFName.of('Subtype')).toString()).toBe('/Image');
      const streams = pdfPage.node.lookup(PDFName.of('Contents'), PDFArray);
      const commands = Array.from({ length: streams.size() }, (_, i) => new TextDecoder().decode(
        decodePDFRawStream(document.context.lookup(streams.get(i))).decode())).join('\n');
      expect(commands).not.toMatch(/\b(BT|ET|Tj|TJ)\b/);
      expect(commands).toMatch(/\bDo\b/);
    });
  });
}

async function assertEmbeddedPixels(bytes, geometry, before) {
  const document = await PDFDocument.load(bytes);
  document.getPages().forEach((pdfPage, index) => {
    const objects = pdfPage.node.Resources().lookup(PDFName.of('XObject'), PDFDict);
    const image = document.context.lookup(objects.values()[0]);
    const width = image.dict.lookup(PDFName.of('Width')).asNumber();
    const height = image.dict.lookup(PDFName.of('Height')).asNumber();
    expect(width).toBe(Math.ceil(geometry[index].width * 3));
    expect(height).toBe(Math.ceil(geometry[index].height * 3));
    expect(image.dict.lookup(PDFName.of('BitsPerComponent')).asNumber()).toBe(8);
    expect(image.dict.get(PDFName.of('ColorSpace')).toString()).toBe('/DeviceRGB');
    const raw = decodePDFRawStream(image).decode();
    expect(raw.length).toBe(width * height * 3);
    geometry[index].samples.forEach(([x, y], sampleIndex) => {
      const offset = (Math.floor(y * 3) * width + Math.floor(x * 3)) * 3;
      const pixel = Array.from(raw.slice(offset, offset + 3));
      expect(pixel).toEqual(sampleIndex === 0 ? [0, 0, 0] : before[index].pixels[1].slice(0, 3));
    });
  });
}

test('real browser core sanitizes the original complete object graph and burns native-resolution RGB pixels', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen', '0.10.0'));
  const original = await sensitiveFixture(); await page.goto('/');
  const source = await PDFDocument.load(original);
  expect(source.catalog.has(PDFName.of('AcroForm'))).toBe(true);
  expect(source.catalog.has(PDFName.of('Names'))).toBe(true);
  expect(source.catalog.has(PDFName.of('Metadata'))).toBe(true);
  const geometry = await fixtureGeometry(page, original);
  const before = await inspectWithReader(page, original, geometry.map(item => item.samples));
  const result = await page.evaluate(async ({ data, marks }) => {
    const { redactToImagePdf } = await import('/src/redaction.js');
    const input = new Uint8Array(data);
    const output = await redactToImagePdf(input, marks);
    return { output: Array.from(output), input: Array.from(input) };
  }, { data: Array.from(original), marks: REDACTIONS.map((rect, index) => ({ page: index, rect })) });
  expect(Buffer.from(result.input)).toEqual(original);
  const output = Buffer.from(result.output);
  await assertFreshImageOnly(output, geometry);
  await assertEmbeddedPixels(output, geometry, before);
  const after = await inspectWithReader(page, output, geometry.map(item => item.samples));
  expect(after.map(item => item.text)).toEqual(['', '']);
  for (let index = 0; index < after.length; index++) {
    expect(after[index].pixels[0]).toEqual([0, 0, 0, 255]);
    expect(after[index].pixels[1]).toEqual(before[index].pixels[1]);
  }
});

test('secure redaction removes text, hidden content and source structures while burning pixels on cropped rotated pages', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen', '0.10.0'));
  const original = await sensitiveFixture(); const sourcePath = testInfo.outputPath('sensitive-source.pdf');
  await writeFile(sourcePath, original); await page.goto('/');
  const geometry = await fixtureGeometry(page, original);
  const samples = geometry.map(item => item.samples);
  const before = await inspectWithReader(page, original, samples);
  expect(before[0].text).toContain('VISIBLE_SECRET_4829');
  expect(before[0].text).toContain('HIDDEN_OCR_SECRET_7315');
  await page.getByLabel('Open or merge PDFs').setInputFiles(sourcePath);
  for (let index = 0; index < geometry.length; index++) {
    await page.getByRole('button', { name: `Select page ${index + 1}`, exact: true }).click();
    await markArea(page, geometry[index]);
  }
  await expect(page.getByRole('button', { name: 'Save PDF', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save As / Export PDF', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Extract', exact: false })).toBeDisabled();
  await page.getByRole('button', { name: 'Apply secure redaction', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Apply secure redaction' });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(/image|raster/i);
  await confirmation.getByRole('button', { name: 'Apply redactions', exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(page.locator('.app')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Redo/ })).toBeDisabled();
  await expect(page.getByLabel('Page comments')).not.toContainText('COMMENT_SECRET_2187');
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save As / Export PDF', exact: true }).click();
  const download = await waiting; expect(download.suggestedFilename()).toMatch(/redacted.*\.pdf$/i);
  const output = await readFile(await download.path());
  await assertFreshImageOnly(output, geometry);
  await assertEmbeddedPixels(output, geometry, before);
  const after = await inspectWithReader(page, output, samples);
  for (let index = 0; index < after.length; index++) {
    expect(after[index].text).toBe('');
    expect(after[index].rotation).toBe(0);
    expect(after[index].pixels[0]).toEqual([0, 0, 0, 255]);
    expect(before[index].pixels[0]).not.toEqual([0, 0, 0, 255]);
    expect(after[index].pixels[1]).toEqual(before[index].pixels[1]);
  }
  expect(await readFile(sourcePath)).toEqual(original);
});

test('cancelling application leaves marks pending and blocks saving until marks are cleared', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen', '0.10.0'));
  const bytes = await sensitiveFixture(); await page.goto('/');
  const geometry = await fixtureGeometry(page, bytes);
  await page.getByLabel('Open or merge PDFs').setInputFiles({ name: 'cancel.pdf', mimeType: 'application/pdf', buffer: bytes });
  await markArea(page, geometry[0]);
  await page.getByRole('button', { name: 'Apply secure redaction', exact: true }).click();
  await page.getByRole('dialog', { name: 'Apply secure redaction' }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply secure redaction', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Save As / Export PDF', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Clear all pending areas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save As / Export PDF', exact: true })).toBeEnabled();
});

test('pending marks block keyboard saving and successful redaction forgets the original save destination', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen', '0.10.0'));
  await page.route('**/src/save.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function savePdf(bytes, name, currentPath = null) {
      window.redactionSaveCalls = [...(window.redactionSaveCalls || []), { name, currentPath }];
      return { kind: 'saved', path: currentPath || 'C:/Tests/' + name };
    }
  ` }));
  const bytes = await sensitiveFixture(); await page.goto('/');
  const geometry = await fixtureGeometry(page, bytes);
  await page.getByLabel('Open or merge PDFs').setInputFiles({ name: 'sensitive.pdf', mimeType: 'application/pdf', buffer: bytes });
  await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.redactionSaveCalls?.length)).toBe(1);
  await page.getByLabel('New comment').fill('UNFINISHED_COMMENT_SECRET_1048');
  await markArea(page, geometry[0]);
  await page.keyboard.press('Control+s');
  await expect(page.getByRole('alert')).toContainText(/apply or clear/i);
  expect(await page.evaluate(() => window.redactionSaveCalls.length)).toBe(1);
  await page.getByRole('button', { name: 'Apply secure redaction', exact: true }).click();
  await page.getByRole('dialog', { name: 'Apply secure redaction' }).getByRole('button', { name: 'Apply redactions', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Apply secure redaction' })).toBeHidden();
  await expect(page.getByLabel('New comment')).toHaveValue('');
  await page.keyboard.press('Control+s');
  await expect.poll(() => page.evaluate(() => window.redactionSaveCalls?.length)).toBe(2);
  expect(await page.evaluate(() => window.redactionSaveCalls.at(-1))).toEqual({ name: 'sensitive-redacted.pdf', currentPath: null });
});

for (const mode of ['error', 'abort']) test(`processing ${mode} preserves the original document and pending marks`, async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen', '0.10.0'));
  await page.route('**/src/redaction.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function redactToImagePdf(bytes, marks, options) {
      ${mode === 'error' ? "throw new Error('Injected raster failure');" : `
      options.onProgress({completed:0,total:2});
      await new Promise((resolve, reject) => options.signal.addEventListener('abort', () => {
        const error = new Error('Cancelled'); error.name = 'AbortError'; reject(error);
      }, {once:true}));`}
    }
  ` }));
  const bytes = await sensitiveFixture(); await page.goto('/');
  const geometry = await fixtureGeometry(page, bytes);
  await page.getByLabel('Open or merge PDFs').setInputFiles({ name: 'preserve.pdf', mimeType: 'application/pdf', buffer: bytes });
  await markArea(page, geometry[0]);
  await page.getByRole('button', { name: 'Apply secure redaction', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Apply secure redaction' });
  await dialog.getByRole('button', { name: 'Apply redactions', exact: true }).click();
  if (mode === 'abort') {
    await dialog.getByRole('button', { name: 'Cancel processing', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText(/unchanged/i);
  } else await expect(dialog.getByRole('alert')).toContainText('Injected raster failure');
  await expect(page.locator('.app')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.redaction-count')).toContainText('1 pending area');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Clear all pending areas', exact: true }).click();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save As / Export PDF', exact: true }).click();
  const output = await readFile(await (await waiting).path());
  const reader = await inspectWithReader(page, output, geometry.map(item => item.samples));
  expect(reader[0].text).toContain('VISIBLE_SECRET_4829');
  expect(reader[0].text).toContain('HIDDEN_OCR_SECRET_7315');
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeEnabled();
});
