import { it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { diagnoseForms, modifyForm, inspectForms } from './forms';
import { assemble } from './pdf';
import { importStudioAnnotations } from './annotation-import';
import { readFile } from 'node:fs/promises';

it('imports the public CMS-1500 sample and allows adding an interactive patient field', async () => {
  const original = new Uint8Array(await readFile(new URL('../tests/fixtures/cms1500.pdf', import.meta.url)));
  const info = await diagnoseForms(original);
  expect(info.type).toBe('Noninteractive');
  const imported = await importStudioAnnotations(original);
  const output = await modifyForm(imported.bytes, { action: 'create', type: 'text', name: 'patient.name', pageIndex: 0, rect: { x: 50, y: 620, width: 180, height: 18 } });
  const filled = await modifyForm(output, { action: 'fill', name: 'patient.name', value: 'SYNTHETIC PATIENT' });
  expect((await inspectForms(filled))[0].value).toBe('SYNTHETIC PATIENT');
  expect((await PDFDocument.load(filled)).getPageCount()).toBe((await PDFDocument.load(original)).getPageCount());
});

it('preserves XFA packets through import and ordinary assembly, blocks mutation and page copying', async () => {
  const doc = await PDFDocument.create(); doc.addPage();
  const packet = doc.context.register(doc.context.flateStream('<xfa>synthetic</xfa>'));
  doc.catalog.set(PDFName.of('AcroForm'), doc.context.obj({ XFA: packet, Fields: [] }));
  const original = await doc.save({ updateFieldAppearances: false });
  expect((await diagnoseForms(original)).type).toBe('XFA');
  expect(await inspectForms(original)).toEqual([]);
  const imported = await importStudioAnnotations(original);
  const output = await assemble([{ bytes: imported.bytes }], [{ source: 0, index: 0, rotation: 0 }]);
  const reopened = await PDFDocument.load(output);
  expect(reopened.catalog.lookup(PDFName.of('AcroForm'), PDFDict).has(PDFName.of('XFA'))).toBe(true);
  await expect(modifyForm(original, { action: 'create' })).rejects.toThrow(/XFA/);
  await expect(assemble([{ bytes: original }], [{ source: 0, index: 0, rotation: 90 }])).rejects.toThrow(/Form fields/);
});
it('distinguishes printed forms, read-only fields and unattached widgets', async () => {
  const doc = await PDFDocument.create(); const page = doc.addPage();
  expect((await diagnoseForms(await doc.save())).type).toBe('Noninteractive');
  const field = doc.getForm().createTextField('patient.name'); field.addToPage(page); field.enableReadOnly();
  const bytes = await doc.save();
  expect((await inspectForms(bytes))[0].readOnly).toBe(true);
  await expect(modifyForm(bytes, { action: 'fill', name: 'patient.name', value: 'Alex' })).rejects.toThrow(/read-only/);
  doc.catalog.lookup(PDFName.of('AcroForm'), PDFDict).set(PDFName.of('Fields'), doc.context.obj([]));
  expect((await diagnoseForms(await doc.save())).orphanWidgets).toBe(1);
});
it('round-trips multipage repeated widgets, logical values and fresh appearances without flattening', async () => {
  const doc = await PDFDocument.create(); const form = doc.getForm();
  const field = form.createTextField('patient.name');
  for (let i=0;i<2;i++) field.addToPage(doc.addPage(), { x: 40, y: 400, width: 200, height: 24 });
  const other = form.createTextField('untouched'); other.addToPage(doc.getPage(0)); other.setText('Original');
  const original = await doc.save();
  const output = await modifyForm(original, { action: 'fill', name: 'patient.name', value: 'Alex Patient' });
  const reopened = await PDFDocument.load(output);
  expect(reopened.getForm().getTextField('patient.name').getText()).toBe('Alex Patient');
  expect(reopened.getForm().getTextField('untouched').getText()).toBe('Original');
  const widgets = reopened.getForm().getTextField('patient.name').acroField.getWidgets();
  expect(widgets).toHaveLength(2);
  for (const widget of widgets) expect(widget.dict.lookup(PDFName.of('AP'), PDFDict).has(PDFName.of('N'))).toBe(true);
  expect((await inspectForms(output))[0].widgets.map(w => w.pageIndex)).toEqual([0,1]);
});
