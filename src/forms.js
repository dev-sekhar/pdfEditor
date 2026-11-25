import { PDFDocument, PDFName, PDFString, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList } from 'pdf-lib';
import { formDiagnostics, requireEditableForm } from './form-diagnostics';

const TYPES = [[PDFTextField, 'text'], [PDFCheckBox, 'checkbox'],
  [PDFRadioGroup, 'radio'], [PDFDropdown, 'dropdown'], [PDFOptionList, 'list']];

// Bundlers rename classes; constructor.name is not a stable PDF field type.
function kind(field) { return TYPES.find(([Type]) => field instanceof Type)?.[1] ?? 'unsupported'; }
function requireName(name) {
  if (typeof name !== 'string' || !name.trim() || name.length > 120 || /[\x00-\x1f]/.test(name)) {
    throw new Error('Field name must contain 1–120 printable characters.');
  }
  return name.trim();
}
function requireRect(rect, page) {
  const { x, y, width, height } = rect;
  if (![x, y, width, height].every(Number.isFinite) || width < 8 || height < 8 ||
      x < 0 || y < 0 || x + width > page.getWidth() + 0.01 || y + height > page.getHeight() + 0.01) {
    throw new Error('The field must fit within the selected page (PDF points).');
  }
}
function fieldValue(field, type) {
  if (type === 'text') return field.getText() ?? '';
  if (type === 'checkbox') return field.isChecked();
  if (type === 'radio') return field.getSelected?.() ?? '';
  if (type === 'dropdown') return field.getSelected?.()[0] ?? '';
  if (type === 'list') return field.getSelected?.() ?? [];
  return null;
}
function widgetLocations(doc, field) {
  const widgets = field.acroField.getWidgets();
  return widgets.map(widget => {
    const pageIndex = doc.getPages().findIndex(page => {
      const refs = page.node.Annots()?.asArray() ?? [];
      return refs.some(ref => doc.context.lookup(ref) === widget.dict);
    });
    return { pageIndex, rect: widget.getRectangle() };
  });
}
export async function inspectForms(bytes) {
  const doc = await PDFDocument.load(bytes);
  if (formDiagnostics(doc).protected) return [];
  return doc.getForm().getFields().map(field => {
    const type = kind(field);
    return {
      name: field.getName(), type, value: fieldValue(field, type),
      required: field.isRequired(),
      readOnly: field.isReadOnly(),
      multiline: type === 'text' && field.isMultiline(),
      combed: type === 'text' && field.isCombed(),
      multiselect: type === 'list' && field.isMultiselect(),
      maxLength: type === 'text' ? field.getMaxLength() : undefined,
      options: type === 'radio' || type === 'dropdown' || type === 'list' ? field.getOptions() : [],
      widgets: widgetLocations(doc, field),
    };
  });
}

export async function fillFormValues(bytes, values) {
  const doc = await PDFDocument.load(bytes);
  requireEditableForm(doc);
  const form = doc.getForm();
  for (const [name,value] of Object.entries(values)) {
    const field = form.getField(name), type = kind(field);
    if (field.isReadOnly()) throw new Error(`${name} is read-only.`);
    if (type === 'text') field.setText(String(value ?? ''));
    else if (type === 'checkbox') value ? field.check() : field.uncheck();
    else if (['radio','dropdown','list'].includes(type)) {
      const list = Array.isArray(value) ? value : value ? [String(value)] : [];
      if (list.some(item => !field.getOptions().includes(item))) throw new Error(`Invalid choice for ${name}.`);
      if (!list.length) field.clear();
      else field.select(type === 'list' ? list : list[0]);
    } else throw new Error(`${name} cannot be filled.`);
    field.defaultUpdateAppearances(await form.getDefaultFont());
  }
  form.acroForm.dict.set(PDFName.of('NeedAppearances'), doc.context.obj(false));
  return new Uint8Array(await doc.save({updateFieldAppearances:false}));
}

