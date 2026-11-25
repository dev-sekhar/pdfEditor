import { test,expect } from '@playwright/test';
import { copyFile,readFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const {PDFDocument}=createRequire(import.meta.url)('pdf-lib');
const carousel=process.env.PDF_EDITOR_CAROUSEL;
const printed=process.env.PDF_EDITOR_PRINTED_FORM;
async function save(page,name) {
  const waiting=page.waitForEvent('download');
  await page.getByRole('button',{name:'Save PDF',exact:true}).click();
  const file=await (await waiting).path();
  if(process.env.PDF_EDITOR_LOCAL_OUTPUTS) {
    await mkdir(process.env.PDF_EDITOR_LOCAL_OUTPUTS,{recursive:true});
    await copyFile(file,path.join(process.env.PDF_EDITOR_LOCAL_OUTPUTS,name));
  }
  return new Uint8Array(await readFile(file));
}
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('pdf-studio-release-seen','0.11.0'));await page.goto('/');});
test('local carousel keeps embedded fonts and graphics when native text is replaced',async({page})=>{
  test.skip(!carousel,'Set PDF_EDITOR_CAROUSEL to a local PDF. No sample is uploaded to GitHub.');
  await page.getByLabel('Open or merge PDFs').setInputFiles(carousel);
  await expect(page.locator('[aria-label="Selected page"] canvas')).toBeVisible();
  await page.getByRole('button',{name:'Edit existing text',exact:true}).click();
  const target=page.getByRole('button',{name:'Edit existing text: When Excel stops',exact:true});
  await expect(target).toBeVisible();await target.click();
  await page.getByLabel('Existing text replacement').fill('When Excel ends');
  await page.getByRole('button',{name:'Apply text edit',exact:true}).click();
  await expect(page.getByRole('button',{name:'Edit existing text: When Excel ends',exact:true})).toBeVisible();
  const saved=await save(page,'carousel-native-edited.pdf');
  const doc=await PDFDocument.load(saved);expect(doc.getPageCount()).toBe(5);
  await expect(page.getByLabel('Selectable page text')).toContainText('When Excel ends');
  await expect(page.getByLabel('Selectable page text')).not.toContainText('When Excel stops');
  await page.screenshot({path:'test-results/local-carousel-edited.png',fullPage:true});
});
test('local printed questionnaire supports click-to-type and checkbox marks on both pages',async({page})=>{
  test.skip(!printed,'Set PDF_EDITOR_PRINTED_FORM to a local PDF. No sample is uploaded to GitHub.');
  await page.getByLabel('Open or merge PDFs').setInputFiles(printed);
  await expect(page.getByLabel('Form diagnosis')).toContainText('No interactive fields');
  await page.getByRole('button',{name:'Fill form',exact:true}).click();
  const layer=page.getByLabel('Fill printed form',{exact:true});
  await expect(layer.getByRole('status')).toContainText('Click a blank space');
  // Coordinates in the PDF's original view; no actual personal information.
  async function enter(x,y,value){
    const box=await layer.boundingBox();
    const scale=box.width/612;
    await layer.click({position:{x:x*scale,y:y*scale}});
    await page.getByLabel('Form entry text').fill(value);
    await page.getByRole('button',{name:'Apply entry',exact:true}).click();
    await expect(page.getByRole('button',{name:'Undo Fill printed form',exact:true})).toBeEnabled();
    await expect(page.locator('.app')).toHaveAttribute('aria-busy','false');
  }
  await enter(365,86,'SYNTHETIC TEST');
  await page.getByLabel('Form entry type').selectOption('check');
  await enter(342,203,'X');
  await page.getByRole('button',{name:'Select page 2',exact:true}).click();
  await expect(layer.getByRole('status')).toContainText('Click a blank space');
  await page.getByLabel('Form entry type').selectOption('text');
  await enter(415,482,'TEST ONLY');
  const saved=await save(page,'questionnaire-filled-test.pdf');
  expect((await PDFDocument.load(saved)).getPageCount()).toBe(2);
  await page.screenshot({path:'test-results/local-questionnaire-filled.png',fullPage:true});
});
