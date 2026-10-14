import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const { PDFDocument, StandardFonts, PDFArray, PDFName } = createRequire(import.meta.url)('pdf-lib');

async function exportedAnnotations(page) {
  const waiting = page.waitForEvent('download');
  await page.getByLabel('Save As / Export PDF').click();
  const file = await waiting;
  const document = await PDFDocument.load(await readFile(await file.path()));
  return document.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).asArray().map(ref => document.context.lookup(ref));
}
test('generic inspector edits native comments and highlight colors alongside positioned text', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen','0.8.0'));
  const source = await PDFDocument.create(); const font = await source.embedFont(StandardFonts.Helvetica);
  source.addPage([600,800]).drawText('Selectable sentence', { x: 30, y: 720, size: 18, font });
  await page.goto('/');
  await page.getByLabel('Open or merge PDFs').setInputFiles({name:'annotations.pdf',mimeType:'application/pdf',buffer:Buffer.from(await source.save())});
  await page.getByLabel('New comment').fill('Original note');
  await page.getByRole('button',{name:'Add page comment',exact:true}).click();
  await expect(page.getByLabel('Annotation content')).toHaveValue('Original note');
  await page.getByLabel('Annotation content').fill('Updated note 日本語');
  await page.getByRole('button',{name:'Apply annotation changes',exact:true}).click();
  await expect(page.getByLabel('Page comments')).toContainText('Updated note 日本語');
  const layer = page.getByLabel('Selectable page text');
  await expect(layer).toBeVisible();
  await expect(layer).toContainText('Selectable sentence');
  await layer.evaluate(element => {
    const range = document.createRange();range.selectNodeContents(element.querySelector('span'));
    const selection = window.getSelection();selection.removeAllRanges();selection.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  });
  await page.getByRole('button',{name:'Highlight selection',exact:true}).click();
  await page.getByLabel('Selected annotation color').fill('#ff0000');
  await page.getByRole('button',{name:'Apply annotation changes',exact:true}).click();
  let native = await exportedAnnotations(page);
  expect(native.find(item => item.get(PDFName.of('Subtype')).toString() === '/Text').lookup(PDFName.of('Contents')).decodeText()).toBe('Updated note 日本語');
  expect(native.find(item => item.get(PDFName.of('Subtype')).toString() === '/Highlight').lookup(PDFName.of('C'),PDFArray).asArray().map(n => n.asNumber())).toEqual([1,0,0]);
  await page.getByRole('button',{name:'Delete selected annotation',exact:true}).click();
  expect((await exportedAnnotations(page)).some(item => item.get(PDFName.of('Subtype')).toString() === '/Highlight')).toBe(false);
  await page.getByRole('button',{name:'Undo Delete annotation',exact:true}).click();
  await expect(page.getByLabel('Selected annotation color')).toHaveValue('#ff0000');
  await page.getByLabel('Text to add').fill('Overlay next to notes');
  await page.getByRole('button',{name:'Place text',exact:true}).click();
  await page.getByLabel('Text overlay placement').click({position:{x:180,y:200}});
  await expect(page.getByRole('button',{name:'Move text: Overlay next to notes',exact:true})).toBeVisible();
  await page.getByLabel('Annotation content').fill('Edited overlay');
  await page.getByRole('button',{name:'Apply annotation changes',exact:true}).click();
  native = await exportedAnnotations(page);
  expect(native.filter(item => item.get(PDFName.of('Subtype')).toString() === '/Highlight')).toHaveLength(1);
  expect(native.filter(item => item.get(PDFName.of('Subtype')).toString() === '/Text')).toHaveLength(1);
  await page.getByRole('button',{name:'Comment marker 1',exact:true}).click();
  await expect(page.getByLabel('Annotation content')).toHaveValue('Updated note 日本語');
});
