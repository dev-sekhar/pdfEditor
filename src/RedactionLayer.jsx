import React, { useEffect, useId, useRef, useState } from 'react';
import './redaction.css';

export default function RedactionLayer({ viewport, marks = [], marking, disabled, onAdd, onRemove }) {
  const svg = useRef(null);
  const drag = useRef(null);
  const [draft, setDraft] = useState(null);
  const patternId = `redaction-hatch-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    // Zoom, rotation, or a mode change invalidates an unfinished pointer drag.
    drag.current = null;
    setDraft(null);
  }, [viewport, marking, disabled]);

  const point = event => {
    const bounds = svg.current.getBoundingClientRect();
    const [x, y] = viewport.convertToPdfPoint(event.clientX - bounds.left, event.clientY - bounds.top);
    const [left, bottom, right, top] = viewport.viewBox;
    return [Math.max(left, Math.min(right, x)), Math.max(bottom, Math.min(top, y))];
  };
  const rectangle = (start, end) => [Math.min(start[0], end[0]), Math.min(start[1], end[1]), Math.max(start[0], end[0]), Math.max(start[1], end[1])];
  const displayRect = rect => {
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(rect);
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2-x1), height: Math.abs(y2-y1) };
  };
  const finish = event => {
    if (drag.current?.pointerId !== event.pointerId) return;
    const rect = rectangle(drag.current.start, point(event));
    drag.current = null;
    setDraft(null);
    if (svg.current.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
    if (!marking || disabled || rect[2] - rect[0] < 2 || rect[3] - rect[1] < 2) return;
    onAdd({ id: crypto.randomUUID(), rect });
  };

  return <svg ref={svg} className={`redaction-layer ${marking && !disabled ? 'marking' : ''}`}
    width={viewport.width} height={viewport.height} aria-label="Redaction marking canvas" role="group"
    tabIndex={marking && !disabled ? 0 : -1}
    style={{ pointerEvents: marking && !disabled ? 'auto' : 'none' }}
    onPointerDown={event => {
      if (!marking || disabled || event.button !== 0 || drag.current) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      drag.current = { start: point(event), pointerId: event.pointerId };
      setDraft(rectangle(drag.current.start, drag.current.start));
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={event => {
      if (!marking || disabled || drag.current?.pointerId !== event.pointerId) return;
      setDraft(rectangle(drag.current.start, point(event)));
    }} onPointerUp={finish} onPointerCancel={() => { drag.current = null; setDraft(null); }}
    onLostPointerCapture={() => { drag.current = null; setDraft(null); }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); drag.current = null; setDraft(null); }
    }}>
    <defs><pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <path d="M0 0V8" stroke="#dc2626" strokeWidth="2" />
    </pattern></defs>
    {marks.map((mark, index) => {
      const display = displayRect(mark.rect);
      const deleteX = Math.max(10, Math.min(viewport.width - 10, display.x + display.width - 8));
      const deleteY = Math.max(10, Math.min(viewport.height - 10, display.y + 8));
      return <g key={mark.id}>
        <rect {...display} fill={`url(#${patternId})`} className="pending-redaction-mark" role="img" aria-label={`Pending redaction ${index + 1}`} />
        <text x={Math.max(2, display.x + 3)} y={Math.max(12, display.y - 4)} className="pending-redaction-label" pointerEvents="none">PENDING {index + 1}</text>
        {marking && !disabled && <g className="redaction-remove-handle" transform={`translate(${deleteX} ${deleteY})`}
          role="button" tabIndex={0} aria-label={`Remove pending redaction ${index + 1}`}
          onPointerDown={event => { event.stopPropagation(); }}
          onClick={event => { event.stopPropagation(); onRemove(mark.id); }}
          onKeyDown={event => {
            if (['Enter', ' ', 'Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); onRemove(mark.id); }
          }}>
          <circle r="9" /><path d="M-3-3L3 3M3-3L-3 3" pointerEvents="none" />
        </g>}
      </g>;
    })}
    {draft && <rect {...displayRect(draft)} fill={`url(#${patternId})`} className="pending-redaction-mark drawing" pointerEvents="none" />}
  </svg>;
}
