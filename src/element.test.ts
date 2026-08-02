import { describe, expect, it, vi } from 'vitest';
import apollo from '../demo/data/apollo.json';
import { TimarroTimeline, define } from './index';
import type { TimarroTimelineData } from './schema/types';

function mount(): TimarroTimeline {
  define();
  const el = document.createElement('timarro-timeline') as TimarroTimeline;
  document.body.append(el);
  return el;
}

describe('define()', () => {
  it('registers the custom element and is idempotent', () => {
    define();
    expect(customElements.get('timarro-timeline')).toBe(TimarroTimeline);
    expect(() => {
      define();
    }).not.toThrow();
  });
});

describe('<timarro-timeline>', () => {
  it('renders a no-data message into its shadow root', () => {
    const el = mount();
    expect(el.shadowRoot?.textContent).toContain('timarro: no data');
    el.remove();
  });

  it('renders header, markers, axis, and brand for valid data', () => {
    const el = mount();
    el.data = apollo as TimarroTimelineData;
    const root = el.shadowRoot!;
    expect(root.querySelector('.header')?.textContent).toBe('Apollo program');
    expect(root.querySelectorAll('[part="event"]')).toHaveLength(7);
    expect(root.querySelector('[part="axis"]')).not.toBeNull();
    expect(root.querySelector('[part="brand"]')?.textContent).toBe('Powered by Timarro');
    el.remove();
  });

  it('orders events chronologically in the DOM', () => {
    const el = mount();
    el.data = apollo as TimarroTimelineData;
    const labels = [...el.shadowRoot!.querySelectorAll<HTMLElement>('[part="event"] .label')];
    // Point labels are shortened on-canvas; full title expands on label click.
    expect(labels[0]?.textContent).toBe("Kennedy's M…");
    expect(labels[0]?.title).toBe("Kennedy's Moon speech to Congress");
    expect(labels[0]?.tagName).toBe('BUTTON');
    // Apollo 17 is a range — full title stays on the bar label.
    expect(labels.at(-1)?.textContent).toBe('Apollo 17 — last Moon landing');
    el.remove();
  });

  it('dispatches timarro:load with the timeline meta', () => {
    const el = mount();
    let loaded: unknown;
    el.addEventListener('timarro:load', (event) => {
      loaded = (event as CustomEvent).detail;
    });
    el.data = apollo as TimarroTimelineData;
    expect(loaded).toMatchObject({ timeline: { id: 'tl-apollo' } });
    el.remove();
  });

  it('opens a popover and dispatches timarro:select on marker click', () => {
    const el = mount();
    el.data = apollo as TimarroTimelineData;
    let selectedId: string | undefined;
    el.addEventListener('timarro:select', (event) => {
      selectedId = ((event as CustomEvent).detail as { event: { id: string } }).event.id;
    });
    const marker = el.shadowRoot!.querySelector<HTMLButtonElement>('.marker');
    marker?.click();
    expect(selectedId).toBe('ev-kennedy-speech');
    expect(el.shadowRoot!.querySelector('[part="card"]')?.textContent).toContain(
      "Kennedy's Moon speech to Congress",
    );
    el.remove();
  });

  it('renders data strings as inert text (injection safety)', () => {
    const el = mount();
    const hostile = '<img src=x onerror=boom()>';
    el.data = {
      timeline: { id: 't', title: 'Injection' },
      events: [{ id: 'e', title: hostile, date: { start: '1969-07-21', precision: 'day' } }],
    };
    expect(el.shadowRoot!.querySelector('img')).toBeNull();
    // On-canvas label is shortened; full hostile string must still appear as text (tooltip / aria).
    const label = el.shadowRoot!.querySelector<HTMLElement>('.label');
    expect(label?.textContent).toContain('<img src=x');
    expect(label?.title).toBe(hostile);
    expect(el.shadowRoot!.querySelector('.marker')?.getAttribute('aria-label')).toContain(hostile);
    el.remove();
  });

  it('drops non-http(s) media urls in the popover', () => {
    const el = mount();
    el.data = {
      timeline: { id: 't', title: 'Media' },
      events: [
        {
          id: 'e',
          title: 'Event',
          date: { start: '1969-07-21', precision: 'day' },
          mediaUrls: ['javascript:alert(1)', 'https://example.com/x.png'],
        },
      ],
    };
    el.shadowRoot!.querySelector<HTMLButtonElement>('.marker')?.click();
    const images = [...el.shadowRoot!.querySelectorAll('img')];
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute('src')).toBe('https://example.com/x.png');
    el.remove();
  });

  it('renders validation issues for invalid data and keeps data null', () => {
    const el = mount();
    el.data = {
      timeline: { id: 't', title: 'Broken' },
      events: [{ id: 'e', title: 'E', date: { start: '1943', precision: 'day' } }],
    };
    const text = el.shadowRoot?.textContent ?? '';
    expect(text).toContain('invalid data');
    expect(text).toContain('events[0].date.precision');
    expect(el.data).toBeNull();
    el.remove();
  });

  it('clears back to the no-data state', () => {
    const el = mount();
    el.data = apollo as TimarroTimelineData;
    el.data = null;
    expect(el.shadowRoot?.textContent).toContain('timarro: no data');
    el.remove();
  });
});

