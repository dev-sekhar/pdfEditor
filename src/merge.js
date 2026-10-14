export function mergeOffset(mode, count, selectedIndex, pageNumber) {
  switch (mode) {
    case 'beginning': return 0;
    case 'end': return count;
    case 'before': return selectedIndex;
    case 'after': return selectedIndex + 1;
    case 'number': {
      const number = Number(pageNumber);
      if (!Number.isInteger(number) || number < 1 || number > count + 1) throw new Error(`Choose a whole page number from 1 to ${count + 1}.`);
      return number - 1;
    }
    default: throw new Error('Choose an insertion position.');
  }
}
export function insertPages(existing, incoming, offset) {
  if (!Number.isInteger(offset) || offset < 0 || offset > existing.length) throw new Error('Invalid insertion position.');
  return [...existing.slice(0, offset), ...incoming, ...existing.slice(offset)];
}

export function parsePageSelection(value, count) {
  if (!Number.isInteger(count) || count < 1) throw new Error('This PDF has no pages.');
  const text = value.trim();
  if (!text || text.toLowerCase() === 'all') return Array.from({ length: count }, (_, index) => index);
  const selected = new Set();
  for (const part of text.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('Use page numbers or ranges, for example 1, 3-5, 8.');
    const first = Number(match[1]);
    const last = Number(match[2] || match[1]);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last > count || first > last) {
      throw new Error(`Choose pages from 1 to ${count}, with ranges in ascending order.`);
    }
    for (let page = first; page <= last; page++) selected.add(page - 1);
  }
  return [...selected];
}
