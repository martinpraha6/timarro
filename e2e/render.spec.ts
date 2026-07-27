import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('renders the Apollo fixture: header, 7 ordered events, axis, brand', async ({ page }) => {
  const apollo = page.locator('#apollo');
  await expect(apollo.locator('[part="header"]')).toHaveText('Apollo program');
  await expect(apollo.locator('[part="event"]')).toHaveCount(7);
  await expect(apollo.locator('[part="event"]').first()).toContainText("Kennedy's Moon speech");
  await expect(apollo.locator('[part="event"]').last()).toContainText('Apollo 17');
  await expect(apollo.locator('[part="axis"] .tick-label').first()).toBeVisible();
  await expect(apollo.locator('[part="brand"]')).toHaveText('Powered by Timarro');
});

test('renders the Charles IV fixture with 9 events', async ({ page }) => {
  await expect(page.locator('#charles [part="event"]')).toHaveCount(9);
});

test('marker click opens a popover, dispatches timarro:select; Escape closes', async ({ page }) => {
  const apollo = page.locator('#apollo');
  const selected = page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        document.querySelector('#apollo')?.addEventListener(
          'timarro:select',
          (event) => {
            resolve((event as CustomEvent<{ event: { id: string } }>).detail.event.id);
          },
          { once: true },
        );
      }),
  );
  await apollo.locator('.marker').first().click();
  await expect(apollo.locator('[part="card"]')).toBeVisible();
  await expect(apollo.locator('[part="card"]')).toContainText('May 25, 1961');
  expect(await selected).toBe('ev-kennedy-speech');

  await page.keyboard.press('Escape');
  await expect(apollo.locator('[part="card"]')).toHaveCount(0);
});

test('invalid data renders the validator output', async ({ page }) => {
  const broken = page.locator('#broken');
  await expect(broken).toContainText('invalid data');
  await expect(broken).toContainText('events[0].date.precision');
});

test('a failing src fetch renders an error and dispatches timarro:error', async ({ page }) => {
  const errorMessage = page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const el = document.createElement('timarro-timeline');
        el.id = 'missing';
        el.addEventListener(
          'timarro:error',
          (event) => {
            resolve((event as CustomEvent<{ message: string }>).detail.message);
          },
          { once: true },
        );
        el.setAttribute('src', '/does-not-exist.json');
        document.body.append(el);
      }),
  );
  // Depending on the server, a bad src fails as HTTP 404 or as a JSON parse error —
  // the contract is: timarro:error fires and the element renders the failure inline.
  expect((await errorMessage).length).toBeGreaterThan(0);
  await expect(page.locator('#missing')).toContainText('failed to load data');
});

test('hostile titles render as inert text', async ({ page }) => {
  await page.evaluate(() => {
    const el = document.createElement('timarro-timeline') as HTMLElement & { data: unknown };
    el.id = 'hostile';
    document.body.append(el);
    el.data = {
      timeline: { id: 't', title: 'Injection' },
      events: [
        {
          id: 'e',
          title: '<img src=x onerror=alert(1)>',
          date: { start: '1969', precision: 'year' },
        },
      ],
    };
  });
  const hostile = page.locator('#hostile');
  await expect(hostile.locator('[part="event"]')).toHaveCount(1);
  await expect(hostile.locator('img')).toHaveCount(0);
  await expect(hostile).toContainText('<img src=x onerror=alert(1)>');
});