describe('orientation', () => {
  it('renders the vertical rail layout when orientation="vertical"', () => {
    const el = mount();
    el.setAttribute('orientation', 'vertical');
    el.data = apollo as TimarroTimelineData;
    const root = el.shadowRoot!;
    expect(root.querySelector('.vlist')).not.toBeNull();
    expect(root.querySelector('.canvas')).toBeNull();
    expect(root.querySelectorAll('[part="event"]')).toHaveLength(7);
    // Chronological top → bottom, with a visible date per event.
    const dates = [...root.querySelectorAll('.vdate')];
    expect(dates).toHaveLength(7);
    expect(root.querySelector('.vbody .label')?.textContent).toBe(
      "Kennedy's Moon speech to Congress",
    );
    el.remove();
  });

  it('switches back to horizontal when the attribute changes', () => {
    const el = mount();
    el.setAttribute('orientation', 'vertical');
    el.data = apollo as TimarroTimelineData;
    el.setAttribute('orientation', 'horizontal');
    const root = el.shadowRoot!;
    expect(root.querySelector('.canvas')).not.toBeNull();
    expect(root.querySelector('.vlist')).toBeNull();
    el.remove();
  });
});

describe('keyboard navigation', () => {
  function markers(el: TimarroTimeline): HTMLButtonElement[] {
    return [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.marker')];
  }

  function press(target: HTMLElement, key: string): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
  }

  it('sets a roving tabindex: first marker 0, rest -1', () => {
    const el = mount();
    el.data = apollo as TimarroTimelineData;
    const all = markers(el);
    expect(all[0]?.tabIndex).toBe(0);
    expect(all.slice(1).every((m) => m.tabIndex === -1)).toBe(true);
    el.remove();
  });

  it('moves focus chronologically with arrow keys and jumps with Home/End', () => {
    const el = mount();
    el.data = apollo as TimarroTimelineData;
    const all = markers(el);
    all[0]!.focus();
    press(all[0]!, 'ArrowRight');
    expect(el.shadowRoot!.activeElement).toBe(all[1]);
    expect(all[1]?.tabIndex).toBe(0);
    expect(all[0]?.tabIndex).toBe(-1);

    press(all[1]!, 'ArrowLeft');
    expect(el.shadowRoot!.activeElement).toBe(all[0]);

    press(all[0]!, 'End');
    expect(el.shadowRoot!.activeElement).toBe(all.at(-1));
    press(all.at(-1)!, 'Home');
    expect(el.shadowRoot!.activeElement).toBe(all[0]);
    el.remove();
  });

  it('arrow keys also work in the vertical layout', () => {
    const el = mount();
    el.setAttribute('orientation', 'vertical');
    el.data = apollo as TimarroTimelineData;
    const all = markers(el);
    all[0]!.focus();
    press(all[0]!, 'ArrowDown');
    expect(el.shadowRoot!.activeElement).toBe(all[1]);
    press(all[1]!, 'ArrowUp');
    expect(el.shadowRoot!.activeElement).toBe(all[0]);
    el.remove();
  });
});

