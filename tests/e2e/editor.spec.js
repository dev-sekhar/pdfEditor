import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const { PDFDocument, StandardFonts, PDFDict, PDFName } = createRequire(import.meta.url)('pdf-lib');
import { readFile } from 'node:fs/promises';

async function fixture(name, sizes) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  sizes.forEach((size, index) => {
    document.addPage(size).drawText(`${name} page ${index + 1}`, { x: 20, y: 40, size: 20, font });
  });
  return { name: `${name}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(await document.save()) };
}

async function upload(page, file, count) {
  await page.getByLabel('Open or merge PDFs').setInputFiles(file);
  await expect(page.locator('.page-count')).toHaveText(`${count} pages`);
}

async function exported(page) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const download = await waiting;
  return PDFDocument.load(await readFile(await download.path()));
}

async function thumbnailsReady(page, count) {
  await expect(page.locator('.app')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.thumbnail')).toHaveCount(count);
  for (let i = 0; i < count; i++) {
    const thumbnail = page.locator('.thumbnail').nth(i);
    await thumbnail.scrollIntoViewIfNeeded();
    await expect(thumbnail.locator('canvas')).toBeVisible();
  }
}

test('thumbnails follow rotate/delete/move and undo/redo matches the exported PDF', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
  await upload(page, await fixture('A', [[200, 300], [400, 500], [600, 700]]), 3);
  await thumbnailsReady(page, 3);
  const firstCanvas = page.locator('.thumbnail canvas').first();
  const before = await firstCanvas.evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
  // Assert PDF.js actually painted dark text, not merely a blank canvas.
  expect(await firstCanvas.evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] && pixels[i] < 100) return true;
    return false;
  })).toBe(true);
  await page.getByRole('button', { name: 'Select page 1' }).click();
  await page.getByRole('button', { name: 'Rotate' }).click();
  await thumbnailsReady(page, 3);
  const after = await firstCanvas.evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
  expect(after.width).toBeGreaterThan(after.height);
  expect(before.width).toBeLessThan(before.height);
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: 'Redo Rotate page' })).toBeEnabled();
  await thumbnailsReady(page, 3);
  expect((await exported(page)).getPage(0).getRotation().angle).toBe(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByRole('button', { name: 'Undo Rotate page' })).toBeEnabled();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.page-count')).toHaveText('2 pages');
  await page.getByRole('button', { name: 'Undo Delete page' }).click();
  await thumbnailsReady(page, 3);
  await page.getByRole('button', { name: 'Redo Delete page' }).click();
  await thumbnailsReady(page, 2);
  await page.getByRole('button', { name: 'Select page 2' }).click();
  await page.getByRole('button', { name: '↑ Move', exact: true }).click();
  await thumbnailsReady(page, 2);
  expect((await exported(page)).getPages().map(p => p.getSize().width)).toEqual([600, 400]);
  await page.getByRole('button', { name: 'Undo Move page' }).click();
  expect((await exported(page)).getPages().map(p => p.getSize().width)).toEqual([400, 600]);
  await page.getByRole('button', { name: 'Rotate' }).click();
  await expect(page.getByRole('button', { name: /^Redo/ })).toBeDisabled();
  await thumbnailsReady(page, 2);
  await page.getByRole('button', { name: 'Select page 1' }).click();
  await expect(page.locator('.page-preview canvas')).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/editor-thumbnails.png', fullPage: true });
});

test('import/merge and last-page deletion can be undone; invalid PDFs do not commit', async ({ page }) => {
  await page.goto('/');
  await upload(page, await fixture('A', [[200, 300]]), 1);
  await upload(page, await fixture('B', [[400, 500]]), 2);
  await page.getByRole('button', { name: 'Undo Merge PDFs' }).click();
  await expect(page.locator('.page-count')).toHaveText('1 pages');
  await page.getByRole('button', { name: 'Redo Merge PDFs' }).click();
  await expect(page.locator('.page-count')).toHaveText('2 pages');
  await page.getByLabel('Open or merge PDFs').setInputFiles({ name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.page-count')).toHaveText('2 pages');
  await expect(page.getByRole('button', { name: 'Undo Merge PDFs' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo Merge PDFs' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.page-count')).toHaveText('0 pages');
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeDisabled();
  await page.getByRole('button', { name: 'Undo Delete page' }).click();
  await thumbnailsReady(page, 1);
  await page.getByRole('button', { name: 'Undo Open PDFs' }).click();
  await expect(page.locator('.thumbnail')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo Open PDFs' }).click();
  await thumbnailsReady(page, 1);
});

test('text overlays can be undone/redone and typing shortcuts do not undo the document', async ({ page }) => {
  await page.goto('/');
  const original = await PDFDocument.create();
  original.addPage([600, 800]);
  await upload(page, { name: 'blank.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await original.save()) }, 1);
  await page.getByLabel('Text to add').fill('Undoable overlay');
  await page.getByRole('button', { name: 'Apply text' }).click();
  await expect(page.getByRole('button', { name: 'Undo Add text' })).toBeEnabled();
  const fontCount = doc => doc.getPage(0).node.Resources().lookupMaybe(PDFName.of('Font'), PDFDict)?.keys().length || 0;
  expect(fontCount(await exported(page))).toBeGreaterThan(0);
  await page.getByLabel('Text to add').focus();
  await page.keyboard.type('draft');
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: 'Undo Add text' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo Add text' }).click();
  expect(fontCount(await exported(page))).toBe(0);
  await page.keyboard.press('Control+y');
  await expect(page.getByRole('button', { name: 'Undo Add text' })).toBeEnabled();
  expect(fontCount(await exported(page))).toBeGreaterThan(0);
});

test('offscreen thumbnails render when scrolled into view', async ({ page }) => {
  await page.goto('/');
  await upload(page, await fixture('Long', Array.from({ length: 8 }, () => [200, 300])), 8);
  await expect(page.locator('.thumbnail canvas').first()).toBeVisible();
  const last = page.locator('.thumbnail').last();
  await expect(last.locator('canvas')).toBeHidden();
  await last.scrollIntoViewIfNeeded();
  await expect(last.locator('canvas')).toBeVisible();
  await last.click();
  await expect(last).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.page-preview canvas')).toBeVisible();
});
