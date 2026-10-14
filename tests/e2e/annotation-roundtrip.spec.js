import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { PDFDocument, PDFArray, PDFDict, PDFName, PDFHexString } = createRequire(import.meta.url)('pdf-lib');

async function fixture() {
  const doc = await PDFDocument.create(); const first = doc.addPage([600, 800]); doc.addPage([400, 500]);
  const note = doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [24, 740, 44, 760], T: PDFHexString.fromText('PDF Studio'),
    NM: PDFHexString.fromText('roundtrip-note'), Contents: PDFHexString.fromText('Résumé 日本語 saved note'), Name: 'Comment' });
  const noteRef = doc.context.register(note);
  const popupRef = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [48, 640, 248, 760], Parent: noteRef }));
  note.set(PDFName.of('Popup'), popupRef);
  const markupRef = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Highlight', Rect: [40, 600, 180, 625],
    QuadPoints: [40, 625, 180, 625, 40, 600, 180, 600], C: [1, 0.8, 0], T: PDFHexString.fromText('PDF Studio'),
    NM: PDFHexString.fromText('roundtrip-highlight'), Contents: PDFHexString.fromText('Saved highlight') }));
  const annotations = doc.context.obj([noteRef, popupRef, markupRef]); first.node.set(PDFName.of('Annots'), annotations);
  annotations.push(doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [250, 300, 270, 320],
    T: PDFHexString.fromText('Another editor'), NM: PDFHexString.fromText('external-note'), Contents: PDFHexString.fromText('Preserved external note') })));
  return Buffer.from(await doc.save());
}
async function exported(page) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save As / Export PDF', exact: true }).click();
  return readFile(await (await waiting).path());
}

test('saved Studio notes and markup reopen, merge by selected page, and export without duplicates', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen', '0.9.0'));
  await page.goto('/');
  await page.getByLabel('Open or merge PDFs').setInputFiles({ name: 'saved.pdf', mimeType: 'application/pdf', buffer: await fixture() });
  await expect(page.getByLabel('Page comments')).toContainText('Résumé 日本語 saved note');
  await expect(page.getByRole('button', { name: 'Comment marker 1', exact: true })).toBeVisible();
  await expect(page.locator('.markup-list')).toContainText('Saved highlight');
  const firstExport = await exported(page);
  // The document is clean after importing, so Open new document replaces it.
  await page.getByLabel('Open new document').setInputFiles({ name: 'reopened.pdf', mimeType: 'application/pdf', buffer: firstExport });
  await expect(page.getByLabel('Page comments')).toContainText('Résumé 日本語 saved note');
  const secondExport = await exported(page);
  const second = await PDFDocument.load(secondExport);
  expect(second.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).size()).toBe(4);
  await page.getByLabel('Open or merge PDFs').setInputFiles({ name: 'incoming.pdf', mimeType: 'application/pdf', buffer: secondExport });
  await page.getByLabel('Pages from incoming.pdf').fill('1');
  await page.getByRole('button', { name: 'Insert PDFs', exact: true }).click();
  await expect(page.locator('.page-count')).toHaveText('3 pages');
  await page.getByRole('button', { name: 'Select page 3', exact: true }).click();
  await expect(page.getByLabel('Page comments')).toContainText('Résumé 日本語 saved note');
  await expect(page.getByRole('button', { name: 'Comment marker 1', exact: true })).toBeVisible();
  const merged = await PDFDocument.load(await exported(page));
  for (const index of [0, 2]) {
    const array = merged.getPage(index).node.lookup(PDFName.of('Annots'), PDFArray);
    expect(array.size()).toBe(4);
    const ids = array.asArray().map(ref => merged.context.lookup(ref, PDFDict).lookup(PDFName.of('NM'))?.decodeText?.()).filter(Boolean);
    expect(ids.sort()).toEqual(['external-note', 'roundtrip-highlight', 'roundtrip-note']);
  }
});