export async function createDetectedFields(bytes, proposals) {
  const doc = await PDFDocument.load(bytes);
  requireEditableForm(doc);
  const form = doc.getForm(), names = new Set(form.getFields().map(field=>field.getName()));
  const existing=form.getFields().flatMap(field=>widgetLocations(doc,field));
  if (!Array.isArray(proposals) || !proposals.length || proposals.length > 500) throw new Error('Select between 1 and 500 proposed fields.');
  for (const proposal of proposals) {
    const page = doc.getPage(proposal.pageIndex);
    if (!page) throw new Error('Invalid field page.');
    requireRect(proposal.rect,page);
    if (!['text','checkbox'].includes(proposal.type)) throw new Error('Unsupported detected field type.');
    const r=proposal.rect;
    if (existing.some(w=>w.pageIndex===proposal.pageIndex && Math.min(w.rect.x+w.rect.width,r.x+r.width)>Math.max(w.rect.x,r.x)+1 && Math.min(w.rect.y+w.rect.height,r.y+r.height)>Math.max(w.rect.y,r.y)+1)) throw new Error('A proposed field overlaps an existing field. Deselect it and retry.');
    let serial=1,name;
    do { name=`Detected_p${proposal.pageIndex+1}_${proposal.type}_${serial++}`; } while(names.has(name));
    names.add(name);
    const field=proposal.type==='checkbox'?form.createCheckBox(name):form.createTextField(name);
    if(proposal.type==='text'&&!proposal.comb&&r.height>24)field.enableMultiline();
    if (proposal.comb) { field.setMaxLength(proposal.comb); field.enableCombing(); }
    field.addToPage(page,{...r,borderWidth:0,backgroundColor:undefined,borderColor:undefined});
    existing.push({pageIndex:proposal.pageIndex,rect:r});
    field.defaultUpdateAppearances(await form.getDefaultFont());
  }
  form.acroForm.dict.set(PDFName.of('NeedAppearances'),doc.context.obj(false));
  return new Uint8Array(await doc.save({updateFieldAppearances:false}));
}
export async function hasFormFields(bytes) {
  const doc = await PDFDocument.load(bytes);
  const info = formDiagnostics(doc);
  return info.fields > 0 || info.protected;
}
export async function diagnoseForms(bytes) {
  return formDiagnostics(await PDFDocument.load(bytes));
}
export async function modifyForm(bytes, operation) {
  const doc = await PDFDocument.load(bytes);
  requireEditableForm(doc);
  const form = doc.getForm();
  const name = operation.name;
  if (operation.action === 'create') {
    const fieldName = requireName(name);
    if (form.getFields().some(field => field.getName() === fieldName)) throw new Error('Field name already exists.');
    const page = doc.getPage(operation.pageIndex);
    if (!page) throw new Error('Invalid page.');
    const rect = operation.rect;
    requireRect(rect, page);
    const opts = { ...rect, borderWidth: 1 };
    let field;
    switch (operation.type) {
      case 'text': field = form.createTextField(fieldName); break;
      case 'checkbox': field = form.createCheckBox(fieldName); break;
      case 'radio': field = form.createRadioGroup(fieldName); break;
      case 'dropdown': field = form.createDropdown(fieldName); break;
      case 'list': field = form.createOptionList(fieldName); break;
      default: throw new Error('Unsupported field type.');
    }
    field.enableRequired?.();
    if (!operation.required) field.disableRequired?.();
    if (operation.type === 'radio') {
      const options = (operation.options ?? []).map(x => x.trim()).filter(Boolean);
      if (!options.length) throw new Error('Radio fields require options.');
      options.forEach((value, i) => field.addOptionToPage(value, page, { ...opts, y: rect.y + i * (rect.height + 8) }));
    } else {
      if (operation.type === 'dropdown' || operation.type === 'list') {
        field.addOptions((operation.options ?? []).map(x => x.trim()).filter(Boolean));
      }
      field.addToPage(page, opts);
    }
  } else {
    const field = form.getField(name);
    const type = kind(field);
    if (field.isReadOnly()) throw new Error('This field is read-only.');
    if (type === 'unsupported') throw new Error('This field type cannot be edited.');
    if (operation.action === 'fill') {
      if (type === 'text') field.setText(String(operation.value ?? ''));
      else if (type === 'checkbox') operation.value ? field.check() : field.uncheck();
      else if (type === 'radio' || type === 'dropdown' || type === 'list') {
        const options = field.getOptions();
        const selection = type === 'list' ? operation.value : String(operation.value ?? '');
        const values = Array.isArray(selection) ? selection : [selection];
        if (values.every(value => value === '')) field.clear();
        else {
          if (values.some(value => !options.includes(value))) throw new Error('Select a valid field option.');
          field.select(selection);
        }
      }
    } else if (operation.action === 'edit') {
      if (typeof operation.required === 'boolean') operation.required ? field.enableRequired() : field.disableRequired();
      if (operation.rename && operation.rename !== name) {
        const next = requireName(operation.rename);
        if (name.includes('.') || next.includes('.')) throw new Error('Renaming nested fields is not supported.');
        if (form.getFields().some(item => item.getName() === next)) throw new Error('Field name already exists.');
        field.acroField.setPartialName(next);
      }
      if (operation.rect) {
        const widgets = field.acroField.getWidgets();
        if (widgets.length !== 1) throw new Error('Position editing requires a field with exactly one widget.');
        const location = widgetLocations(doc, field)[0];
        if (location.pageIndex < 0) throw new Error('Could not locate the field page.');
        requireRect(operation.rect, doc.getPage(location.pageIndex));
        widgets[0].setRectangle(operation.rect);
      }
      if (operation.options !== undefined) {
        if (type !== 'dropdown' && type !== 'list') throw new Error('Options can only be changed for choice fields.');
        const options = operation.options.map(x => String(x).trim()).filter(Boolean);
        if (!options.length || new Set(options).size !== options.length) throw new Error('Provide unique nonempty choices.');
        if (JSON.stringify(options) !== JSON.stringify(field.getOptions())) {
          field.clear();
          field.acroField.dict.set(PDFName.of('Opt'), doc.context.obj(options.map(x => PDFString.of(x))));
        }
      }
    } else throw new Error('Unknown form operation.');
  }
  // Regenerate only the changed field. Other fields may use embedded fonts or
  // custom appearances which must survive untouched.
  const changed = form.getField(operation.rename || name);
  changed.defaultUpdateAppearances(await form.getDefaultFont());
  form.acroForm.dict.set(PDFName.of('NeedAppearances'), doc.context.obj(false));
  return new Uint8Array(await doc.save({ updateFieldAppearances: false }));
}
