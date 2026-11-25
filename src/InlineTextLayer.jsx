import React, { useEffect, useState } from 'react';
import { inspectInlineText } from './inline-text';

export default function InlineTextLayer({ bytes, pageIndex, viewport, disabled, onReplace }) {
  const [runs, setRuns] = useState([]), [error, setError] = useState(''), [active, setActive] = useState(null), [value, setValue] = useState('');
  useEffect(() => {
    let live = true;
    setRuns([]); setActive(null); setError('');
    inspectInlineText(bytes, pageIndex).then(items => { if (live) { setRuns(items); if (!items.length) setError('No supported text found. Scans require OCR; use Add text to fill visually.'); } }).catch(cause => { if (live) setError(cause.message); });
    return () => { live = false; };
  }, [bytes, pageIndex]);
  return <div className="inline-text-layer">
    <div className="inline-help" role="status">{error || 'Click a text run to edit its actual PDF content. Same font and position; replacement must fit. No reflow. This is not secure redaction.'}</div>
    {runs.map(run => {
      const rect = viewport.convertToViewportRectangle([run.x, run.y, run.x + Math.max(run.width, 8), run.y + run.size]);
      const style = { left: Math.min(rect[0], rect[2]), top: Math.min(rect[1], rect[3]), width: Math.abs(rect[2]-rect[0]), height: Math.abs(rect[3]-rect[1]) };
      return <button key={run.id} className="inline-run" style={style} aria-label={'Edit existing text: ' + run.text} disabled={disabled} onClick={() => { setActive(run); setValue(run.text); setError(''); }} />;
    })}
    {active && <form className="inline-editor" style={{ left: viewport.convertToViewportPoint(active.x,active.y)[0], top: viewport.convertToViewportPoint(active.x,active.y)[1] }} onSubmit={async event => {
      event.preventDefault(); setError('');
      try { await onReplace(active, value); } catch (cause) { setError(cause.message); }
    }}>
      <input autoFocus aria-label="Existing text replacement" value={value} onChange={event => setValue(event.target.value)} disabled={disabled} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setActive(null); } }}/>
      <button disabled={disabled}>Apply text edit</button><button type="button" onClick={() => setActive(null)}>Cancel</button>
    </form>}
  </div>;
}