describe('fuzzy-date visual treatment (M5)', () => {
  const showcase: TimarroTimelineData = {
    timeline: { id: 't-precision', title: 'Precision' },
    events: [
      { id: 'e-day', title: 'Day', date: { start: '1912-04-15', precision: 'day' } },
      { id: 'e-month', title: 'Month', date: { start: '1921-07', precision: 'month' } },
      { id: 'e-year', title: 'Year', date: { start: '1905', precision: 'year' } },
      {
        id: 'e-circa',
        title: 'Circa',
        date: { start: '1938', precision: 'year', circa: true },
      },
      {
        id: 'e-range-fuzzy',
        title: 'Fuzzy range',
        date: { start: '1929', end: '1934-06', precision: 'year' },
      },
    ],
  };

  it('renders precision-distinct marker shapes', () => {
    const el = mount();
    el.data = showcase;
    const root = el.shadowRoot!;
    expect(root.querySelectorAll('.marker--month')).toHaveLength(1);
    expect(root.querySelectorAll('.marker--year')).toHaveLength(2); // year + circa year
    expect(root.querySelectorAll('.marker--range')).toHaveLength(1);
    el.remove();
  });

  it('draws uncertainty bands behind fuzzy markers, dashed for circa', () => {
    const el = mount();
    el.data = showcase;
    const root = el.shadowRoot!;
    const bands = [...root.querySelectorAll<HTMLElement>('.band')];
    expect(bands).toHaveLength(3); // month, year, circa year
    expect(bands.every((b) => parseFloat(b.style.width) >= 2)).toBe(true);
    expect(root.querySelectorAll('.band--circa')).toHaveLength(1);
    el.remove();
  });

  it('fades fuzzy range endpoints with a gradient', () => {
    const el = mount();
    el.data = showcase;
    const bar = el.shadowRoot!.querySelector<HTMLElement>('.marker--range')!;
    expect(bar.style.background).toContain('linear-gradient');
    el.remove();
  });

  it('keeps exact ranges solid (no gradient)', () => {
    const el = mount();
    el.data = {
      timeline: { id: 't', title: 'Exact range' },
      events: [
        {
          id: 'e',
          title: 'Exact',
          date: { start: '1910-05-01', end: '1913-09-30', precision: 'day' },
        },
      ],
    };
    const bar = el.shadowRoot!.querySelector<HTMLElement>('.marker--range')!;
    expect(bar.style.background).toBe('');
    el.remove();
  });

  it('applies shape markers in the vertical layout too', () => {
    const el = mount();
    el.setAttribute('orientation', 'vertical');
    el.data = showcase;
    const root = el.shadowRoot!;
    expect(root.querySelectorAll('.vlist .marker--month')).toHaveLength(1);
    expect(root.querySelectorAll('.vlist .marker--year')).toHaveLength(2);
    el.remove();
  });

  it('announces approximation in the aria-label for circa events', () => {
    const el = mount();
    el.data = showcase;
    const circa = el.shadowRoot!.querySelector('[data-event-id="e-circa"] .marker');
    expect(circa?.getAttribute('aria-label')).toContain('approximate');
    el.remove();
  });

  it('shows the legend by default and hides it with legend="false"', () => {
    const el = mount();
    el.data = showcase;
    const root = el.shadowRoot!;
    expect(root.querySelector('[part="legend"]')?.textContent).toContain('Approximate');
    el.setAttribute('legend', 'false');
    expect(root.querySelector('[part="legend"]')).toBeNull();
    el.setAttribute('legend', '');
    expect(root.querySelector('[part="legend"]')).not.toBeNull();
    el.remove();
  });
});

