export const ZOOM_LEVELS = [25, 50, 75, 100, 125, 150, 200, 250, 300];
export const clampZoom = percent => Math.max(25, Math.min(300, percent));
export function stepZoom(current, direction) {
  return direction > 0 ? (ZOOM_LEVELS.find(level => level > current) ?? 300) :
    ([...ZOOM_LEVELS].reverse().find(level => level < current) ?? 25);
}
export function previewScale(mode, page, viewport) {
  if (typeof mode === 'number') return clampZoom(mode) / 100;
  const width = viewport.width / page.width;
  const height = viewport.height / page.height;
  return clampZoom(100 * (mode === 'fit-page' ? Math.min(width, height) : width)) / 100;
}

export function reorderAt(pages, sourceId, targetId, position) {
  const source = pages.findIndex(page => page.id === sourceId);
  const target = pages.findIndex(page => page.id === targetId);
  if (source < 0 || target < 0 || source === target) return pages;
  const insertion = target + (position === 'after' ? 1 : 0);
  const destination = insertion - (source < insertion ? 1 : 0);
  if (source === destination) return pages;
  const result = [...pages];
  const [moved] = result.splice(source, 1);
  result.splice(destination, 0, moved);
  return result;
}
