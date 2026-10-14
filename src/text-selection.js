export function selectionRects(selection, container, viewport) {
  if (!selection?.rangeCount || selection.isCollapsed || !container || !viewport) return [];
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return [];
  const bounds = container.getBoundingClientRect();
  return Array.from(range.getClientRects()).filter(rect => rect.width > 1 && rect.height > 1).map(rect => {
    const corners = [[rect.left, rect.top], [rect.right, rect.top], [rect.left, rect.bottom], [rect.right, rect.bottom]]
      .map(([x, y]) => viewport.convertToPdfPoint(x - bounds.left, y - bounds.top));
    return [Math.min(...corners.map(p => p[0])), Math.min(...corners.map(p => p[1])), Math.max(...corners.map(p => p[0])), Math.max(...corners.map(p => p[1]))];
  });
}


