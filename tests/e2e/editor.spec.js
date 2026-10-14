import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const { PDFDocument, StandardFonts, PDFDict, PDFName } = createRequire(import.meta.url)('pdf-lib');
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen', '0.5.0'));
});

async function fixture(name, sizes) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  sizes.forEach((size, index) => {
    document.addPage(size).drawText(`${name} page ${index + 1}`, { x: 20, y: 40, size: 20, font });
  });
  return { name: `${name}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(await document.save()) };
}

async function upload(page, file, count) {
  const merging = (await page.locator('.thumbnail').count()) > 0;
  await page.getByLabel('Open or merge PDFs').setInputFiles(file);
  if (merging) await page.getByRole('button', { name: 'Insert PDFs', exact: true }).click();
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
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
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

test('zoom changes only the preview and fit modes follow window resizing', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await upload(page, await fixture('Zoom', [[600, 800]]), 1);
  await page.getByLabel('Zoom level').selectOption('100');
  const canvas = page.locator('.page-preview canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate(c => parseFloat(c.style.width))).toBe(600);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByLabel('Zoom level')).toHaveValue('125');
  await expect.poll(() => canvas.evaluate(c => parseFloat(c.style.width))).toBe(750);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(page.getByLabel('Zoom level')).toHaveValue('100');
  await page.getByLabel('Zoom level').selectOption('fit-page');
  await expect.poll(() => canvas.evaluate(c => parseFloat(c.style.height))).toBeLessThan(620);
  await page.setViewportSize({ width: 1000, height: 700 });
  await expect.poll(() => canvas.evaluate(c => parseFloat(c.style.height))).toBeLessThan(520);
  await page.getByLabel('Zoom level').selectOption('fit-width');
  await expect(canvas).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo Open PDFs' })).toBeEnabled();
  const result = await exported(page);
  expect(result.getPage(0).getSize()).toEqual({ width: 600, height: 800 });
  expect(result.getPage(0).getRotation().angle).toBe(0);
  expect(errors).toEqual([]);
});

test('dragging inserts pages before or after targets and preserves undo/redo exports', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });

  await page.goto('/');
  await upload(page, await fixture('Drag', [[200, 300], [400, 500], [600, 700]]), 3);
  await thumbnailsReady(page, 3);
  await page.getByRole('button', { name: 'Select page 1' }).dragTo(
    page.getByRole('button', { name: 'Select page 3' }), { targetPosition: { x: 60, y: 175 } });
  await expect(page.getByRole('button', { name: 'Undo Move page' })).toBeEnabled();
  expect((await exported(page)).getPages().map(p => p.getSize().width)).toEqual([400, 600, 200]);
  await expect(page.getByRole('button', { name: 'Select page 3' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Undo Move page' }).click();
  expect((await exported(page)).getPages().map(p => p.getSize().width)).toEqual([200, 400, 600]);
  await page.getByRole('button', { name: 'Redo Move page' }).click();
  await thumbnailsReady(page, 3);
  await page.getByRole('button', { name: 'Select page 3' }).dragTo(
    page.getByRole('button', { name: 'Select page 1' }), { targetPosition: { x: 60, y: 15 } });
  await expect(page.locator('.app')).toHaveAttribute('aria-busy', 'false');
  expect((await exported(page)).getPages().map(p => p.getSize().width)).toEqual([200, 400, 600]);
  await expect(page.getByRole('button', { name: 'Select page 1' })).toHaveAttribute('aria-current', 'page');
  await thumbnailsReady(page, 3);
  await expect(page.locator('.page-preview canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/editor-v0.3.png', fullPage: true });
});

for (const [mode, order] of [
  ['before', [200, 800, 1000, 400, 600]],
  ['after', [200, 400, 800, 1000, 600]],
  ['beginning', [800, 1000, 200, 400, 600]],
  ['end', [200, 400, 600, 800, 1000]],
  ['number', [200, 400, 800, 1000, 600]],
]) {
  test(`merge inserts PDFs at ${mode} and restores the original through undo`, async ({ page }) => {
    await page.goto('/');
    await upload(page, await fixture('Original', [[200, 300], [400, 500], [600, 700]]), 3);
    await page.getByRole('button', { name: 'Select page 2' }).click();
    await page.getByLabel('Open or merge PDFs').setInputFiles([
      await fixture('Incoming B', [[800, 700]]), await fixture('Incoming C', [[1000, 700]]),
    ]);
    const dialog = page.getByRole('dialog', { name: 'Insert PDF pages' });
    await expect(dialog).toBeVisible();
    await page.getByLabel('Insert position').selectOption(mode);
    if (mode === 'number') await page.getByLabel('Insert before page number').fill('3');
    await page.getByRole('button', { name: 'Insert PDFs', exact: true }).click();
    await expect(page.locator('.page-count')).toHaveText('5 pages');
    expect((await exported(page)).getPages().map(p => p.getWidth())).toEqual(order);
    await page.getByRole('button', { name: 'Undo Merge PDFs' }).click();
    expect((await exported(page)).getPages().map(p => p.getWidth())).toEqual([200, 400, 600]);
    await expect(page.getByRole('button', { name: 'Select page 2' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: 'Redo Merge PDFs' }).click();
    expect((await exported(page)).getPages().map(p => p.getWidth())).toEqual(order);
  });
}

test('cancelling insertion preserves redo and invalid page numbers keep the dialog open', async ({ page }) => {
  await page.goto('/');
  await upload(page, await fixture('Original', [[200, 300]]), 1);
  await page.getByRole('button', { name: 'Rotate' }).click();
  await expect(page.getByRole('button', { name: 'Undo Rotate page' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo Rotate page' }).click();
  await page.getByLabel('Open or merge PDFs').setInputFiles(await fixture('Incoming', [[400, 500]]));
  await page.getByLabel('Insert position').selectOption('number');
  await page.getByLabel('Insert before page number').fill('3');
  await page.getByRole('button', { name: 'Insert PDFs', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Insert PDF pages' })).toBeVisible();
  await expect(page.locator('.page-count')).toHaveText('1 pages');
  await page.screenshot({ path: 'test-results/merge-insertion.png' });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Redo Rotate page' })).toBeEnabled();
  expect((await exported(page)).getPageCount()).toBe(1);
});

test('incoming ranges preserve entered order and support insertion and undo/redo', async ({ page }) => {
  await page.goto('/');
  await upload(page, await fixture('Original', [[200, 300], [400, 500]]), 2);
  await page.getByRole('button', { name: 'Select page 2' }).click();
  await page.getByLabel('Open or merge PDFs').setInputFiles(await fixture('Incoming', [[600, 700], [800, 700], [1000, 700], [1200, 700]]));
  await page.getByLabel('Pages from Incoming.pdf').fill('3, 1-2, 2');
  await page.getByLabel('Insert position').selectOption('before');
  await page.getByRole('button', { name: 'Insert PDFs', exact: true }).click();
  await expect(page.locator('.page-count')).toHaveText('5 pages');
  expect((await exported(page)).getPages().map(p => p.getWidth())).toEqual([200, 1000, 600, 800, 400]);
  await page.getByRole('button', { name: 'Undo Merge PDFs' }).click();
  expect((await exported(page)).getPages().map(p => p.getWidth())).toEqual([200, 400]);
  await page.getByRole('button', { name: 'Redo Merge PDFs' }).click();
  expect((await exported(page)).getPages().map(p => p.getWidth())).toEqual([200, 1000, 600, 800, 400]);
});

test('each incoming PDF has its own range, with validation before any merge', async ({ page }) => {
  await page.goto('/');
  await upload(page, await fixture('Original', [[200, 300]]), 1);
  await page.getByLabel('Open or merge PDFs').setInputFiles([
    await fixture('B', [[400, 500], [600, 700]]), await fixture('C', [[800, 700], [1000, 700], [1200, 700]]),
  ]);
  await page.getByLabel('Pages from B.pdf').fill('3');
  await page.getByLabel('Pages from C.pdf').fill('2-3');
  await page.getByRole('button', { name: 'Insert PDFs', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('B.pdf');
  await expect(page.locator('.page-count')).toHaveText('1 pages');
  await page.getByLabel('Pages from B.pdf').fill('2');
  await page.screenshot({ path: 'test-results/merge-ranges.png' });
  await page.getByRole('button', { name: 'Insert PDFs', exact: true }).click();
  await expect(page.locator('.page-count')).toHaveText('4 pages');
  expect((await exported(page)).getPages().map(p => p.getWidth())).toEqual([200, 600, 1000, 1200]);
});
