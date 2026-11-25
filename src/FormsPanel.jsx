import React, { useEffect, useState } from 'react';
import { inspectForms, diagnoseForms } from './forms';

const TYPES = [['text', 'Text'], ['checkbox', 'Checkbox'], ['radio', 'Radio group'], ['dropdown', 'Dropdown'], ['list', 'List']];
function parseOptions(value) { return value.split(/\r?\n|,/).map(v => v.trim()).filter(Boolean); }
const number = value => Number(value);

export default function FormsPanel({ bytes, pageIndex, disabled, onModify, onFillPrinted }) {
  const [fields, setFields] = useState([]);
  const [diagnosis, setDiagnosis] = useState(null);
  const [selected, setSelected] = useState('');
  const [mode, setMode] = useState('fill');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({});
  useEffect(() => {
    let live = true;
    if (!bytes) { setFields([]); setDiagnosis(null); setError(''); return; }
    setFields([]); setDiagnosis(null);
    Promise.all([inspectForms(bytes), diagnoseForms(bytes)]).then(([items, info]) => { if (live) { setFields(items); setDiagnosis(info); setError(''); } })
      .catch(cause => { if (live) setError('Could not read PDF form fields: ' + cause.message); });
    return () => { live = false; };
  }, [bytes]);
  const active = fields.find(field => field.name === selected);
  useEffect(() => {
    if (!active) return;
    const rect = active.widgets[0]?.rect || { x: 40, y: 40, width: 160, height: 24 };
    setDraft({ name: active.name, required: active.required, value: active.value,
      options: (active.options || []).join('\n'), ...rect });
  }, [active]);
  function createDraft() {
    setSelected('');
    setDraft({ name: '', type: 'text', required: false, x: 40, y: 40, width: 160, height: 24, options: '' });
    setMode('create');
  }
  async function apply() {
    setError('');
    try {
      if (mode === 'create') {
        await onModify({ action: 'create', pageIndex, name: draft.name, type: draft.type,
          required: draft.required, rect: rectangle(), options: parseOptions(draft.options || '') });
      } else if (mode === 'fill') {
        await onModify({ action: 'fill', name: selected,
          value: active.type === 'checkbox' ? Boolean(draft.value) : draft.value });
      } else {
        await onModify({ action: 'edit', name: selected, rename: draft.name,
          required: Boolean(draft.required), rect: rectangle(),
          ...(active.type === 'dropdown' || active.type === 'list' ? { options: parseOptions(draft.options || '') } : {}) });
      }
    } catch (cause) { setError(String(cause.message || cause)); }
  }
  function rectangle() { return Object.fromEntries(['x','y','width','height'].map(key => [key, number(draft[key])])); }
  const update = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  disabled = disabled || !diagnosis || diagnosis.protected;
  return <section className="forms-panel" aria-label="PDF forms">
    <h3>PDF forms</h3>
    {diagnosis && <p role="status" aria-label="Form diagnosis">{diagnosis.message}</p>}
    {diagnosis && !diagnosis.protected && <button disabled={disabled} onClick={onFillPrinted}>{fields.length?'Type into fields on page':'Recognize blanks and fill directly'}</button>}
    {fields.length>0&&<p>Type directly into the highlighted fields on the page. Tab moves between fields. Save PDF writes all values and keeps the fields editable.</p>}
    {active?.readOnly && <p>This field is read-only.</p>}
    <p className="muted">Fill fields, edit their properties, or add interactive fields. Labels printed on the page are separate PDF text.</p>
    <label>Existing fields
      <select aria-label="Existing form field" value={selected} onChange={event => { setSelected(event.target.value); setMode('fill'); }} disabled={disabled || !fields.length}>
        <option value="">Select a field</option>
        {fields.map(field => <option key={field.name} value={field.name}>{field.name} ({field.type})</option>)}
      </select>
    </label>
    <div className="form-actions">
      <button disabled={disabled || !active || active.type === 'unsupported'} onClick={() => setMode('fill')}>Fill</button>
      <button disabled={disabled || !active || active.type === 'unsupported'} onClick={() => setMode('edit')}>Edit field</button>
      <button disabled={disabled || !bytes} onClick={createDraft}>Create field</button>
    </div>
    {(mode === 'create' || active) && <>
      <p><strong>{mode === 'create' ? 'New field' : mode === 'edit' ? 'Field properties' : 'Field value'}</strong></p>
      {mode !== 'fill' && <>
        <label>Field name<input aria-label="Form field name" value={draft.name ?? ''} onChange={e => update('name', e.target.value)} disabled={disabled}/></label>
        {mode === 'create' && <label>Field type<select aria-label="Form field type" value={draft.type} onChange={e => update('type', e.target.value)}>{TYPES.map(([v,t]) => <option key={v} value={v}>{t}</option>)}</select></label>}
        <label><input type="checkbox" checked={Boolean(draft.required)} onChange={e => update('required', e.target.checked)}/> Required</label>
        <p className="muted">Position and size in PDF points from bottom-left of page.</p>
        <div className="field-geometry">{['x','y','width','height'].map(k => <label key={k}>{k}<input type="number" aria-label={'Field ' + k} value={draft[k] ?? 0} onChange={e => update(k, e.target.value)}/></label>)}</div>
        {(mode === 'create' ? ['radio', 'dropdown', 'list'].includes(draft.type) : ['dropdown', 'list'].includes(active?.type)) &&
          <label>Choices (one per line)<textarea aria-label="Form field choices" value={draft.options ?? ''} onChange={e => update('options', e.target.value)}/></label>}
      </>}
      {mode === 'fill' && active && (active.type === 'checkbox'
        ? <label><input type="checkbox" checked={Boolean(draft.value)} onChange={e => update('value', e.target.checked)}/> Checked</label>
        : ['radio','dropdown'].includes(active.type)
          ? <label>Value<select aria-label="Form field value" value={draft.value || ''} onChange={e => update('value', e.target.value)}><option value="">Choose…</option>{active.options.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
          : active.type === 'list'
            ? <label>Value<select aria-label="Form field value" value={Array.isArray(draft.value) ? draft.value[0] || '' : draft.value || ''} onChange={e => update('value', [e.target.value])}><option value="">Choose…</option>{active.options.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
            : <label>Value<input aria-label="Form field value" value={draft.value ?? ''} onChange={e => update('value', e.target.value)} /></label>)}
      <button className="primary" disabled={disabled || active?.readOnly || active?.type === 'unsupported'} onClick={apply}>Apply form change</button>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
