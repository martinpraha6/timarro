import '../src/register';
import type { TimarroTimeline } from '../src/element';
import type { TimarroTimelineData } from '../src/schema/types';

async function load(selector: string, url: string): Promise<void> {
  const el = document.querySelector<TimarroTimeline>(selector);
  if (!el) return;
  const response = await fetch(url);
  el.data = (await response.json()) as TimarroTimelineData;
}

void load('#apollo', './data/apollo.json');
void load('#charles', './data/charles-iv.json');
void load('#apollo-narrow', './data/apollo.json');
void load('#charles-vertical', './data/charles-iv.json');

// Deliberately invalid — shows the validator's error rendering.
const broken = document.querySelector<TimarroTimeline>('#broken');
if (broken) {
  broken.data = {
    timeline: { id: 'tl-broken', title: 'Broken example' },
    events: [
      {
        id: 'e1',
        title: 'Year value declared as day precision',
        date: { start: '1943', precision: 'day' },
      },
    ],
  } as TimarroTimelineData;
}
