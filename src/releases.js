import packageInfo from '../package.json';

export const APP_VERSION = packageInfo.version;
export const RELEASE_STORAGE_KEY = 'pdf-studio-release-seen';
export const RELEASES = {
  '0.10.0': [
    'Export your current PDF as a Word document (.docx).',
    'Choose editable text or page images that preserve appearance.',
    'Keep scanned and redacted pages as images when OCR is unavailable.',
    'Convert locally while keeping your PDF and its edit history unchanged.',
  ],
  '0.9.0': [
    'Mark page areas, review them, then apply secure redaction.',
    'Create a fresh image-only PDF with marked pixels removed.',
    'Remove hidden PDF objects, attachments, and original metadata.',
    'Clear undo history and save a separate redacted copy.',
  ],
  '0.8.0': [
    'Place text anywhere on a page and drag its handle to move it.',
    'Choose text fonts, sizes, and colors with a live preview.',
    'Edit text overlays and comments, or change markup colors.',
    'Delete annotations and undo or redo each change.',
  ],
  '0.7.0': [
    'Select and copy existing PDF text.',
    'Highlight or underline selected text in your chosen color.',
    'Add page comments with visible note markers.',
    'Reopen Studio comments and markup, or read them in other PDF readers.',
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