describe('range bands (full-height overlap layer)', () => {
  const overlapping: TimarroTimelineData = {
    timeline: { id: 't', title: 'Ranges' },
    events: [
      { id: 'a', title: 'A wide', date: { start: '1900', end: '1950', precision: 'year' } },
      { id: 'b', title: 'B inside', date: { start: '1910', end: '1920', precision: 'year' } },
      { id: 'c', title: 'C later', date: { start: '1970', end: '1980', precision: 'year' } },
    ],
  };

  it('draws each range as an .rband in a background layer below the events', () => {
    const el = mount();
    el.data = overlapping;
    const root = el.shadowRoot!;
    const canvas = root.querySelector('.canvas')!;
    // The ranges layer paints first, so bands sit behind the event markers.
    expect(canvas.firstElementChild?.classList.contains('ranges')).toBe(true);
    expect(root.querySelectorAll('.ranges .rband')).toHaveLength(3);
    // Each range keeps one interactive bar and one [part=event] wrapper.
    expect(root.querySelectorAll('.event--range')).toHaveLength(3);
    expect(root.querySelectorAll('.marker--range')).toHaveLength(3);
    el.remove();
  });

  it('gives overlapping ranges different band heights; reuses a lane otherwise', () => {
    const el = mount();
    el.data = overlapping;
    // Bands are appended in chronological range order: [a, b, c].
    const [a, b, c] = [...el.shadowRoot!.querySelectorAll<HTMLElement>('.rband')].map((band) =>
      parseFloat(band.style.height),
    );
    // b nests inside a → deeper lane → taller band; c clears a → same lane, same height.
    expect(b!).toBeGreaterThan(a!);
    expect(c!).toBeCloseTo(a!, 5);
    el.remove();
  });
});

describe('per-event color', () => {
  it('applies a valid color as --ev-color on the event and its band', () => {
    const el = mount();
    el.data = {
      timeline: { id: 't', title: 'Colored' },
      events: [
        { id: 'p', title: 'Point', date: { start: '1900', precision: 'year' }, color: '#0d9488' },
        {
          id: 'r',
          title: 'Range',
          date: { start: '1905', end: '1915', precision: 'year' },
          color: '#2563eb',
        },
      ],
    };
    const root = el.shadowRoot!;
    const point = root.querySelector<HTMLElement>('[data-event-id="p"]')!;
    expect(point.style.getPropertyValue('--ev-color')).toBe('#0d9488');
    const band = root.querySelector<HTMLElement>('.rband')!;
    expect(band.style.getPropertyValue('--ev-color')).toBe('#2563eb');
    el.remove();
  });

  it('ignores a color that could smuggle extra declarations', () => {
    const el = mount();
    el.data = {
      timeline: { id: 't', title: 'Hostile color' },
      events: [
        {
          id: 'p',
          title: 'Point',
          date: { start: '1900', precision: 'year' },
          color: 'red; url(evil)',
        },
      ],
    };
    const point = el.shadowRoot!.querySelector<HTMLElement>('[data-event-id="p"]')!;
    expect(point.style.getPropertyValue('--ev-color')).toBe('');
    el.remove();
  });
});

