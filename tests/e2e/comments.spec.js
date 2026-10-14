import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const { PDFDocument, PDFArray, PDFDict, PDFName, PDFHexString } = createRequire(import.meta.url)('pdf-lib');

test('page notes show markers, undo/redo, follow reordered pages, and export native comments', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen', '0.5.0'));
  await page.goto('/');
  const document = await PDFDocument.create(); document.addPage(); document.addPage();
  await page.getByLabel('Open or merge PDFs').setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await document.save()) });
  await page.getByLabel('New comment').fill('Please review this page');
  await page.getByRole('button', { name: 'Add page comment' }).click();
  await expect(page.getByRole('button', { name: 'Comment marker 1' })).toBeVisible();
  await expect(page.getByLabel('Page comments')).toContainText('Please review this page');
  await page.getByRole('button', { name: 'Undo Add comment' }).click();
  await expect(page.getByRole('button', { name: 'Comment marker 1' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo Add comment' }).click();
  await expect(page.getByRole('button', { name: 'Comment marker 1' })).toBeVisible();
  await page.getByRole('button', { name: '↓ Move', exact: true }).click();
  await expect(page.getByLabel('Page comments')).toContainText('Please review this page');
  await page.getByRole('button', { name: 'Rotate' }).click();
  await expect(page.getByRole('button', { name: 'Comment marker 1' })).toBeVisible();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save As / Export PDF' }).click();
  const download = await waiting;
  const savedBytes = await readFile(await download.path());
  const saved = await PDFDocument.load(savedBytes);
  expect(saved.getPage(0).node.get(PDFName.of('Annots'))).toBeUndefined();
  const annots = saved.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray);
  expect(annots.lookup(0, PDFDict).lookup(PDFName.of('Contents'), PDFHexString).decodeText()).toBe('Please review this page');
  const readerNotes = await page.evaluate(async data => {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
    const task = pdfjs.getDocument({ data: new Uint8Array(data) });
    try {
      const document = await task.promise;
      const pdfPage = await document.getPage(2);
      return (await pdfPage.getAnnotations()).filter(item => item.subtype === 'Text')
        .map(item => item.contentsObj.str);
    } finally { await task.destroy(); }
  }, Array.from(savedBytes));
  expect(readerNotes).toEqual(['Please review this page']);
});
