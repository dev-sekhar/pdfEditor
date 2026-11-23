import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { inspectForms, modifyForm } from './forms';
import { assemble } from './pdf';

async function fixture() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([500, 700]);
  const form = pdf.getForm();
  const name = form.createTextField('customer');
  name.addToPage(page, { x: 50, y: 620, width: 180, height: 25 });
  const checkbox = form.createCheckBox('consent');
  checkbox.addToPage(page, { x: 50, y: 580, width: 20, height: 20 });
  const dropdown = form.createDropdown('region');
  dropdown.addOptions(['North', 'South']);
  dropdown.addToPage(page, { x: 50, y: 530, width: 140, height: 25 });
  const radio = form.createRadioGroup('plan');
  radio.addOptionToPage('Basic', page, { x: 50, y: 480, width: 20, height: 20 });
  radio.addOptionToPage('Premium', page, { x: 80, y: 480, width: 20, height: 20 });
  return await pdf.save();
}
describe('Interactive PDF forms', () => {
  it('inspects existing fields and retains them during source-preserving assembly', async () => {
    const bytes = await fixture();
    const fields = await inspectForms(bytes);
    expect(fields.map(f => f.name)).toEqual(['customer', 'consent', 'region', 'plan']);
    const output = await assemble([{ bytes }], [{ source: 0, index: 0, rotation: 0, annotations: [] }]);
    expect((await PDFDocument.load(output)).getForm().getFields()).toHaveLength(4);
    await expect(assemble([{ bytes }], [])).rejects.toThrow(/Form fields/);
  });
  it('fills text, checkbox, dropdown and radio fields without flattening them', async () => {
    let bytes = await fixture();
    for (const command of [
      { action: 'fill', name: 'customer', value: 'Alex' },
      { action: 'fill', name: 'consent', value: true },
      { action: 'fill', name: 'region', value: 'South' },
      { action: 'fill', name: 'plan', value: 'Premium' },
    ]) bytes = await modifyForm(bytes, command);
    const fields = await inspectForms(bytes);
    expect(fields.map(f => f.value)).toEqual(['Alex', true, 'South', 'Premium']);
  });
  it('edits field name, required flag, and dimensions', async () => {
    const bytes = await modifyForm(await fixture(), {
      action: 'edit', name: 'customer', rename: 'applicant',
      required: true, rect: { x: 30, y: 600, width: 200, height: 30 },
    });
    const field = (await inspectForms(bytes)).find(f => f.name === 'applicant');
    expect(field.required).toBe(true);
    expect(field.widgets[0].rect).toEqual({ x: 30, y: 600, width: 200, height: 30 });
  });
  it('creates interactive fields and rejects invalid positions', async () => {
    const bytes = await modifyForm(await fixture(), {
      action: 'create', type: 'text', name: 'newField', pageIndex: 0,
      rect: { x: 20, y: 100, width: 120, height: 25 },
    });
    expect((await inspectForms(bytes)).map(f => f.name)).toContain('newField');
    await expect(modifyForm(bytes, {
      action: 'create', type: 'text', name: 'offPage', pageIndex: 0,
      rect: { x: 999, y: 20, width: 100, height: 20 },
    })).rejects.toThrow(/fit within/);
  });
  it('updates dropdown choices', async () => {
    const bytes = await modifyForm(await fixture(), { action: 'edit', name: 'region', options: ['East','West'] });
    expect((await inspectForms(bytes)).find(f => f.name === 'region').options).toEqual(['East','West']);
  });
});
