import React, { useEffect, useState } from 'react';

export default function AnnotationInspector({ annotations = [], selectedId, disabled, onSelect, onApply, onDelete }) {
  const selected = annotations.find(item => item.id === selectedId);
  const [draft, setDraft] = useState({ text: '', color: '#ffd43b' });
  useEffect(() => setDraft({ text: selected?.text ?? '', color: selected?.color ?? '#ffd43b' }), [selected]);
  const markup = selected && ['highlight', 'underline'].includes(selected.type);
  const textEditable = selected && ['text', 'comment'].includes(selected.type);
  const changed = selected && (markup ? draft.color !== selected.color : textEditable && draft.text !== selected.text);
  return <div className="annotation-inspector">
    <h3>Edit annotations</h3>
    <p>Studio comments, highlights, and underlines stay editable after reopening. Text overlays are editable this session. Other imported annotations are preserved.</p>
    <label>Annotation <select aria-label="Annotation to edit" value={selected?.id ?? ''} disabled={disabled || !annotations.length}
      onChange={event => onSelect(event.target.value || null)}>
      <option value="">Choose an annotation</option>
      {annotations.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.type}: {item.text?.slice(0, 40)}</option>)}
    </select></label>
    {textEditable && <label>Content<textarea aria-label="Annotation content" value={draft.text} disabled={disabled}
      onChange={event => setDraft(value => ({ ...value, text: event.target.value }))} /></label>}
    {markup && <label>Markup color<input aria-label="Selected annotation color" type="color" value={draft.color} disabled={disabled}
      onChange={event => setDraft(value => ({ ...value, color: event.target.value }))} /></label>}
    {selected && <>
      <button disabled={disabled || !changed || (textEditable && !draft.text.trim())} onClick={() => onApply(selected.id, draft)}>Apply annotation changes</button>
      <button disabled={disabled} onClick={() => onDelete(selected.id)}>Delete selected annotation</button>
    </>}
  </div>;
}
