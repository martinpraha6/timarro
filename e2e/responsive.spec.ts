import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('auto orientation switches with container width — both directions', async ({ page }) => {
  // Demo body is max-width 56rem: at 1200px viewport the container is ~864px → horizontal.
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.locator('#apollo .canvas')).toHaveCount(1);
  await expect(page.locator('#apollo .vlist')).toHaveCount(0);

  // 320px viewport → container well under the 640px breakpoint → vertical rail.
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(page.locator('#apollo .vlist')).toHaveCount(1);
  await expect(page.locator('#apollo .canvas')).toHaveCount(0);
  await expect(page.locator('#apollo [part="event"]')).toHaveCount(7);

  // And back.
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.locator('#apollo .canvas')).toHaveCount(1);
  await expect(page.locator('#apollo .vlist')).toHaveCount(0);
});

test('narrow embed container renders vertically even in a wide viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.locator('#apollo-narrow .vlist')).toHaveCount(1);
  await expect(page.locator('#charles-vertical .vlist')).toHaveCount(1);
});

test('keyboard walk: arrows traverse chronologically, Enter opens, Escape closes and refocuses', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  const activeLabel = (): Promise<string | null | undefined> =>
    page.evaluate(() =>
      document.querySelector('#apollo')?.shadowRoot?.activeElement?.getAttribute('aria-label'),
    );

  await page.locator('#apollo .marker').first().focus();
  expect(await activeLabel()).toContain("Kennedy's Moon speech");

  await page.keyboard.press('ArrowRight');
  expect(await activeLabel()).toContain('Apollo 1 cabin fire');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  expect(await activeLabel()).toContain('Apollo 1 cabin fire');

  await page.keyboard.press('End');
  expect(await activeLabel()).toContain('Apollo 17');
  await page.keyboard.press('Home');
  expect(await activeLabel()).toContain("Kennedy's Moon speech");

  await page.keyboard.press('Enter');
  await expect(page.locator('#apollo [part="card"]')).toBeVisible();
  await expect(page.locator('#apollo .marker[aria-expanded="true"]')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(page.locator('#apollo [part="card"]')).toHaveCount(0);
  // Focus returns to the anchor marker.
  expect(await activeLabel()).toContain("Kennedy's Moon speech");
});

test('vertical layout is keyboard-traversable with up/down', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  const activeLabel = (): Promise<string | null | undefined> =>
    page.evaluate(() =>
      document
        .querySelector('#charles-vertical')
        ?.shadowRoot?.activeElement?.getAttribute('aria-label'),
    );

  await page.locator('#charles-vertical .marker').first().focus();
  const first = await activeLabel();
  await page.keyboard.press('ArrowDown');
  const second = await activeLabel();
  expect(second).not.toBe(first);
  await page.keyboard.press('ArrowUp');
  expect(await activeLabel()).toBe(first);
});

test('axe: no critical accessibility violations in either layout', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.locator('#apollo .canvas')).toHaveCount(1);
  const wide = await new AxeBuilder({ page }).analyze();
  expect(wide.violations.filter((v) => v.impact === 'critical')).toEqual([]);

  await page.setViewportSize({ width: 320, height: 900 });
  await expect(page.locator('#apollo .vlist')).toHaveCount(1);
  const narrow = await new AxeBuilder({ page }).analyze();
  expect(narrow.violations.filter((v) => v.impact === 'critical')).toEqual([]);
});
