import '../src/register';
import type { TimarroTimeline } from '../src/element';

const el = document.querySelector<TimarroTimeline>('#with-data');
if (el) {
  el.data = {
    timeline: { title: 'Apollo program (placeholder)' },
    events: [{}, {}, {}],
  };
}
