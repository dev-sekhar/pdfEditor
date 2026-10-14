import React, { useEffect, useState } from 'react';
import { TEXT_FONTS, DEFAULT_TEXT_STYLE } from './text-overlays';

const CSS_FONTS = { Helvetica: 'Arial, sans-serif', TimesRoman: '"Times New Roman", serif', Courier: '"Courier New", monospace' };

export default function TextStyleControls({ defaults, selected, annotations, disabled, previewText,
  onDefaultsChange, onSelect, onApply, onValidityChange }) {
  const [draft, setDraft] = useState(defaults);
  useEffect(() => {
    setDraft(selected ? { font: selected.font, size: selected.size, color: selected.color } : defaults);
  }, [selected?.id, selected?.font, selected?.size, selected?.color, defaults]);
  const validSize = Number.isFinite(Number(draft.size)) && Number(draft.size) >= 6 && Number(draft.size) <= 144;
  useEffect(() => { onValidityChange?.(validSize); }, [validSize, onValidityChange]);
  const changed = selected && (draft.font !== selected.font || Number(draft.size) !== selected.size || draft.color !== selected.color);
  const update = patch => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (!selected && Number.isFinite(Number(next.size)) && Number(next.size) >= 6 && Number(next.size) <= 144) {
      onDefaultsChange({ ...next, size: Number(next.size) });
    }
  };
  return <div className="text-style-controls" role="group" aria-label="Text style controls">
    <label htmlFor="style-overlay">Style target</label>
    <select id="style-overlay" value={selected?.id ?? ''} disabled={disabled} onChange={event => onSelect(event.target.value || null)}>
      <option value="">New text defaults</option>
      {annotations.filter(item => item.type === 'text').map((item, index) =>
        <option key={item.id} value={item.id}>Overlay {index + 1}: {item.text.slice(0, 30)}</option>)}
    </select>
    <label htmlFor="text-font">Font family</label>
    <select id="text-font" value={draft.font} disabled={disabled} onChange={event => update({ font: event.target.value })}>
      {TEXT_FONTS.map(font => <option key={font} value={font}>{font === 'TimesRoman' ? 'Times' : font}</option>)}
    </select>
    <label htmlFor="text-size">Font size (points)</label>
    <input id="text-size" type="number" min="6" max="144" step="1" value={draft.size} disabled={disabled}
      aria-invalid={!validSize} onChange={event => update({ size: event.target.value })} />
    {!validSize && <p className="error">Choose a size between 6 and 144 points.</p>}
    <label htmlFor="text-color">Text color</label>
    <input id="text-color" type="color" value={draft.color} disabled={disabled} onChange={event => update({ color: event.target.value })} />
    <p className="muted">Style preview · Standard PDF fonts support Latin characters.</p>
    <div className="text-style-preview" aria-label="Text style preview" style={{ fontFamily: CSS_FONTS[draft.font],
      fontSize: `${validSize ? Number(draft.size) : DEFAULT_TEXT_STYLE.size}pt`, color: draft.color }}>
      {selected?.text || previewText || 'Aa Bb 123'}
    </div>
    {selected && <>
      <p className="muted">Preview changes above, then apply to the selected overlay.</p>
      <button disabled={disabled || !validSize || !changed} onClick={() => onApply({ ...draft, size: Number(draft.size) })}>Apply text style</button>
    </>}
  </div>;
}
