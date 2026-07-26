import { expect, test } from '@playwright/test';

/**
 * M5 acceptance: the precision-showcase fixture renders four visually distinct
 * marker treatments + circa. Structural assertions (classes, geometry, computed
 * styles) instead of golden screenshots — pixel baselines don't transfer between
 * the local (darwin) and CI (linux) font stacks.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/');
  await expect(page.locator('#showcase [part="event"]')).toHaveCount(8);
});

test('marker shapes are distinct per precision', async ({ page }) => {
  const showcase = page.locator('#showcase');
  // day + datetime → plain solid dots (no shape modifier).
  await expect(
    showcase.locator('.marker--point:not(.marker--month):not(.marker--year)'),
  ).toHaveCount(2);
  await expect(showcase.locator('.marker--month')).toHaveCount(2); // month + circa month
  await expect(showcase.locator('.marker--year')).toHaveCount(2); // year + circa year
  await expect(showcase.locator('.marker--range')).toHaveCount(2);

  // Ring: opaque card-bg center (masks the axis), accent border. Diamond: rotated.
  const month = showcase.locator('.marker--month').first();
  await expect(month).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(month).toHaveCSS('border-top-width', '3px');
  const year = showcase.locator('.marker--year').first();
  const transform = await year.evaluate((el) => getComputedStyle(el).transform);
  expect(transform).not.toBe('none');
});

test('uncertainty bands span the fuzzy interval; circa gets dashed edges', async ({ page }) => {
  const showcase = page.locator('#showcase');
  await expect(showcase.locator('.band')).toHaveCount(4); // month, circa month, year, circa year
  await expect(showcase.locator('.band--circa')).toHaveCount(2);

  // A year band must be wider than a month band at the same scale (~12×).
  const yearBand = showcase.locator('[data-event-id="ev-year"] .band');
  const monthBand = showcase.locator('[data-event-id="ev-month"] .band');
  const yearWidth = (await yearBand.boundingBox())?.width ?? 0;
  const monthWidth = (await monthBand.boundingBox())?.width ?? 0;
  expect(yearWidth).toBeGreaterThan(monthWidth * 4);
  expect(monthWidth).toBeGreaterThan(0);
});

test('fuzzy range endpoints fade; exact ranges stay solid', async ({ page }) => {
  const showcase = page.locator('#showcase');
  const fuzzy = showcase.locator('[data-event-id="ev-range-fuzzy"] .marker');
  const exact = showcase.locator('[data-event-id="ev-range-exact"] .marker');
  await expect(fuzzy).toHaveAttribute('style', /linear-gradient/);
  const exactStyle = await exact.getAttribute('style');
  expect(exactStyle ?? '').not.toContain('linear-gradient');
});

test('legend shows the marker key and toggles via the legend attribute', async ({ page }) => {
  const legend = page.locator('#showcase [part="legend"]');
  await expect(legend).toBeVisible();
  await expect(legend).toContainText('Exact date');
  await expect(legend).toContainText('Approximate');

  await page.evaluate(() => document.querySelector('#showcase')?.setAttribute('legend', 'false'));
  await expect(page.locator('#showcase [part="legend"]')).toHaveCount(0);
});

test('circa events announce approximation and show the ~ label prefix', async ({ page }) => {
  const showcase = page.locator('#showcase');
  await expect(showcase.locator('.marker[aria-label*="approximate"]')).toHaveCount(2);
  await expect(showcase.locator('[data-event-id="ev-circa-year"] .label')).toContainText('~');
});

test('vertical layout keeps the precision shapes', async ({ page }) => {
  await page.evaluate(() =>
    document.querySelector('#showcase')?.setAttribute('orientation', 'vertical'),
  );
  const showcase = page.locator('#showcase');
  await expect(showcase.locator('.vlist')).toHaveCount(1);
  await expect(showcase.locator('.vlist .marker--month')).toHaveCount(2);
  await expect(showcase.locator('.vlist .marker--year')).toHaveCount(2);
});
