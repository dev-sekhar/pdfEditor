import React, { useRef, useState } from 'react';

// PDF.js owns the viewport transform: these coordinates stay correct at every
// zoom and rotation. The rendered PDF supplies the text; handles stay transparent.
export default function TextOverlayLayer({ viewport, annotations = [], placing, disabled,
  onPlace, onMove, onSelect }) {
  const drag = useRef(null);
  const [moving, setMoving] = useState(null);
  const clamp = (x, y) => {
    const [left, bottom, right, top] = viewport.viewBox;
    return [Math.max(left, Math.min(right, x)), Math.max(bottom, Math.min(top, y))];
  };
  const point = event => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    const [x, y] = viewport.convertToPdfPoint(event.clientX - rect.left, event.clientY - rect.top);
    return clamp(x, y);
  };
  return <svg className={`text-overlay-layer ${placing ? 'placing' : ''}`}
    width={viewport.width} height={viewport.height} aria-label="Text overlay placement"
    style={{ pointerEvents: placing && !disabled ? 'auto' : 'none' }}
    onClick={event => { if (!disabled && placing && event.target === event.currentTarget) onPlace(...point(event)); }}>
    {annotations.filter(item => item.type === 'text').map(item => {
      const position = moving?.id === item.id ? moving : item;
      const [x, y] = viewport.convertToViewportPoint(position.x, position.y);
      return <g key={item.id} transform={`translate(${x} ${y})`}>
        <circle r="10" className="text-overlay-handle" role="button" tabIndex={disabled ? -1 : 0}
          aria-label={`Move text: ${item.text}`} style={{ pointerEvents: disabled ? 'none' : 'auto' }}
          onClick={event => { event.stopPropagation(); onSelect?.(item.id); }}
          onKeyDown={event => {
            const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
            if (!disabled && delta) {
              event.preventDefault();
              const [screenX, screenY] = viewport.convertToViewportPoint(item.x, item.y);
              const distance = event.shiftKey ? 10 : 1;
              const [nextX, nextY] = viewport.convertToPdfPoint(screenX + delta[0] * distance, screenY + delta[1] * distance);
              const [left, bottom, right, top] = viewport.viewBox;
              onMove(item.id, Math.max(left, Math.min(right, nextX)), Math.max(bottom, Math.min(top, nextY)));
            }
          }}
          onPointerDown={event => {
            if (disabled || event.button !== 0) return;
            event.preventDefault(); event.stopPropagation();
            onSelect?.(item.id);
            const [px, py] = point(event);
            drag.current = { id: item.id, dx: item.x - px, dy: item.y - py };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            if (!drag.current || drag.current.id !== item.id) return;
            const [px, py] = point(event);
            const [x, y] = clamp(px + drag.current.dx, py + drag.current.dy);
            setMoving({ id: item.id, x, y });
          }}
          onPointerUp={event => {
            if (!drag.current || drag.current.id !== item.id) return;
            const [px, py] = point(event);
            const { dx, dy } = drag.current;
            drag.current = null;
            setMoving(null);
            event.currentTarget.releasePointerCapture(event.pointerId);
            // One commit per completed drag, rather than one per pixel.
            const [x, y] = clamp(px + dx, py + dy);
            if (Math.abs(x - item.x) > 0.01 || Math.abs(y - item.y) > 0.01) {
              onMove(item.id, x, y);
            }
          }}
          onPointerCancel={() => { drag.current = null; setMoving(null); }} />
        <path d="M-4 0H4M0-4V4" pointerEvents="none" stroke="white" />
      </g>;
    })}
  </svg>;
}
