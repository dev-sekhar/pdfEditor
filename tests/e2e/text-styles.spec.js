import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const { PDFDocument, PDFName, PDFDict, PDFArray, decodePDFRawStream } = createRequire(import.meta.url)('pdf-lib');

async function exportStyle(page) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const download = await waiting;
  const pdf = await PDFDocument.load(await readFile(await download.path()));
  const fontResources = pdf.getPage(0).node.Resources().lookup(PDFName.of('Font'), PDFDict);
  const fonts = fontResources.values().map(ref => pdf.context.lookup(ref, PDFDict).get(PDFName.of('BaseFont')).toString());
  const streams = pdf.getPage(0).node.lookup(PDFName.of('Contents'), PDFArray);
  const commands = Array.from({ length: streams.size() }, (_, i) => new TextDecoder().decode(decodePDFRawStream(pdf.context.lookup(streams.get(i))).decode())).join('\n');
  return { fonts, commands };
}

test('text defaults preview live and selected overlay styles apply as one undoable exported edit', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen', '0.10.0'));
  await page.goto('/');
  const pdf = await PDFDocument.create(); pdf.addPage([600, 800]);
  await page.getByLabel('Open or merge PDFs').setInputFiles({ name: 'blank.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  await page.getByLabel('Text to add').fill('Styled overlay');
  await page.getByLabel('Font family', { exact: true }).selectOption('Courier');
  await page.getByLabel('Font size (points)', { exact: true }).fill('24');
  await page.getByLabel('Text color', { exact: true }).fill('#00ff00');
  await expect(page.getByLabel('Text style preview', { exact: true })).toHaveCSS('color', 'rgb(0, 255, 0)');
  await page.getByRole('button', { name: 'Place text', exact: true }).click();
  await page.getByLabel('Text overlay placement').click({ position: { x: 80, y: 100 } });
  await expect(page.getByRole('button', { name: 'Move text: Styled overlay' })).toBeVisible();
  const initial = await exportStyle(page);
  expect(initial.fonts).toContain('/Courier');
  expect(initial.commands).toContain('0 1 0 rg');
  expect(initial.commands).toMatch(/ 24 Tf/);
  const position = initial.commands.match(/1 0 0 1 [\d.]+ [\d.]+ Tm/)[0];
  await page.getByLabel('Font family', { exact: true }).selectOption('TimesRoman');
  await page.getByLabel('Font size (points)', { exact: true }).fill('36');
  await page.getByLabel('Text color', { exact: true }).fill('#ff0000');
  await expect(page.getByLabel('Text style preview', { exact: true })).toHaveCSS('color', 'rgb(255, 0, 0)');
  await page.getByRole('button', { name: 'Apply text style', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo Style text' })).toBeEnabled();
  const updated = await exportStyle(page);
  expect(updated.fonts).toContain('/Times-Roman');
  expect(updated.commands).toContain('1 0 0 rg');
  expect(updated.commands).toMatch(/ 36 Tf/);
  expect(updated.commands).toContain(position);
  await page.getByRole('button', { name: 'Undo Style text' }).click();
  await expect(page.getByLabel('Font family', { exact: true })).toHaveValue('Courier');
  await expect(page.getByLabel('Font size (points)', { exact: true })).toHaveValue('24');
  expect((await exportStyle(page)).fonts).toContain('/Courier');
  await page.getByRole('button', { name: 'Redo Style text' }).click();
  await expect(page.getByLabel('Font family', { exact: true })).toHaveValue('TimesRoman');
  await page.getByLabel('Font size (points)', { exact: true }).fill('200');
  await expect(page.getByRole('button', { name: 'Apply text style', exact: true })).toBeDisabled();
});
