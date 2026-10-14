import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const { PDFDocument, StandardFonts } = createRequire(import.meta.url)('pdf-lib');

test('PDF text remains selectable at changed zoom and rotation; thumbnails have no text layer', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen', '0.8.0'));
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 500]).drawText('Selectable PDF text', { x: 30, y: 420, size: 18, font });
  await page.goto('/');
  await page.getByLabel('Open or merge PDFs').setInputFiles({ name: 'selection.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) });
  const layer = page.getByLabel('Selectable page text');
  await expect(layer).toBeVisible();
  await expect(layer).toContainText('Selectable PDF text');
  expect(await page.locator('.thumbnail .textLayer').count()).toBe(0);
  for (const zoom of ['100', '150']) {
    await page.getByLabel('Zoom level').selectOption(zoom);
    await expect(layer).toBeVisible();
    await expect(layer).toContainText('Selectable PDF text');
    const selected = await layer.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element.querySelector('span'));
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      return { text: selection.toString(), width: range.getBoundingClientRect().width };
    });
    expect(selected.text).toBe('Selectable PDF text');
    expect(selected.width).toBeGreaterThan(100);
  }
  await page.getByRole('button', { name: 'Rotate', exact: false }).click();
  await expect(page.locator('.app')).toHaveAttribute('aria-busy', 'false');
  await expect(layer).toBeVisible();
  await expect(layer).toContainText('Selectable PDF text');
});
