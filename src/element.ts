import {
  normalizeTimelineData,
  type NormalizedTimeline,
  type ResolvedEvent,
} from './model/normalize';
import { renderPopover, POPOVER_WIDTH } from './render/event-card';
import { renderTimeline } from './render/render';
import { applyStyles } from './render/styles';
import { safeHttpUrl } from './render/url';
import { renderVerticalTimeline } from './render/vertical';
import type { TimarroTimelineData } from './schema/types';
import { validateTimelineData } from './schema/validate';

type State =
  | { kind: 'empty' }
  | { kind: 'error'; heading: string; details: string[] }
  | { kind: 'ready'; data: TimarroTimelineData; normalized: NormalizedTimeline };

type Orientation = 'horizontal' | 'vertical';

/** Container width (px) below which `orientation="auto"` switches to vertical. */
const VERTICAL_BREAKPOINT = 800;

/**
 * SSR-safe base: importing this module in Node (e.g. to run the validator
 * server-side) must not crash on a missing HTMLElement. The stand-in class is
 * never instantiated — `define()` no-ops outside the browser.
 */
const BaseElement: typeof HTMLElement =
  typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as unknown as typeof HTMLElement);

/**
 * `<timarro-timeline>` — renders a timeline from §5-shaped JSON.
 *
 * Attributes: `src` (JSON URL) · `locale` (BCP-47, default browser) ·
 * `orientation` (auto | horizontal | vertical; auto switches on container
 * width < 800px) · `legend` (M5). Setting the `data` property wins over `src`.
 *
 * Keyboard: arrow keys move focus chronologically between event markers
 * (roving tabindex), Home/End jump to the first/last event, Enter/Space
 * toggle the detail popover, Escape closes it and returns focus.
 *
 * Events (bubbling, composed): `timarro:load` {timeline} · `timarro:error`
 * {message[, issues]} · `timarro:select` {event}.
 */
export class TimarroTimeline extends BaseElement {
  static readonly observedAttributes: readonly string[] = [
    'src',
    'locale',
    'orientation',
    'legend',
  ];

