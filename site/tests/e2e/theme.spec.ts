import { test, expect, type Page } from '@playwright/test';

async function expectTheme(page: Page, theme: 'light' | 'dark') {
  const dark = theme === 'dark';
  const label = `Switch to ${dark ? 'light' : 'dark'} mode`;
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
  expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe(theme);
  const toggle = page.getByRole('switch', { name: label });
  await expect(toggle).toHaveAttribute('aria-checked', String(dark));
  await expect(toggle).toHaveAttribute('title', label);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', dark ? '#091b18' : '#f1f8f6');
}

test('defaults to light regardless of the system theme and ignores invalid saved values', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  await expectTheme(page, 'light');
  expect(await page.evaluate(() => localStorage.getItem('list-formatting-theme'))).toBeNull();
  await page.evaluate(() => localStorage.setItem('list-formatting-theme', 'system'));
  await page.reload();
  await expectTheme(page, 'light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectTheme(page, 'light');
});

test('restores the saved dark theme in the head before page content appears', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('list-formatting-theme', 'dark');
    const observer = new MutationObserver(() => {
      const root = document.documentElement;
      root.dataset.initialTheme = root.dataset.theme;
      root.dataset.initialColorScheme = root.style.colorScheme;
      root.dataset.themeInitializedInHead = String(document.body === null);
      observer.disconnect();
    });
    observer.observe(document, { subtree: true, attributes: true, attributeFilter: ['data-theme'] });
  });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-initial-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-initial-color-scheme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme-initialized-in-head', 'true');
  await expectTheme(page, 'dark');
});

test('persists both themes across navigation and reloads with pointer and keyboard controls', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  await page.getByRole('switch', { name: 'Switch to dark mode' }).click();
  await expectTheme(page, 'dark');
  expect(await page.evaluate(() => localStorage.getItem('list-formatting-theme'))).toBe('dark');
  await page.goto('getting-started/');
  await expectTheme(page, 'dark');
  await page.reload();
  await expectTheme(page, 'dark');
  await page.getByRole('switch', { name: 'Switch to light mode' }).press('Space');
  await expectTheme(page, 'light');
  expect(await page.evaluate(() => localStorage.getItem('list-formatting-theme'))).toBe('light');
  await page.reload();
  await expectTheme(page, 'light');
  await page.getByRole('switch', { name: 'Switch to dark mode' }).press('Enter');
  await expectTheme(page, 'dark');
});

test('remains usable and reports when preference storage is blocked', async ({ page }) => {
  const errors: string[] = [];
  const messages: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => messages.push(message.text()));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('Storage is blocked', 'SecurityError'); },
    });
  });
  await page.goto('./');
  await expectTheme(page, 'light');
  expect(messages.some((message) => message.includes('Theme preference storage is unavailable'))).toBe(true);
  await page.getByRole('switch', { name: 'Switch to dark mode' }).click();
  await expectTheme(page, 'dark');
  expect(messages.some((message) => message.includes('Theme preference cannot be saved'))).toBe(true);
  await page.getByRole('switch', { name: 'Switch to light mode' }).click();
  await expectTheme(page, 'light');
  expect(errors).toEqual([]);
});

test('matches the two-icon sliding control and respects reduced motion on narrow screens', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('./');
  const toggle = page.getByRole('switch');
  await expect(toggle).toHaveCSS('width', '68px');
  await expect(toggle).toHaveCSS('height', '36px');
  await expect(toggle.locator('.theme-toggle__sun')).toBeVisible();
  await expect(toggle.locator('.theme-toggle__moon')).toBeVisible();
  const thumb = () => toggle.evaluate((element) => {
    const style = getComputedStyle(element, '::before');
    return { width: style.width, height: style.height, transform: style.transform, duration: style.transitionDuration };
  });
  expect(await thumb()).toEqual({ width: '28px', height: '28px', transform: 'none', duration: '0s' });
  await toggle.click();
  await expectTheme(page, 'dark');
  expect(await thumb()).toEqual({ width: '28px', height: '28px', transform: 'matrix(1, 0, 0, 1, 32, 0)', duration: '0s' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
