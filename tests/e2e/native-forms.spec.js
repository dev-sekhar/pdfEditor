import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const { PDFDocument, StandardFonts } = createRequire(import.meta.url)('pdf-lib');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen', '0.12.0'));
  await page.goto('/');
});
async function upload(page, doc) {
  await page.getByLabel('Open or merge PDFs').setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) });
  await expect(page.locator('.page-count')).toHaveText('1 pages');
  await expect(page.locator('[aria-label="Selected page"] canvas')).toBeVisible();
}
test('native inline edit survives export and text extraction, undo and redo at changed zoom', async ({ page }) => {
  const doc = await PDFDocument.create(); const p = doc.addPage([400,500]);
  p.drawText('Patient Name', { x: 40, y: 400, size: 14, font: await doc.embedFont(StandardFonts.Helvetica) });
  await upload(page, doc);
  await page.getByRole('button', { name: 'Edit existing text', exact: true }).click();
  await page.getByRole('button', { name: 'Edit existing text: Patient Name', exact: true }).click();
  await page.getByLabel('Existing text replacement').fill('Alex');
  await page.getByRole('button', { name: 'Apply text edit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit existing text: Alex', exact: true })).toBeVisible();
  await expect(page.locator('[aria-label="Selected page"] .textLayer')).toContainText('Alex');
  await expect(page.locator('[aria-label="Selected page"] .textLayer')).not.toContainText('Patient Name');
  await page.getByRole('button', { name: 'Undo Edit existing text', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit existing text: Patient Name', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Redo Edit existing text', exact: true }).click();
  await page.getByLabel('Zoom level').selectOption('150');
  await expect(page.getByRole('button', { name: 'Edit existing text: Alex', exact: true })).toBeVisible();
  const waiting = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  const download = await waiting;
  const saved = await readFile(await download.path());
  await page.getByRole('button', { name: 'Edit existing text: Alex', exact: true }).click();
  await page.getByLabel('Existing text replacement').fill('X'.repeat(80));
  await page.getByRole('button', { name: 'Apply text edit', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('fit the original');
  expect((await PDFDocument.load(saved)).getPageCount()).toBe(1);
  await page.screenshot({ path: 'test-results/native-edit.png', fullPage: true });
});
test('AcroForm values update, remain selected, render and export interactively', async ({ page }) => {
  const doc = await PDFDocument.create(); const p = doc.addPage([400,500]);
  const field = doc.getForm().createTextField('patient.name'); field.addToPage(p, { x: 40, y: 400, width: 200, height: 24 });
  await upload(page, doc);
  await expect(page.getByLabel('Form diagnosis')).toContainText('AcroForm');
  await page.getByLabel('Existing form field').selectOption('patient.name');
  await expect(page.getByRole('button', { name: 'Fill', exact: true })).toBeEnabled();
  await page.getByLabel('Form field value', { exact: true }).fill('Alex Patient');
  await page.getByRole('button', { name: 'Apply form change' }).click();
  await expect(page.getByRole('button', { name: 'Undo Fill form field', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Form field value', { exact: true })).toHaveValue('Alex Patient');
  await expect(page.locator('[aria-label="Selected page"] canvas')).toBeVisible();
  const waiting = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  const saved = await PDFDocument.load(await readFile(await (await waiting).path()));
  expect(saved.getForm().getTextField('patient.name').getText()).toBe('Alex Patient');
  expect(saved.getForm().getTextField('patient.name').acroField.getWidgets()).toHaveLength(1);
  await page.screenshot({ path: 'test-results/acroform-filled.png', fullPage: true });
});
test('public printed claims sample explains the visual-fill path', async ({ page }) => {
  await page.getByLabel('Open or merge PDFs').setInputFiles('tests/fixtures/cms1500.pdf');
  await expect(page.getByLabel('Form diagnosis')).toContainText('No interactive fields found');
  await expect(page.getByRole('button', { name: 'Create field', exact: true })).toBeEnabled();
  await expect(page.locator('[aria-label="Selected page"] canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/cms1500-diagnosis.png', fullPage: true });
});

test('embedded font text edits preserve a colored page and survive save',async({page})=>{
  await page.getByLabel('Open or merge PDFs').setInputFiles('tests/fixtures/embedded-layout.pdf');
  await page.getByRole('button',{name:'Edit existing text',exact:true}).click();
  await page.getByRole('button',{name:'Edit existing text: When Excel stops',exact:true}).click();
  await page.getByLabel('Existing text replacement').fill('When Excel ends');
  await page.getByRole('button',{name:'Apply text edit',exact:true}).click();
  await expect(page.getByRole('button',{name:'Edit existing text: When Excel ends',exact:true})).toBeVisible();
  await expect(page.getByLabel('Selectable page text')).toContainText('When Excel ends');
});
test('printed layouts support direct text and checkbox entries with undo and export',async({page})=>{
  const doc=await PDFDocument.create();const p=doc.addPage([400,500]);
  p.drawRectangle({x:40,y:250,width:300,height:40,borderWidth:1});
  await upload(page,doc);
  await page.getByRole('button',{name:'Free text fill',exact:true}).click();
  const layer=page.getByLabel('Fill printed form',{exact:true});
  await expect(layer.getByRole('status')).toContainText('Click a blank space');
  await layer.click({position:{x:100,y:180}});
  await page.getByLabel('Form entry text').fill('SYNTHETIC ENTRY');
  await page.getByRole('button',{name:'Apply entry',exact:true}).click();
  await expect(page.getByRole('button',{name:'Edit form entry: SYNTHETIC ENTRY',exact:true})).toBeVisible();
  await expect(page.getByLabel('Selectable page text')).toContainText('SYNTHETIC ENTRY');
  await page.getByRole('button',{name:'Undo Fill printed form',exact:true}).click();
  await expect(page.getByLabel('Selectable page text')).not.toContainText('SYNTHETIC ENTRY');
  await page.getByRole('button',{name:'Redo Fill printed form',exact:true}).click();
  await page.getByLabel('Form entry type').selectOption('check');
  await layer.click({position:{x:160,y:240}});
  await expect(page.getByLabel('Form entry text')).toHaveValue('X');
  await page.getByRole('button',{name:'Apply entry',exact:true}).click();
  await expect(page.getByRole('button',{name:'Edit form entry: X',exact:true})).toBeVisible();
  await layer.click({position:{x:200,y:300}});
  await page.getByLabel('Form entry text').fill('患者');
  await page.getByRole('button',{name:'Apply entry',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('cannot encode');
  await expect(page.getByLabel('Form entry text')).toHaveValue('患者');
  await page.locator('.fill-entry-editor').getByRole('button',{name:'Cancel',exact:true}).click();
  const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Save PDF',exact:true}).click();
  expect((await PDFDocument.load(await readFile(await (await waiting).path()))).getPageCount()).toBe(1);
});
