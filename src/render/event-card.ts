import type { ResolvedEvent } from '../model/normalize';
import { formatEventAria, formatEventDate } from './format';

export const LANE_HEIGHT = 52;
export const AXIS_HEIGHT = 42;
export const CANVAS_TOP_PAD = 14;
export const POPOVER_WIDTH = 320;

/** Range layout: labeled bars live in their own region below the point events. */
export const RANGE_BAR_HEIGHT = 10;
/** Height of a single range's bar row (bar vertically centred within). */
export const RANGE_ROW_HEIGHT = 38;
/** Vertical stride between stacked range lanes (row + gap). */
export const RANGE_LANE_HEIGHT = 44;
/** Gap between the point-events region and the ranges region below it. */
export const RANGES_TOP_GAP = 14;

/** CSS custom property carrying a per-event accent (see {@link safeCssColor}). */
const EV_COLOR_VAR = '--ev-color';
/**
 * The resolved accent token. The stylesheet defines `--_accent` on each
 * color-bearing container as `var(--ev-color, var(--timarro-accent, …))`, so a
 * single-level `var()` here is enough — and stays parseable in non-browser DOMs
 * (happy-dom rejects nested `var()` in inline styles).
 */
const ACCENT = 'var(--_accent)';

export interface PositionedEvent {
  ev: ResolvedEvent;
  kind: 'point' | 'range';
  /** Points: px of start.mid. Ranges: px of the bar's left edge (start.earliest). */
  x: number;
  /** Bar width for ranges (uncertainty envelope included); 0 for points. */
  barWidth: number;
  /** Left edge of the rendered flex row. */
  left: number;
  /** Canvas-px y of the rendered row (marker centre line region). */
  top: number;
  /** Horizontal extent (incl. estimated label and band) used for lane packing. */
  extent: [number, number];
  lane: number;
  /** Fuzzy points: canvas-px span of the start uncertainty interval. */
  band?: [number, number];
  /** Ranges: px width of the endpoint fade when that endpoint is fuzzy. */
  fadeLeft?: number;
  fadeRight?: number;
  /**
   * Ranges only: the full-height translucent band drawn behind the events the
   * range spans. Height grows with overlap depth so stacked ranges stay legible.
   */
  rangeBand?: { left: number; width: number; top: number; height: number };
  /** Sanitized per-event accent, or undefined to inherit the host accent. */
  color?: string;
}

/**
 * Accept a CSS color for use as an inline accent; reject anything else so an
 * untrusted `color` field can't smuggle extra declarations into the style
 * attribute. Uses `CSS.supports` where available (browser), with a conservative
 * literal-form fallback for non-DOM environments.
 */
export function safeCssColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v.length === 0 || v.length > 64) return null;
  // Never allow value-terminating / comment / url tokens regardless of engine.
  if (/[;{}]/.test(v) || v.includes('/*') || /url\s*\(/i.test(v)) return null;
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', v) ? v : null;
  }
  // Fallback: hex, a bare keyword, or a numeric color function.
  return /^#[0-9a-f]{3,8}$/i.test(v) ||
    /^[a-z]+$/i.test(v) ||
    /^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\([\d\s.,%/-]+\)$/i.test(v)
    ? v
    : null;
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
  item.className = positioned.kind === 'range' ? 'event event--range' : 'event';
  item.setAttribute('role', 'listitem');
  item.setAttribute('part', 'event');
  item.dataset['eventId'] = positioned.ev.src.id;
  item.style.left = `${positioned.left}px`;
  item.style.top = `${positioned.top}px`;
  if (positioned.color) item.style.setProperty(EV_COLOR_VAR, positioned.color);

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
      marker.style.background = `linear-gradient(to right, transparent 0, ${ACCENT} ${fadeLeft}px, ${ACCENT} calc(100% - ${fadeRight}px), transparent 100%)`;
    }
  }
  marker.setAttribute('aria-label', formatEventAria(positioned.ev, locale));
  marker.setAttribute('aria-haspopup', 'dialog');
  marker.setAttribute('aria-expanded', 'false');
  marker.addEventListener('click', () => onSelect(positioned.ev, marker));

  const copy = document.createElement('span');
  copy.className = 'event-copy';

  const label = document.createElement('span');
  label.className = 'label';
  // "~" is the at-a-glance circa affordance.
  label.textContent =
    positioned.ev.src.date.circa === true
      ? `~ ${positioned.ev.src.title}`
      : positioned.ev.src.title;

  const date = document.createElement('span');
  date.className = 'event-date';
  date.textContent = formatEventDate(positioned.ev, locale);

  copy.append(label, date);
  item.append(marker, copy);
  return item;
}

/**
 * The full-height translucent band a range casts behind the events it spans.
 * Purely decorative (`pointer-events: none`) — the labeled bar from
 * {@link renderEvent} stays the interactive handle. Semi-transparent fill means
 * overlapping bands darken where they stack, reading as event density.
 */
export function renderRangeBand(positioned: PositionedEvent): HTMLElement | null {
  const rb = positioned.rangeBand;
  if (!rb) return null;
  const band = document.createElement('span');
  band.className = 'rband';
  band.setAttribute('aria-hidden', 'true');
  band.style.left = `${rb.left}px`;
  band.style.width = `${rb.width}px`;
  band.style.top = `${rb.top}px`;
  band.style.height = `${rb.height}px`;
  if (positioned.color) band.style.setProperty(EV_COLOR_VAR, positioned.color);
  return band;
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