  #root: ShadowRoot;
  #container: HTMLDivElement;
  #state: State = { kind: 'empty' };
  #abort: AbortController | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #lastWidth = 0;
  #renderedOrientation: Orientation | null = null;
  #openEventId: string | null = null;
  #openAnchor: HTMLElement | null = null;
  #onDocumentClick = (event: MouseEvent): void => {
    this.#handleDocumentClick(event);
  };
  #onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.#closePopover(true);
  };

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    applyStyles(this.#root);
    this.#container = document.createElement('div');
    this.#container.className = 'container';
    this.#container.addEventListener('keydown', (event) => {
      this.#handleMarkerKeydown(event);
    });
    this.#root.append(this.#container);
  }

  /** The last successfully validated data; null if unset or the last input was invalid. */
  get data(): TimarroTimelineData | null {
    return this.#state.kind === 'ready' ? this.#state.data : null;
  }

  /** Setting data aborts any in-flight `src` fetch — the property wins. */
  set data(value: TimarroTimelineData | null) {
    this.#abortFetch();
    this.#ingest(value);
  }

  connectedCallback(): void {
    if (typeof ResizeObserver !== 'undefined' && this.#resizeObserver === null) {
      this.#resizeObserver = new ResizeObserver(() => {
        const width = this.clientWidth;
        if (width === this.#lastWidth) return;
        this.#lastWidth = width;
        // Vertical layout is flow-based — only re-render there when the
        // orientation actually flips; horizontal re-scales on every change.
        if (
          this.#resolveOrientation() !== this.#renderedOrientation ||
          this.#renderedOrientation === 'horizontal'
        ) {
          this.#render();
        }
      });
      this.#resizeObserver.observe(this);
    }
    this.#render();
  }

  disconnectedCallback(): void {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#abortFetch();
    this.#closePopover();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    if (name === 'src') {
      if (newValue !== null) void this.#fetchSrc(newValue);
    } else {
      this.#render();
    }
  }

  #ingest(value: unknown): void {
    if (value === null || value === undefined) {
      this.#state = { kind: 'empty' };
      this.#render();
      return;
    }
    const result = validateTimelineData(value);
    if (result.ok) {
      this.#state = {
        kind: 'ready',
        data: result.data,
        normalized: normalizeTimelineData(result.data),
      };
      this.#dispatch('timarro:load', { timeline: result.data.timeline });
    } else {
      const n = result.issues.length;
      this.#state = {
        kind: 'error',
        heading: `timarro: invalid data (${n} issue${n === 1 ? '' : 's'})`,
        details: result.issues.map((issue) => `${issue.path}: ${issue.message}`),
      };
      this.#dispatch('timarro:error', { message: 'invalid data', issues: result.issues });
    }
    this.#render();
  }

  async #fetchSrc(src: string): Promise<void> {
    this.#abortFetch();
    const controller = new AbortController();
    this.#abort = controller;
    try {
      const response = await fetch(src, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status} while loading ${src}`);
      const json: unknown = await response.json();
      if (controller.signal.aborted) return;
      this.#ingest(json);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      this.#state = { kind: 'error', heading: 'timarro: failed to load data', details: [message] };
      this.#dispatch('timarro:error', { message });
      this.#render();
    } finally {
      if (this.#abort === controller) this.#abort = null;
    }
  }

  #abortFetch(): void {
    this.#abort?.abort();
    this.#abort = null;
  }

  #dispatch(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  #resolveOrientation(): Orientation {
    const attr = this.getAttribute('orientation');
    if (attr === 'horizontal' || attr === 'vertical') return attr;
    const width = this.clientWidth || 0;
    return width > 0 && width < VERTICAL_BREAKPOINT ? 'vertical' : 'horizontal';
  }

  #render(): void {
    this.#closePopover();
    const container = this.#container;
    container.replaceChildren();
    const state = this.#state;
    this.#renderedOrientation = null;

    if (state.kind === 'empty') {
      container.append(this.#statusBox('timarro: no data'));
      return;
    }
    if (state.kind === 'error') {
      container.append(this.#errorBox(state.heading, state.details));
      return;
    }

    const header = document.createElement('h2');
    header.className = 'header';
    header.setAttribute('part', 'header');
    header.textContent = state.data.timeline.title;
    const heading = document.createElement('header');
    heading.className = 'heading';
    // Cover art floats to the right of the title and description — the same
    // layout timarro-platform gives it, so an embed and the page it came from
    // agree. It is appended FIRST because a float is taken out of flow where it
    // appears: the title and description only run up its left side if they come
    // after it. Dropped silently when the URL isn't http(s): a broken image is
    // worse than no image, and the field is whatever an author typed.
    const coverUrl = state.data.timeline.coverImageUrl;
    const cover = coverUrl === undefined ? null : safeHttpUrl(coverUrl);
    if (cover !== null) {
      const img = document.createElement('img');
      img.className = 'cover';
      img.setAttribute('part', 'cover');
      img.src = cover;
      img.loading = 'lazy';
      // Decorative by position: the title beside it already names the subject,
      // and there is no caption field to say anything more.
      img.alt = '';
      heading.append(img);
    }
    heading.append(header);
    if (state.data.timeline.description) {
      const description = document.createElement('p');
      description.className = 'description';
      description.textContent = state.data.timeline.description;
      heading.append(description);
    }
    container.append(heading);

    if (state.normalized.domain === null) {
      container.append(this.#statusBox('timarro: timeline has no events'));
      return;
    }

    const orientation = this.#resolveOrientation();
    this.#renderedOrientation = orientation;
    this.#lastWidth = this.clientWidth || 0;

    const viewport = document.createElement('div');
    viewport.className = orientation === 'vertical' ? 'viewport viewport--vertical' : 'viewport';
    viewport.setAttribute('part', 'viewport');
    const ctx = {
      locale: this.getAttribute('locale') ?? undefined,
      onSelect: (ev: ResolvedEvent, anchor: HTMLElement) => {
        this.#togglePopover(ev, anchor);
      },
    };
    if (orientation === 'vertical') {
      renderVerticalTimeline(viewport, state.normalized, ctx);
    } else {
      renderTimeline(viewport, state.normalized, Math.max(this.clientWidth || 0, 480), ctx);
    }
    container.append(viewport);
    this.#applyRovingTabindex();

    if (this.#legendEnabled()) container.append(this.#buildLegend());

    const brand = document.createElement('div');
    brand.className = 'brand';
    const link = document.createElement('a');
    link.href = 'https://timarro.com';
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('part', 'brand');
    link.textContent = 'Powered by Timarro';
    brand.append(link);
    container.append(brand);
  }

  /** Legend defaults on; `legend="false"` / `legend="off"` hides it. */
  #legendEnabled(): boolean {
    const value = this.getAttribute('legend');
    return value !== 'false' && value !== 'off';
  }

  /** Compact key for the precision marker shapes (M5). */
  #buildLegend(): HTMLElement {
    const legend = document.createElement('div');
    legend.className = 'legend';
    legend.setAttribute('part', 'legend');
    const entries: [string, string][] = [
      ['legend-swatch', 'Exact date'],
      ['legend-swatch legend-swatch--month', 'Month'],
      ['legend-swatch legend-swatch--year', 'Year'],
      ['legend-tilde', 'Approximate'],
    ];
    for (const [className, text] of entries) {
      const item = document.createElement('span');
      item.className = 'legend-item';
      const swatch = document.createElement('span');
      swatch.className = className;
      swatch.setAttribute('aria-hidden', 'true');
      if (className === 'legend-tilde') swatch.textContent = '~';
      const label = document.createElement('span');
      label.textContent = text;
      item.append(swatch, label);
      legend.append(item);
    }
    return legend;
  }

  /** First marker is the single tab stop; arrow keys move focus from there. */
  #applyRovingTabindex(): void {
    const markers = this.#markers();
    markers.forEach((marker, index) => {
      marker.tabIndex = index === 0 ? 0 : -1;
    });
  }

  #markers(): HTMLButtonElement[] {
    return [...this.#container.querySelectorAll<HTMLButtonElement>('.marker')];
  }

  #handleMarkerKeydown(event: KeyboardEvent): void {
    const key = event.key;
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
    const markers = this.#markers();
    if (markers.length === 0) return;
    const current = markers.indexOf(this.#root.activeElement as HTMLButtonElement);
    if (current === -1) return;

    let next: number;
    if (key === 'ArrowRight' || key === 'ArrowDown')
      next = Math.min(current + 1, markers.length - 1);
    else if (key === 'ArrowLeft' || key === 'ArrowUp') next = Math.max(current - 1, 0);
    else if (key === 'Home') next = 0;
    else next = markers.length - 1;

    event.preventDefault();
    if (next === current) return;
    const from = markers[current];
    const to = markers[next];
    if (!from || !to) return;
    from.tabIndex = -1;
    to.tabIndex = 0;
    to.focus();
    to.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  #togglePopover(ev: ResolvedEvent, anchor: HTMLElement): void {
    if (this.#openEventId === ev.src.id) {
      this.#closePopover();
      return;
    }
    this.#closePopover();

    const popover = renderPopover(ev, this.getAttribute('locale') ?? undefined, () => {
      this.#closePopover(true);
    });
    // Positioned from the anchor's rect relative to .container (works in both
    // orientations, and rect math already accounts for the viewport's scroll).
    // Appended to .container, not the canvas — the viewport's overflow clipping
    // must not cut the popover off.
    const containerRect = this.#container.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const containerWidth = this.#container.clientWidth || 480;
    const left = Math.min(
      Math.max(anchorRect.left - containerRect.left, 8),
      Math.max(containerWidth - POPOVER_WIDTH - 8, 8),
    );
    popover.style.left = `${left}px`;
    popover.style.top = `${anchorRect.bottom - containerRect.top + 8}px`;
    this.#container.append(popover);
    this.#openEventId = ev.src.id;
    this.#openAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');

    document.addEventListener('click', this.#onDocumentClick);
    document.addEventListener('keydown', this.#onDocumentKeydown);

    this.#dispatch('timarro:select', { event: ev.src });
  }

  #handleDocumentClick(event: MouseEvent): void {
    const path = event.composedPath();
    const popover = this.#container.querySelector('.popover');
    const clickedPopover = popover !== null && path.includes(popover);
    // The opening click also bubbles to this handler — the marker guard keeps it open.
    const clickedOwnMarker =
      path.includes(this.#root) &&
      path.some((node) => node instanceof HTMLElement && node.classList.contains('marker'));
    if (clickedPopover || clickedOwnMarker) return;
    this.#closePopover();
  }

  #closePopover(refocusAnchor = false): void {
    this.#container.querySelector('.popover')?.remove();
    this.#openEventId = null;
    const anchor = this.#openAnchor;
    this.#openAnchor = null;
    anchor?.setAttribute('aria-expanded', 'false');
    if (refocusAnchor) anchor?.focus();
    document.removeEventListener('click', this.#onDocumentClick);
    document.removeEventListener('keydown', this.#onDocumentKeydown);
  }

  #statusBox(message: string): HTMLElement {
    const box = document.createElement('div');
    box.className = 'box';
    box.textContent = message;
    return box;
  }

  #errorBox(heading: string, details: string[]): HTMLElement {
    const box = document.createElement('div');
    box.className = 'box box--error';
    const head = document.createElement('div');
    head.textContent = heading;
    box.append(head);
    if (details.length > 0) {
      const list = document.createElement('ul');
      list.className = 'issues';
      for (const detail of details.slice(0, 3)) {
        const item = document.createElement('li');
        item.textContent = detail;
        list.append(item);
      }
      if (details.length > 3) {
        const item = document.createElement('li');
        item.textContent = `… and ${details.length - 3} more`;
        list.append(item);
      }
      box.append(list);
    }
    return box;
  }
}

export function define(tagName = 'timarro-timeline'): void {
  if (typeof customElements === 'undefined') return; // SSR / Node: no-op
  if (!customElements.get(tagName)) {
    customElements.define(tagName, TimarroTimeline);
  }
}
