import packageInfo from '../package.json';

export const APP_VERSION = packageInfo.version;
export const RELEASE_STORAGE_KEY = 'pdf-studio-release-seen';
export const RELEASES = {
  '0.7.0': [
    'Select and copy existing PDF text.',
    'Highlight or underline selected text in your chosen color.',
    'Add page comments with visible note markers.',
    'Keep highlights and comments usable in standard PDF readers when saving.',
  ],
  '0.6.0': [
    'Select incoming PDF pages visually, with synchronized checkboxes and ranges.',
    'Save with Ctrl+S or choose a new file with Ctrl+Shift+S.',
    'Open a new document with Save, Discard, or Cancel safeguards.',
    'See unsaved changes and protect them when closing the app.',
  ],
  '0.5.0': [
    'Choose individual pages or page ranges from each incoming PDF.',
    'Preview selected pages and inspect them before merging.',
    'Keep your insertion position and undo or redo the entire merge.',
  ],
  '0.4.0': [
    'Choose where merged PDFs are inserted in your document.',
    'Insert before or after the selected page, at either end, or before a page number.',
    'Undo or redo the complete merge as one change.',
  ],
  '0.3.0': [
    'Zoom in or out, or fit a page to your window.',
    'Drag page thumbnails to reorder your PDF.',
    'Choose a filename and folder with Save As.',
    'See a quick summary of new features after each update.',
  ],
};
export function shouldShowRelease(storage) {
  try { return storage.getItem(RELEASE_STORAGE_KEY) !== APP_VERSION; }
  catch { return true; }
}
export function markReleaseSeen(storage) {
  try { storage.setItem(RELEASE_STORAGE_KEY, APP_VERSION); }
  catch { /* The pop-up still closes this session if storage is unavailable. */ }
}
