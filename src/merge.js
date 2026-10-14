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
