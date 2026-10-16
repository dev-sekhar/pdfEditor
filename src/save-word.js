import { isTauri } from '@tauri-apps/api/core';

export const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function saveWord(bytes, suggestedName = 'document.docx') {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength) throw new Error('The Word document is empty or invalid.');
  if (!isTauri()) {
    const url = URL.createObjectURL(new Blob([bytes], { type: WORD_MIME }));
    let anchor;
    try {
      anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = suggestedName;
      document.body.append(anchor);
      anchor.click();
    } finally {
      anchor?.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return { kind: 'downloaded' };
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({ title: 'Export Word document', defaultPath: suggestedName,
    filters: [{ name: 'Word documents', extensions: ['docx'] }] });
  if (!path) return { kind: 'cancelled' };
  if (typeof path !== 'string' || !/\.docx$/i.test(path)) throw new Error('Choose a filename ending in .docx for the Word document.');
  const { writeFile } = await import('@tauri-apps/plugin-fs');
  // Always use a fresh dialog grant, never the PDF's remembered save path.
  await writeFile(path, bytes);
  return { kind: 'saved', path };
}
