import { isTauri } from '@tauri-apps/api/core';
import { download } from './pdf';

export async function savePdf(bytes, suggestedName = 'edited.pdf') {
  if (!isTauri()) {
    download(bytes, suggestedName);
    return { kind: 'downloaded' };
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({ title: 'Save PDF As', defaultPath: suggestedName,
    filters: [{ name: 'PDF documents', extensions: ['pdf'] }] });
  if (!path) return { kind: 'cancelled' };
  const { writeFile } = await import('@tauri-apps/plugin-fs');
  // The dialog grants access to exactly this selected path; do not rewrite it.
  await writeFile(path, bytes);
  return { kind: 'saved', path };
}
