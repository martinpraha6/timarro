import type { ResolvedEvent } from '../model/normalize';
import { formatEventAria, formatEventDate } from './format';

export const LANE_HEIGHT = 36;
export const AXIS_HEIGHT = 30;
export const CANVAS_TOP_PAD = 4;
export const POPOVER_WIDTH = 280;

export interface PositionedEvent {
  ev: ResolvedEvent;
  kind: 'point' | 'range';
  /** Points: px of start.mid. Ranges: px of the bar's left edge (start.earliest). */
  x: number;
  /** Bar width for ranges (uncertainty envelope included); 0 for points. */
  barWidth: number;
  /** Left edge of the rendered flex row. */
  left: number;
  /** Horizontal extent (incl. estimated label and band) used for lane packing. */
  extent: [number, number];
  lane: number;
  /** Fuzzy points: canvas-px span of the start uncertainty interval. */
  band?: [number, number];
  /** Ranges: px width of the endpoint fade when that endpoint is fuzzy. */
  fadeLeft?: number;
  fadeRight?: number;
}

/** Marker shape modifier per precision: ring for month, diamond for year (M5). */
export function markerShapeClass(precision: string): string {
  if (precision === 'year') return ' marker--year';
  if (precision === 'month') return ' marker--month';
  return '';
}

/** All data strings go through textContent — never innerHTML. */
export function renderEvent(
  positioned: PositionedEvent,
  locale: string | undefined,
  onSelect: (ev: ResolvedEvent, anchor: HTMLElement) => void,
): HTMLElement {
  const item = document.createElement('div');
  item.className = 'event';
  item.setAttribute('role', 'listitem');
  item.setAttribute('part', 'event');
  item.dataset['eventId'] = positioned.ev.src.id;
  item.style.left = `${positioned.left}px`;
  item.style.top = `${CANVAS_TOP_PAD + positioned.lane * LANE_HEIGHT}px`;

  // Uncertainty band behind fuzzy point markers; dashed edges signal circa.
  if (positioned.band) {
    const band = document.createElement('span');
    band.className = positioned.ev.src.date.circa === true ? 'band band--circa' : 'band';
    band.setAttribute('aria-hidden', 'true');
    band.style.left = `${positioned.band[0] - positioned.left}px`;
    band.style.width = `${Math.max(positioned.band[1] - positioned.band[0], 2)}px`;
    item.append(band);
  }

  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className =
    positioned.kind === 'range'
      ? 'marker marker--range'
      : `marker marker--point${markerShapeClass(positioned.ev.startParts.precision)}`;
  if (positioned.kind === 'range') {
    marker.style.width = `${positioned.barWidth}px`;
    const fadeLeft = positioned.fadeLeft ?? 0;
    const fadeRight = positioned.fadeRight ?? 0;
    if (fadeLeft > 1 || fadeRight > 1) {
      marker.style.background = `linear-gradient(to right, transparent 0, var(--timarro-accent, #d6451b) ${fadeLeft}px, var(--timarro-accent, #d6451b) calc(100% - ${fadeRight}px), transparent 100%)`;
    }
  }
  marker.setAttribute('aria-label', formatEventAria(positioned.ev, locale));
  marker.setAttribute('aria-haspopup', 'dialog');
  marker.setAttribute('aria-expanded', 'false');
  marker.addEventListener('click', () => onSelect(positioned.ev, marker));

  const label = document.createElement('span');
  label.className = 'label';
  // "~" is the at-a-glance circa affordance (the date itself lives in the popover).
  label.textContent =
    positioned.ev.src.date.circa === true
      ? `~ ${positioned.ev.src.title}`
      : positioned.ev.src.title;

  item.append(marker, label);
  return item;
}

export function renderPopover(
  ev: ResolvedEvent,
  locale: string | undefined,
  onClose: () => void,
): HTMLElement {
  const { src } = ev;

  const popover = document.createElement('article');
  popover.className = 'popover';
  popover.setAttribute('part', 'card');
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', src.title);

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
  date.textContent = formatEventDate(ev, locale);

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
