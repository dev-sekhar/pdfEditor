import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const JSZip = require('jszip');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen', '0.10.0'));
});

async function fixture({ scanned = true } = {}) {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  const labels = ['Alpha café & <public>', 'Beta naïve résumé', 'Gamma final page'];
  labels.forEach((text, index) => pdf.addPage([240 + index * 20, 320 + index * 20])
    .drawText(text, { x: 20, y: 240, size: 12, font }));
  if (scanned) {
    const image = await pdf.embedPng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
    pdf.addPage([220, 300]).drawImage(image, { x: 20, y: 20, width: 180, height: 260 });
  }
  return Buffer.from(await pdf.save());
}

async function openDocument(page, bytes, name = 'report.pdf') {
  await page.goto('/');
  await page.getByLabel('Open or merge PDFs').setInputFiles({ name, mimeType: 'application/pdf', buffer: bytes });
  await expect(page.locator('.app')).toHaveAttribute('aria-busy', 'false');
}

async function showWordDialog(page, mode = 'Editable text') {
  await page.getByRole('button', { name: 'Export to Word', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export to Word', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(mode, { exact: true }).check();
  return dialog;
}

async function downloadWord(page, mode = 'Editable text') {
  const dialog = await showWordDialog(page, mode);
  const waiting = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export Word document', exact: true }).click();
  const download = await waiting;
  expect(download.suggestedFilename()).toMatch(/\.docx$/i);
  await download.saveAs(test.info().outputPath(mode === 'Page images' ? 'page-images.docx' : 'editable.docx'));
  const bytes = await readFile(await download.path());
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml').async('string');
  const media = Object.keys(zip.files).filter(path => /^word\/media\/[^/]+$/.test(path));
  return { zip, xml, media, filename: download.suggestedFilename() };
}

const decodeXml = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const documentText = xml => Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g), match => decodeXml(match[1])).join(' ');

async function assertPngMedia(zip, paths, count) {
  expect(paths).toHaveLength(count);
  for (const path of paths) {
    const bytes = await zip.file(path).async('uint8array');
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.length).toBeGreaterThan(50);
  }
}

test('editable Word follows edited page order, preserves accented text and falls back to a real image for scans', async ({ page }) => {
  await openDocument(page, await fixture());
  await page.getByRole('button', { name: 'Select page 3', exact: true }).click();
  await page.getByRole('button', { name: '↑ Move', exact: true }).click();
  await page.getByRole('button', { name: '↑ Move', exact: true }).click();
  await page.getByRole('button', { name: '↻ Rotate', exact: true }).click();
  await page.getByRole('button', { name: 'Select page 2', exact: true }).click();
  await page.getByRole('button', { name: '✕ Delete', exact: true }).click();
  await expect(page.locator('.page-count')).toHaveText('3 pages');
  const undo = await page.getByRole('button', { name: /^Undo/ }).getAttribute('aria-label');
  await expect(page.locator('.document-status')).toHaveText('Unsaved changes');
  const { xml, media, zip } = await downloadWord(page);
  const text = documentText(xml);
  expect(text).toContain('Gamma final page'); expect(text).toContain('Beta naïve résumé');
  expect(text).not.toContain('Alpha');
  expect(text.indexOf('Gamma')).toBeLessThan(text.indexOf('Beta'));
  expect(xml.match(/<w:sectPr[ >]/g)).toHaveLength(3);
  expect(xml).toMatch(/<w:pgSz[^>]*w:w="7200"[^>]*w:h="5600"/);
  await assertPngMedia(zip, media, 1);
  await expect(page.locator('.document-status')).toHaveText('Unsaved changes');
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveAttribute('aria-label', undo);
});

test('editable Word escapes XML safely and page-image mode contains an image for every page without editable source text', async ({ page }) => {
  await openDocument(page, await fixture({ scanned: false }));
  let output = await downloadWord(page);
  expect(documentText(output.xml)).toContain('Alpha café & <public>');
  expect(output.xml).toContain('&amp;'); expect(output.xml).toContain('&lt;public&gt;');
  const dialog = await showWordDialog(page, 'Page images');
  await expect(dialog).toContainText(/OCR/i);
  await expect(dialog).toContainText(/layout|reflow|best.effort/i);
  const waiting = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export Word document', exact: true }).click();
  const file = await waiting; await file.saveAs(test.info().outputPath('page-images.docx'));
  const zip = await JSZip.loadAsync(await readFile(await file.path()));
  const xml = await zip.file('word/document.xml').async('string');
  expect(documentText(xml)).not.toContain('Alpha café');
  expect(documentText(xml)).not.toContain('Beta naïve');
  expect(documentText(xml)).not.toContain('Gamma final');
  await assertPngMedia(zip, Object.keys(zip.files).filter(path => /^word\/media\/[^/]+$/.test(path)), 3);
  await expect(page.locator('.document-status')).toHaveText('No unsaved changes');
});

