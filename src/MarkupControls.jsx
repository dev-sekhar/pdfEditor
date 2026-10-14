import React, { useState } from 'react';

export default function MarkupControls({ selection, annotations = [], disabled, onAdd, onRemove }) {
  const [color, setColor] = useState('#ffd43b');
  return <div className="markup-controls">
    <h3>Highlight & underline</h3>
    <p>Select text on the page, then apply markup. Scanned pages need OCR for text selection.</p>
    <label>Markup color <input aria-label="Markup color" type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
    <button disabled={disabled || !selection?.rects?.length} onClick={() => onAdd('highlight', color)}>Highlight selection</button>
    <button disabled={disabled || !selection?.rects?.length} onClick={() => onAdd('underline', color)}>Underline selection</button>
    <ul className="markup-list">{annotations.filter(item => ['highlight', 'underline'].includes(item.type)).map((item, i) => <li key={item.id}>
      <strong>{item.type === 'highlight' ? 'Highlight' : 'Underline'}</strong><p>{item.text}</p>
      <button disabled={disabled} aria-label={`Delete markup ${i + 1}`} onClick={() => onRemove(item.id)}>Delete markup</button>
    </li>)}</ul>
  </div>;
}
