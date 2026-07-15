import { describe, expect, it } from 'vitest';
import { TimarroTimeline, define } from './index';

describe('define()', () => {
  it('registers the custom element and is idempotent', () => {
    define();
    expect(customElements.get('timarro-timeline')).toBe(TimarroTimeline);
    expect(() => define()).not.toThrow();
  });
});

describe('<timarro-timeline>', () => {
  it('renders a no-data message into its shadow root', () => {
    define();
    const el = document.createElement('timarro-timeline');
    document.body.append(el);
    expect(el.shadowRoot?.textContent).toContain('timarro: no data');
    el.remove();
  });

  it('re-renders when data is set', () => {
    define();
    const el = document.createElement('timarro-timeline') as TimarroTimeline;
    document.body.append(el);
    el.data = { timeline: { title: 'Apollo program' }, events: [{}, {}, {}] };
    expect(el.shadowRoot?.textContent).toContain('Apollo program');
    expect(el.shadowRoot?.textContent).toContain('3 events');
    el.remove();
  });
});
