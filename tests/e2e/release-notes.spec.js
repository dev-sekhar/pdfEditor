import { test, expect } from '@playwright/test';

test('shows concise release notes once per version and can reopen them', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toHaveText('What’s new in PDF Studio 0.10.0');
  await expect(dialog.locator('li')).toHaveCount(4);
  await expect(dialog.getByRole('button', { name: 'Got it' })).toBeFocused();
  await page.screenshot({ path: 'test-results/release-notes.png' });
  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'What’s new', exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('shows feature notes again when upgrading from an older version', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-studio-release-seen', '0.2.0'));
  await page.goto('/');
  await expect(page.getByRole('dialog')).toBeVisible();
});
