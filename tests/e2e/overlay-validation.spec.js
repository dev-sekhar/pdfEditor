import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const { PDFDocument } = createRequire(import.meta.url)('pdf-lib');

async function fixture(name) {
  const doc = await PDFDocument.create();doc.addPage([600,800]);
  return {name:`${name}.pdf`,mimeType:'application/pdf',buffer:Buffer.from(await doc.save())};
}
test.beforeEach(async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen','0.8.0'));
  await page.goto('/');await page.getByLabel('Open or merge PDFs').setInputFiles(await fixture('original'));
});
test('invalid default size prevents placement and replacing the document clears placement mode', async ({page}) => {
  await page.getByLabel('Text to add').fill('Overlay');
  await page.getByLabel('Font size (points)',{exact:true}).fill('0');
  await expect(page.getByRole('button',{name:'Place text',exact:true})).toBeDisabled();
  await page.getByLabel('Font size (points)',{exact:true}).fill('14');
  await page.getByRole('button',{name:'Place text',exact:true}).click();
  await expect(page.getByRole('button',{name:'Cancel placement',exact:true})).toBeVisible();
  await page.getByLabel('Open new document').setInputFiles(await fixture('replacement'));
  await expect(page.getByLabel('Text overlay placement')).not.toHaveClass(/placing/);
  await expect(page.getByRole('button',{name:'Place text',exact:true})).toBeDisabled();
});
test('unsupported glyphs fail placement and editing without changing document history', async ({page}) => {
  await page.getByLabel('Text to add').fill('漢');
  await page.getByRole('button',{name:'Place text',exact:true}).click();
  await page.getByLabel('Text overlay placement').click({position:{x:100,y:100}});
  await expect(page.getByRole('alert')).toContainText('encode');
  await expect(page.locator('.text-overlay-handle')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Undo Open PDFs',exact:true})).toBeEnabled();
  await page.getByLabel('Text to add').fill('Supported');
  await page.getByRole('button',{name:'Place text',exact:true}).click();
  await page.getByLabel('Text overlay placement').click({position:{x:100,y:100}});
  await expect(page.getByRole('button',{name:'Move text: Supported',exact:true})).toBeVisible();
  await page.getByLabel('Annotation content').fill('漢');
  await page.getByRole('button',{name:'Apply annotation changes',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('encode');
  await expect(page.getByRole('button',{name:'Move text: Supported',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Undo Add text',exact:true})).toBeEnabled();
});
