import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/');
});

const apollo = '#apollo';

/** Rendered canvas width in px — the observable effect of a zoom change. */
async function canvasWidth(page: Page, host = apollo): Promise<number> {
  return (await page.locator(`${host} .canvas`).boundingBox())!.width;
}

test('zoom pill widens the plot, scrolls it, and resets to fit', async ({ page }) => {
  const level = page.locator(`${apollo} .zoom-level`);
  const viewport = page.locator(`${apollo} [part="viewport"]`);
  const overflow = (): Promise<number> =>
    viewport.evaluate((el) => el.scrollWidth - el.clientWidth);
  await expect(level).toHaveText('1.0×');

  const viewportWidth = (await viewport.boundingBox())!.width;
  const fitted = await canvasWidth(page);
  // At 1× the canvas tracks the viewport; it exceeds it only by however far the
  // last event's label overhangs, never by a screenful.
  expect(fitted).toBeLessThan(viewportWidth * 1.25);
  const fittedOverflow = await overflow();

  const fittedHeight = (await viewport.boundingBox())!.height;

  await page.locator(`${apollo} .zoom-btn`).last().click();
  await expect(level).toHaveText('1.5×');
  expect(await canvasWidth(page)).toBeGreaterThan(viewportWidth * 1.4);
  expect(await overflow()).toBeGreaterThan(fittedOverflow + viewportWidth * 0.3);
  // Re-packed lanes make the plot shorter, and the box follows it down instead
  // of leaving empty space between the events and the axis.
  expect((await viewport.boundingBox())!.height).toBeLessThanOrEqual(fittedHeight);

  await level.click();
  await expect(level).toHaveText('1.0×');
  expect(await canvasWidth(page)).toBeCloseTo(fitted, 0);
});

test('ctrl+wheel zooms and keeps the date under the cursor in place', async ({ page }) => {
  // The fixtures load over the network — reach into the shadow DOM only once
  // this one has actually drawn.
  await page.locator(`${apollo} .canvas`).waitFor();
  // Probe with the point marker nearest the middle of the view: far enough from
  // both ends that the anchored scrollLeft isn't clamped by the scroll range.
  const probe = await page.evaluate(() => {
    const root = document.querySelector('#apollo')!.shadowRoot!;
    const box = root.querySelector('[part="viewport"]')!.getBoundingClientRect();
    const centre = box.x + box.width / 2;
    let best: { id: string; x: number } | null = null;
    for (const event of root.querySelectorAll<HTMLElement>('[data-event-id]')) {
      const marker = event.querySelector<HTMLElement>('.marker--point');
      if (!marker) continue; // ranges are bars, not a single anchorable point
      const rect = marker.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      if (best === null || Math.abs(x - centre) < Math.abs(best.x - centre)) {
        best = { id: event.dataset['eventId']!, x };
      }
    }
    return { ...best!, y: box.y + box.height / 2 };
  });

  await page.mouse.move(probe.x, probe.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -240);
  await page.keyboard.up('Control');
  await expect(page.locator(`${apollo} .zoom-level`)).not.toHaveText('1.0×');
  // The readout updates per event but the redraw is coalesced onto the next
  // frame, so wait one out before measuring where the marker actually landed.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  const after = await page.evaluate((id) => {
    const marker = document
      .querySelector('#apollo')!
      .shadowRoot!.querySelector<HTMLElement>(`[data-event-id="${id}"] .marker`)!;
    const rect = marker.getBoundingClientRect();
    return rect.x + rect.width / 2;
  }, probe.id);

  // The event under the cursor barely moved, though the canvas grew ~2×.
  expect(Math.abs(after - probe.x)).toBeLessThan(12);
});

test('a plain wheel over the timeline still scrolls the host page', async ({ page }) => {
  await page.locator(apollo).scrollIntoViewIfNeeded();
  const box = (await page.locator(`${apollo} [part="viewport"]`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 300);
  await page.waitForFunction((y) => window.scrollY > y, before);
  await expect(page.locator(`${apollo} .zoom-level`)).toHaveText('1.0×');
});

test('the axis gains finer ticks as the plot is zoomed in', async ({ page }) => {
  const ticks = page.locator(`${apollo} [part="axis"] .tick--major`);
  const atFit = await ticks.count();
  const zoomIn = page.locator(`${apollo} .zoom-btn`).last();
  for (let i = 0; i < 5; i += 1) await zoomIn.click();
  await expect(page.locator(`${apollo} .zoom-level`)).toHaveText('7.6×');
  expect(await ticks.count()).toBeGreaterThan(atFit);
});

test('a dense timeline spreads itself so point events stay ≤ 5 deep', async ({ page }) => {
  const dense = '#dense';
  const lanes = (selector: string): Promise<number> =>
    page.$$eval(`${selector} .event--point`, (nodes) => {
      return new Set(nodes.map((node) => (node as HTMLElement).style.top)).size;
    });

  await expect(page.locator(`${dense} .event--point`)).toHaveCount(34);
  expect(await lanes(dense)).toBeLessThanOrEqual(5);

  // It paid for that with width: the canvas overflows its viewport at 1×…
  const viewport = page.locator(`${dense} [part="viewport"]`);
  expect(await viewport.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(200);
  // …so 1× is the readable default and the overview lives below it.
  await expect(page.locator(`${dense} .zoom-level`)).toHaveText('1.0×');
  await expect(page.locator(`${dense} .zoom-btn`).first()).toBeEnabled();

  // Ranges pack in their own region and are free to stack deeper than points.
  const rangeLanes = await page.$$eval(`${dense} .event--range`, (nodes) => {
    return new Set(nodes.map((node) => (node as HTMLElement).style.top)).size;
  });
  expect(rangeLanes).toBeGreaterThan(1);
});

test('zooming out from a spread layout reaches the whole-domain overview', async ({ page }) => {
  const dense = '#dense';
  const viewport = page.locator(`${dense} [part="viewport"]`);
  const zoomOut = page.locator(`${dense} .zoom-btn`).first();
  const spread = (await page.locator(`${dense} .canvas`).boundingBox())!.width;

  for (let i = 0; i < 14; i += 1) {
    if (await zoomOut.isDisabled()) break;
    await zoomOut.click();
  }
  await expect(zoomOut).toBeDisabled();
  // Floor = the whole domain on screen: no horizontal overflow left to scroll.
  expect(await viewport.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThan(200);
  expect((await page.locator(`${dense} .canvas`).boundingBox())!.width).toBeLessThan(spread);
});

test('zoom="off" renders no pill and ignores the gesture', async ({ page }) => {
  const fixed = '#apollo-fixed';
  await expect(page.locator(`${fixed} .zoom`)).toHaveCount(0);
  const before = await canvasWidth(page, fixed);
  const box = (await page.locator(`${fixed} [part="viewport"]`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -240);
  await page.keyboard.up('Control');
  expect(await canvasWidth(page, fixed)).toBeCloseTo(before, 0);
});
