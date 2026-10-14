import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const { PDFDocument } = createRequire(import.meta.url)('pdf-lib');

async function fixture(name, width = 300) {
  const document = await PDFDocument.create();
  document.addPage([width, 500]);
  return { name: `${name}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(await document.save()) };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen', '0.6.0'));
  // Mock only the native save boundary; no real user file is written.
  await page.route('**/src/save.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function savePdf(bytes, name, currentPath = null) {
      window.saveCalls = [...(window.saveCalls || []), { name, currentPath }]; window.lastSavedBytes = Array.from(bytes);
      if (window.saveMode === 'cancel') return { kind: 'cancelled' };
      if (window.saveMode === 'error') throw new Error('Write failed');
      if (window.saveMode === 'download') return { kind: 'downloaded' };
      return { kind: 'saved', path: currentPath || 'C:/Tests/saved.pdf' };
    }
  ` }));
});

test('dirty state follows document history; save shortcuts reuse a chosen path', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Open or merge PDFs').setInputFiles(await fixture('Original'));
  await expect(page.locator('.page-count')).toHaveText('1 pages');
  await expect(page.locator('.document-status')).toHaveText('No unsaved changes');
  await page.getByRole('button', { name: '↻ Rotate', exact: true }).click();
  await expect(page.locator('.document-status')).toHaveText('Unsaved changes');
  await page.getByRole('button', { name: 'Undo Rotate page' }).click();
  await expect(page.locator('.document-status')).toHaveText('No unsaved changes');
  await page.getByRole('button', { name: 'Redo Rotate page' }).click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('.document-status')).toHaveText('No unsaved changes');
  await page.getByRole('button', { name: '↻ Rotate', exact: true }).click();
  await expect(page.locator('.document-status')).toHaveText('Unsaved changes');
  await page.keyboard.press('Control+s');
  await expect.poll(() => page.evaluate(() => window.saveCalls.at(-1).currentPath)).toBe('C:/Tests/saved.pdf');
  await page.keyboard.press('Control+Shift+s');
  await expect.poll(() => page.evaluate(() => window.saveCalls.at(-1).currentPath)).toBeNull();
});

test('new document prompts; cancelled/failed/browser saves preserve edits until discard', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Open new document', { exact: true }).setInputFiles(await fixture('Original'));
  await expect(page.locator('.page-count')).toHaveText('1 pages');
  await page.getByRole('button', { name: '↻ Rotate', exact: true }).click();
  await expect(page.locator('.document-status')).toHaveText('Unsaved changes');
  await page.getByLabel('Open new document', { exact: true }).setInputFiles(await fixture('Replacement', 600));
  const dialog = page.getByRole('dialog', { name: 'Unsaved changes' });
  await expect(dialog).toBeVisible();
  await page.evaluate(() => { window.saveMode = 'cancel'; });
  await dialog.getByRole('button', { name: 'Save and continue' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('Save cancelled');
  await page.evaluate(() => { window.saveMode = 'error'; });
  await dialog.getByRole('button', { name: 'Save and continue' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Write failed');
  await page.evaluate(() => { window.saveMode = 'download'; });
  await dialog.getByRole('button', { name: 'Save and continue' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('cannot be confirmed');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.document-status')).toHaveText('Unsaved changes');
  await page.getByLabel('Open new document', { exact: true }).setInputFiles(await fixture('Replacement', 600));
  await dialog.getByRole('button', { name: 'Discard changes' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.document-status')).toHaveText('No unsaved changes');
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  const saved = await PDFDocument.load(Uint8Array.from(await page.evaluate(() => window.lastSavedBytes)));
  expect(saved.getPage(0).getWidth()).toBe(600);
});

test('save-and-continue succeeds only after an acknowledged native write', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Open new document', { exact: true }).setInputFiles(await fixture('Original'));
  await expect(page.locator('.page-count')).toHaveText('1 pages');
  await page.getByRole('button', { name: '↻ Rotate', exact: true }).click();
  await expect(page.locator('.document-status')).toHaveText('Unsaved changes');
  await page.getByLabel('Open new document', { exact: true }).setInputFiles(await fixture('Replacement'));
  await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeHidden();
  await expect(page.locator('.document-status')).toHaveText('No unsaved changes');
  expect(await page.evaluate(() => window.saveCalls.length)).toBe(1);
});
