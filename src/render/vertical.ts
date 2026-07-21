import type { NormalizedTimeline, ResolvedEvent } from '../model/normalize';
import { markerShapeClass, safeCssColor } from './event-card';
import { formatEventAria, formatEventDate } from './format';

export interface VerticalRenderContext {
  locale?: string;
  onSelect(ev: ResolvedEvent, anchor: HTMLElement): void;
}

/**
 * Vertical (rail) layout for narrow containers: markers on a left rail, title +
 * date to the right, natural page-flow height. Chronological top → bottom; no
 * time scale — spacing is uniform, the dates carry the chronology.
 */
export function renderVerticalTimeline(
  viewport: HTMLElement,
  normalized: NormalizedTimeline,
  ctx: VerticalRenderContext,
): void {
  viewport.replaceChildren();
  if (normalized.domain === null) return;

  const list = document.createElement('div');
  list.className = 'vlist';
  list.setAttribute('role', 'list');

  for (const ev of normalized.events) {
    const item = document.createElement('div');
    item.className = 'vevent';
    item.setAttribute('role', 'listitem');
    item.setAttribute('part', 'event');
    item.dataset['eventId'] = ev.src.id;
    const color = safeCssColor(ev.src.color);
    if (color) item.style.setProperty('--ev-color', color);

    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className =
      ev.end !== undefined
        ? 'marker marker--range marker--vrange'
        : `marker marker--point${markerShapeClass(ev.startParts.precision)}`;
    marker.setAttribute('aria-label', formatEventAria(ev, ctx.locale));
    marker.setAttribute('aria-haspopup', 'dialog');
    marker.setAttribute('aria-expanded', 'false');
    marker.addEventListener('click', () => ctx.onSelect(ev, marker));

    const body = document.createElement('div');
    body.className = 'vbody';
    const label = document.createElement('span');
    label.className = 'label label--wrap';
    label.textContent = ev.src.title;
    const date = document.createElement('span');
    date.className = 'vdate';
    date.textContent = formatEventDate(ev, ctx.locale);
    body.append(label, date);

    item.append(marker, body);
    list.append(item);
  }

  viewport.append(list);
}
