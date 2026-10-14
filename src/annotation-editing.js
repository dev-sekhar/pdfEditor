import { validateTextOverlay } from './text-overlays';

export function editableAnnotationPatch(annotation, draft) {
  if (!annotation) throw new Error('Select an annotation to edit.');
  if (annotation.type === 'text' || annotation.type === 'comment') {
    const text = draft.text;
    if (!text?.trim()) throw new Error('Annotation text cannot be empty.');
    if (annotation.type === 'text') validateTextOverlay({ ...annotation, text });
    return { text };
  }
  if (annotation.type === 'highlight' || annotation.type === 'underline') {
    if (!/^#[0-9a-f]{6}$/i.test(draft.color)) throw new Error('Choose a valid markup color.');
    return { color: draft.color };
  }
  throw new Error('This annotation type cannot be edited.');
}

export function updateAnnotation(pages, pageId, id, draft) {
  const page = pages.find(item => item.id === pageId);
  const annotation = page?.annotations?.find(item => item.id === id);
  const patch = editableAnnotationPatch(annotation, draft);
  if (Object.entries(patch).every(([key, value]) => annotation[key] === value)) return pages;
  return pages.map(item => item.id === pageId ? { ...item,
    annotations: item.annotations.map(value => value.id === id ? { ...value, ...patch } : value),
  } : item);
}

export function removeAnnotation(pages, pageId, id) {
  const page = pages.find(item => item.id === pageId);
  if (!page?.annotations?.some(item => item.id === id)) return pages;
  return pages.map(item => item.id === pageId ? { ...item,
    annotations: item.annotations.filter(value => value.id !== id),
  } : item);
}