test('cancelled native Word saving preserves PDF dirty state, undo history, and its chosen save destination', async ({ page }) => {
  await page.route('**/src/save.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function savePdf(bytes, name, currentPath = null) {
      window.pdfSaves = [...(window.pdfSaves || []), {name,currentPath}];
      return {kind:'saved',path:currentPath || 'C:/Tests/report.pdf'};
    }
  ` }));
  await page.route('**/src/save-word.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function saveWord(bytes, name) {
      window.wordSaves = [...(window.wordSaves || []), {name,length:bytes.length}];
      return {kind:'cancelled'};
    }
  ` }));
  await openDocument(page, await fixture({ scanned: false }));
  await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.pdfSaves?.length)).toBe(1);
  await page.getByRole('button', { name: '↻ Rotate', exact: true }).click();
  const dialog = await showWordDialog(page);
  await dialog.getByRole('button', { name: 'Export Word document', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.wordSaves?.length)).toBe(1);
  await expect(page.locator('.app')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.document-status')).toHaveText('Unsaved changes');
  await expect(page.getByRole('button', { name: 'Undo Rotate page', exact: true })).toBeEnabled();
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.keyboard.press('Control+s');
  await expect.poll(() => page.evaluate(() => window.pdfSaves?.at(-1).currentPath)).toBe('C:/Tests/report.pdf');
  expect(await page.evaluate(() => window.wordSaves[0].name)).toMatch(/\.docx$/i);
});

test('pending redactions block Word export and applied redaction cannot recover original secrets through DOCX', async ({ page }) => {
  test.setTimeout(90000);
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  const source = pdf.addPage([300, 400]);
  const secret = 'WORD_REDACTION_SECRET_624981';
  source.drawText(secret, { x: 50, y: 300, size: 10, font });
  source.drawRectangle({ x: 20, y: 30, width: 30, height: 30, color: rgb(0, 0.7, 0) });
  await openDocument(page, Buffer.from(await pdf.save()), 'sensitive.pdf');
  await page.getByLabel('Zoom level').selectOption('100');
  await page.getByRole('button', { name: 'Mark redaction areas', exact: true }).click();
  const surface = page.getByLabel('Redaction marking canvas');
  await expect(surface).toHaveAttribute('width', '300');
  const box = await surface.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 70); await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 120, { steps: 5 }); await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Export to Word', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Apply secure redaction', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Apply secure redaction' });
  await confirmation.getByRole('button', { name: 'Apply redactions', exact: true }).click();
  await expect(confirmation).toBeHidden();
  const { zip, xml, media } = await downloadWord(page);
  expect(documentText(xml)).not.toContain(secret);
  for (const entry of Object.values(zip.files).filter(item => !item.dir)) {
    expect((await entry.async('nodebuffer')).includes(Buffer.from(secret))).toBe(false);
  }
  await assertPngMedia(zip, media, 1);
  const image = await zip.file(media[0]).async('uint8array');
  const pixel = await page.evaluate(async data => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0);
    const color = Array.from(context.getImageData(Math.floor(bitmap.width / 3), Math.floor(bitmap.height / 4), 1, 1).data);
    bitmap.close(); return color;
  }, Array.from(image));
  expect(pixel).toEqual([0, 0, 0, 255]);
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
  await expect(page.locator('.document-status')).toHaveText('Unsaved changes');
});

test('native Word writing cannot be dismissed until acknowledged and never marks PDF edits saved', async ({ page }) => {
  await page.route('**/src/save-word.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function saveWord(bytes, name) {
      return new Promise(resolve => { window.completeWordWrite = () => resolve({kind:'saved',path:'C:/Tests/report.docx'}); });
    }
  ` }));
  await openDocument(page, await fixture({ scanned: false }));
  await page.getByRole('button', { name: '↻ Rotate', exact: true }).click();
  const dialog = await showWordDialog(page);
  await dialog.getByRole('button', { name: 'Export Word document', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Saving Word document…', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(page.locator('.document-status')).toHaveText('Unsaved changes');
  await page.evaluate(() => window.completeWordWrite());
  await expect(dialog).toBeHidden();
  await expect(page.locator('.document-status')).toHaveText('Unsaved changes');
  await expect(page.getByRole('button', { name: 'Undo Rotate page', exact: true })).toBeEnabled();
});

test('Word export remains reachable without overflowing the document header at desktop and narrow widths', async ({ page }, testInfo) => {
  await page.goto('/'); const measurements = [];
  for (const width of [1280, 600, 480]) {
    await page.setViewportSize({ width, height: 820 });
    const measured = await page.evaluate(() => ({ viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      headerWidth: document.querySelector('header').scrollWidth,
      actionsWidth: document.querySelector('.file-actions').scrollWidth }));
    measurements.push(measured);
    await expect(page.getByRole('button', { name: 'Export to Word', exact: true })).toBeVisible();
  }
  await testInfo.attach('header-widths.json', { body: JSON.stringify(measurements), contentType: 'application/json' });
  for (const measured of measurements) expect(measured.documentWidth, JSON.stringify(measured)).toBeLessThanOrEqual(measured.viewport);
});
