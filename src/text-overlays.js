import { StandardFonts, rgb } from 'pdf-lib';

export const TEXT_FONTS = ['Helvetica', 'TimesRoman', 'Courier'];
export const DEFAULT_TEXT_STYLE = { font: 'Helvetica', size: 14, color: '#000000' };

export function validateTextOverlay(value) {
  if (!value.text?.trim()) throw new Error('Enter text before placing an overlay.');
  if (!TEXT_FONTS.includes(value.font)) throw new Error('Choose a supported font.');
  if (!Number.isFinite(value.size) || value.size < 6 || value.size > 144) throw new Error('Font size must be between 6 and 144 points.');
  if (!/^#[0-9a-f]{6}$/i.test(value.color)) throw new Error('Choose a valid text color.');
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new Error('Choose a position on the page.');
  return value;
}

// All annotation changes are immutable so history retains editable metadata.
export function editPageAnnotation(pages, pageId, id, patch) {
  return pages.map(page => page.id !== pageId ? page : { ...page,
    annotations: (page.annotations ?? []).map(item => item.id !== id ? item : { ...item, ...patch }),
  });
}

export function deletePageAnnotation(pages, pageId, id) {
  return pages.map(page => page.id !== pageId ? page : { ...page,
    annotations: (page.annotations ?? []).filter(item => item.id !== id),
  });
}

export async function drawTextOverlays(document, page, annotations = []) {
  const fonts = new Map();
  for (const item of annotations.filter(item => item.type === 'text')) {
    validateTextOverlay(item);
    if (!fonts.has(item.font)) fonts.set(item.font, await document.embedFont(StandardFonts[item.font]));
    const font = fonts.get(item.font);
    // Validate every glyph before exporting; unsupported scripts are reported rather than silently lost.
    font.encodeText(item.text.replace(/\r?\n/g, ''));
    const components = item.color.slice(1).match(/../g).map(part => parseInt(part, 16) / 255);
    page.drawText(item.text, { x: item.x, y: item.y, size: item.size, font,
      color: rgb(...components), lineHeight: item.size * 1.2 });
  }
}
