import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const { PDFDocument, PDFArray, PDFName, decodePDFRawStream } = createRequire(import.meta.url)('pdf-lib');

async function commands(page) {
  const waiting = page.waitForEvent('download');
  await page.getByLabel('Save As / Export PDF').click();
  const download = await waiting;
  const doc = await PDFDocument.load(await readFile(await download.path()));
  const streams = doc.getPage(0).node.lookupMaybe(PDFName.of('Contents'), PDFArray);
  return streams ? Array.from({length:streams.size()},(_,i) => new TextDecoder().decode(decodePDFRawStream(doc.context.lookup(streams.get(i))).decode())).join('\n') : '';
}

test('edit text overlay content once, undo/redo, and delete without changing its position', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen','0.9.0'));
  await page.goto('/');
  const pdf = await PDFDocument.create(); pdf.addPage([600,800]);
  await page.getByLabel('Open or merge PDFs').setInputFiles({name:'blank.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await page.getByLabel('Text to add').fill('Before');
  await page.getByRole('button',{name:'Place text',exact:true}).click();
  await page.getByLabel('Text overlay placement').click({position:{x:80,y:100}});
  await expect(page.getByRole('button',{name:'Move text: Before',exact:true})).toBeVisible();
  const initial = await commands(page);
  const position = initial.match(/1 0 0 1 [\d.]+ [\d.]+ Tm/)[0];
  await page.getByLabel('Annotation content').fill('After');
  await page.getByRole('button',{name:'Apply annotation changes',exact:true}).click();
  await expect(page.getByRole('button',{name:'Move text: After',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Apply annotation changes',exact:true})).toBeDisabled();
  const updated = await commands(page);
  expect(updated).toContain(position);
  expect(updated).toContain('<4166746572>');
  expect(updated).not.toContain('<4265666F7265>');
  await page.getByRole('button',{name:'Undo Edit annotation',exact:true}).click();
  await expect(page.getByLabel('Annotation content')).toHaveValue('Before');
  await page.getByRole('button',{name:'Redo Edit annotation',exact:true}).click();
  await expect(page.getByLabel('Annotation content')).toHaveValue('After');
  await page.getByRole('button',{name:'Delete selected annotation',exact:true}).click();
  await expect(page.getByRole('button',{name:'Move text: After',exact:true})).toHaveCount(0);
  expect(await commands(page)).not.toContain('<4166746572>');
  await page.getByRole('button',{name:'Undo Delete annotation',exact:true}).click();
  await expect(page.getByRole('button',{name:'Move text: After',exact:true})).toBeVisible();
  await expect(page.getByLabel('Annotation content')).toHaveValue('After');
});
