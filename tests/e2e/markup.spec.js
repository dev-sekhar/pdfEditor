import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const { PDFDocument, StandardFonts, PDFArray, PDFName } = createRequire(import.meta.url)('pdf-lib');

test('adding positioned text keeps comments and highlights editable and exports each annotation once', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen', '0.8.0'));
  const source = await PDFDocument.create();
  source.addPage([600,800]).drawText('Highlight this sentence', { x: 30, y: 620, size: 18,
    font: await source.embedFont(StandardFonts.Helvetica) });
  await page.goto('/');
  await page.getByLabel('Open or merge PDFs').setInputFiles({ name: 'annotations.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await source.save()) });
  await selectText(page);
  await page.getByRole('button', { name: 'Highlight selection', exact: true }).click();
  await page.getByLabel('New comment').fill('Keep the review note');
  await page.getByRole('button', { name: 'Add page comment' }).click();
  await page.getByLabel('Text to add').fill('Added text');
  await page.getByRole('button', { name: 'Place text', exact: true }).click();
  await page.getByLabel('Text overlay placement').click({position:{x:100,y:100}});
  await expect(page.locator('.markup-list li')).toHaveCount(1);
  await expect(page.getByLabel('Page comments')).toContainText('Keep the review note');
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save As / Export PDF' }).click();
  const download = await waiting;
  const output = await PDFDocument.load(await readFile(await download.path()));
  expect(output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).size()).toBe(3);
  await page.getByRole('button', { name: 'Delete markup 1' }).click();
  await expect(page.locator('.markup-list li')).toHaveCount(0);
  await expect(page.getByLabel('Page comments')).toContainText('Keep the review note');
});

async function selectText(page) {
  const layer = page.getByLabel('Selectable page text');
  await expect(layer).toBeVisible();
  await expect(layer).toContainText('Highlight this sentence');
  await layer.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element.querySelector('span'));
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
}
test('selected text becomes visible native markup; undo/redo and delete preserve export', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen', '0.8.0'));
  const source = await PDFDocument.create(); const font = await source.embedFont(StandardFonts.Helvetica);
  source.addPage([400,500]).drawText('Highlight this sentence', { x: 30, y: 420, size: 18, font });
  await page.goto('/');
  await page.getByLabel('Open or merge PDFs').setInputFiles({ name: 'markup.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await source.save()) });
  await expect(page.getByRole('button', { name: 'Highlight selection', exact: true })).toBeDisabled();
  await selectText(page);
  await page.getByRole('button', { name: 'Highlight selection', exact: true }).click();
  await expect(page.locator('.markup-list li')).toHaveCount(1);
  await expect(page.locator('.page-preview canvas')).toBeVisible();
  expect(await page.locator('.page-preview canvas').evaluate(canvas => {
    const values = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let yellow = 0;
    for(let i=0;i<values.length;i+=4) if(values[i]>180 && values[i+1]>150 && values[i+2]<220) yellow++;
    return yellow;
  })).toBeGreaterThan(20);
  await page.getByRole('button', { name: 'Undo Highlight text', exact: true }).click();
  await expect(page.locator('.markup-list li')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo Highlight text', exact: true }).click();
  await expect(page.locator('.markup-list li')).toHaveCount(1);
  await selectText(page);
  await page.getByRole('button', { name: 'Underline selection', exact: true }).click();
  await expect(page.locator('.markup-list li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Delete markup 1', exact: true }).click();
  await expect(page.locator('.markup-list li')).toHaveCount(1);
  const waiting = page.waitForEvent('download');
  await page.getByLabel('Save As / Export PDF').click();
  const download = await waiting;
  const exported = await PDFDocument.load(await readFile(await download.path()));
  const annotations = exported.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  expect(annotations.size()).toBe(1);
  expect(exported.context.lookup(annotations.get(0)).get(PDFName.of('Subtype')).toString()).toBe('/Underline');
});
