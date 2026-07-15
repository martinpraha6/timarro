import { describe, expect, it } from 'vitest';
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
    expect(() => define()).not.toThrow();
  });
});

describe('<timarro-timeline>', () => {
  it('renders a no-data message into its shadow root', () => {
    const el = mount();
    expect(el.shadowRoot?.textContent).toContain('timarro: no data');
    el.remove();
  });

  it('validates and renders valid data', () => {
    const el = mount();
    el.data = apollo as TimarroTimelineData;
    expect(el.shadowRoot?.textContent).toContain('Apollo program');
    expect(el.shadowRoot?.textContent).toContain('7 events');
    expect(el.data?.events).toHaveLength(7);
    el.remove();
  });

  it('renders validation issues for invalid data and keeps data null', () => {
    const el = mount();
    el.data = {
      timeline: { id: 't', title: 'Broken' },
      events: [{ id: 'e', title: 'E', date: { start: '1943', precision: 'day' } }],
    } as TimarroTimelineData;
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
