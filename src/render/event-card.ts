import type { ResolvedEvent } from '../model/normalize';
import { formatEventAria, formatEventDate } from './format';

export const LANE_HEIGHT = 36;
export const AXIS_HEIGHT = 30;
export const CANVAS_TOP_PAD = 4;
export const POPOVER_WIDTH = 280;

export interface PositionedEvent {
  ev: ResolvedEvent;
  kind: 'point' | 'range';
  /** px of start.mid on the scale. */
  x: number;
  /** Bar width for ranges; 0 for points. */
  barWidth: number;
  /** Left edge of the rendered flex row. */
  left: number;
  /** Horizontal extent (incl. estimated label) used for lane packing. */
  extent: [number, number];
  lane: number;
}

/** All data strings go through textContent — never innerHTML. */
export function renderEvent(
  positioned: PositionedEvent,
  locale: string | undefined,
  onSelect: (positioned: PositionedEvent, anchor: HTMLElement) => void,
): HTMLElement {
  const item = document.createElement('div');
  item.className = 'event';
  item.setAttribute('role', 'listitem');
  item.setAttribute('part', 'event');
  item.dataset['eventId'] = positioned.ev.src.id;
  item.style.left = `${positioned.left}px`;
  item.style.top = `${CANVAS_TOP_PAD + positioned.lane * LANE_HEIGHT}px`;

  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = positioned.kind === 'range' ? 'marker marker--range' : 'marker marker--point';
  if (positioned.kind === 'range') marker.style.width = `${positioned.barWidth}px`;
  marker.setAttribute('aria-label', formatEventAria(positioned.ev, locale));
  marker.addEventListener('click', () => onSelect(positioned, marker));

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = positioned.ev.src.title;

  item.append(marker, label);
  return item;
}

export function renderPopover(
  positioned: PositionedEvent,
  locale: string | undefined,
  onClose: () => void,
): HTMLElement {
  const { src } = positioned.ev;

  const popover = document.createElement('article');
  popover.className = 'popover';
  popover.setAttribute('part', 'card');

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'popover-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '✕';
  close.addEventListener('click', onClose);

  const title = document.createElement('h3');
  title.className = 'popover-title';
  title.textContent = src.title;

  const date = document.createElement('p');
  date.className = 'popover-date';
  date.textContent = formatEventDate(positioned.ev, locale);

  popover.append(close, title, date);

  if (src.description) {
    const desc = document.createElement('p');
    desc.className = 'popover-desc';
    desc.textContent = src.description;
    popover.append(desc);
  }

  const safeMedia = (src.mediaUrls ?? [])
    .map(safeHttpUrl)
    .filter((url): url is string => url !== null);
  const [thumbnail, ...restMedia] = safeMedia;
  if (thumbnail) {
    const img = document.createElement('img');
    img.src = thumbnail;
    img.loading = 'lazy';
    img.alt = '';
    popover.append(img);
  }

  if (src.entities && src.entities.length > 0) {
    const entities = document.createElement('ul');
    entities.className = 'entities';
    for (const entity of src.entities) {
      const li = document.createElement('li');
      li.textContent = entity;
      entities.append(li);
    }
    popover.append(entities);
  }

  if (restMedia.length > 0) {
    const media = document.createElement('p');
    media.className = 'popover-media';
    media.textContent = `Media: ${restMedia.join(' · ')}`;
    popover.append(media);
  }

  if (src.sourceRef) {
    const source = document.createElement('p');
    source.className = 'popover-source';
    source.textContent = `Source: ${src.sourceRef}`;
    popover.append(source);
  }

  return popover;
}

/** Accept http(s) URLs only — anything else (javascript:, data:, junk) is dropped. */
function safeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url, document.baseURI);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}