describe('popover a11y state', () => {
  it('toggles aria-expanded on the anchor marker', () => {
    const el = mount();
    el.data = apollo as TimarroTimelineData;
    const marker = el.shadowRoot!.querySelector<HTMLButtonElement>('.marker')!;
    expect(marker.getAttribute('aria-expanded')).toBe('false');
    marker.click();
    expect(marker.getAttribute('aria-expanded')).toBe('true');
    expect(el.shadowRoot!.querySelector('[role="dialog"]')).not.toBeNull();
    marker.click();
    expect(marker.getAttribute('aria-expanded')).toBe('false');
    expect(el.shadowRoot!.querySelector('[role="dialog"]')).toBeNull();
    el.remove();
  });

  it('closes on Escape and on an outside document click', () => {
    const el = mount();
    el.data = apollo as TimarroTimelineData;
    const marker = el.shadowRoot!.querySelector<HTMLButtonElement>('.marker')!;
    marker.focus();
    marker.click();
    expect(el.shadowRoot!.querySelector('[role="dialog"]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(el.shadowRoot!.querySelector('[role="dialog"]')).toBeNull();
    expect(el.shadowRoot!.activeElement).toBe(marker);

    marker.click();
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(el.shadowRoot!.querySelector('[role="dialog"]')).toBeNull();
    el.remove();
  });

  it('summarizes overflow issues when more than three validation errors exist', () => {
    const el = mount();
    el.data = {
      timeline: { id: '', title: '' },
      events: [
        { id: '', title: '', date: { start: 'x', precision: 'day' } },
        { id: '', title: '', date: { start: 'y', precision: 'day' } },
      ],
    } as unknown as TimarroTimelineData;
    const text = el.shadowRoot?.textContent ?? '';
    expect(text).toContain('invalid data');
    expect(text).toMatch(/and \d+ more/);
    el.remove();
  });
});

describe('src attribute loading', () => {
  it('loads JSON from src and surfaces fetch failures', async () => {
    const ok = mount();
    const payload = {
      timeline: { id: 'tl-src', title: 'From src' },
      events: [{ id: 'e', title: 'E', date: { start: '1969', precision: 'year' } }],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(payload),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      });
    vi.stubGlobal('fetch', fetchMock);

    ok.setAttribute('src', '/data/ok.json');
    await vi.waitFor(() => {
      expect(ok.shadowRoot?.querySelector('.header')?.textContent).toBe('From src');
    });

    const failing = mount();
    let errorMessage: string | undefined;
    failing.addEventListener('timarro:error', (event) => {
      errorMessage = (event as CustomEvent<{ message: string }>).detail.message;
    });
    failing.setAttribute('src', '/data/missing.json');
    await vi.waitFor(() => {
      expect(failing.shadowRoot?.textContent).toContain('failed to load data');
    });
    expect(errorMessage).toContain('HTTP 503');

    ok.remove();
    failing.remove();
    vi.unstubAllGlobals();
  });
});

describe('empty timeline and rich popover content', () => {
  it('renders a no-events status when the timeline has zero events', () => {
    const el = mount();
    el.data = { timeline: { id: 't', title: 'Empty', description: 'None yet' }, events: [] };
    expect(el.shadowRoot?.querySelector('.description')?.textContent).toBe('None yet');
    expect(el.shadowRoot?.textContent).toContain('timeline has no events');
    el.remove();
  });

  it('renders entities, extra media links, and sourceRef in the popover', () => {
    const el = mount();
    el.data = {
      timeline: { id: 't', title: 'Rich' },
      events: [
        {
          id: 'e',
          title: 'Rich event',
          description: 'Details',
          date: { start: '1969-07-21', precision: 'day' },
          entities: ['Neil Armstrong'],
          mediaUrls: ['https://example.com/a.png', 'https://example.com/b.png'],
          sourceRef: 'NASA archive',
        },
      ],
    };
    el.shadowRoot!.querySelector<HTMLButtonElement>('.marker')!.click();
    const popover = el.shadowRoot!.querySelector('[part="card"]');
    expect(popover?.textContent).toContain('Neil Armstrong');
    expect(popover?.textContent).toContain('Media: https://example.com/b.png');
    expect(popover?.textContent).toContain('Source: NASA archive');
    expect(popover?.querySelectorAll('img')).toHaveLength(1);
    el.remove();
  });

  it('applies per-event color in vertical layout and opens on marker click', () => {
    const el = mount();
    el.setAttribute('orientation', 'vertical');
    el.data = {
      timeline: { id: 't', title: 'Vertical color' },
      events: [
        {
          id: 'e',
          title: 'Colored',
          date: { start: '1969', precision: 'year' },
          color: '#0d9488',
        },
      ],
    };
    const event = el.shadowRoot!.querySelector<HTMLElement>('[data-event-id="e"]')!;
    expect(event.style.getPropertyValue('--ev-color')).toBe('#0d9488');
    event.querySelector<HTMLButtonElement>('.marker')!.click();
    expect(el.shadowRoot!.querySelector('[role="dialog"]')).not.toBeNull();
    el.remove();
  });
});
