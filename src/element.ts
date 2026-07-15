import { normalizeTimelineData, type NormalizedTimeline } from './model/normalize';
import { renderPopover, POPOVER_WIDTH, CANVAS_TOP_PAD, LANE_HEIGHT } from './render/event-card';
import { renderTimeline, type PositionedEvent } from './render/render';
import { applyStyles } from './render/styles';
import type { TimarroTimelineData } from './schema/types';
import { validateTimelineData } from './schema/validate';

type State =
  | { kind: 'empty' }
  | { kind: 'error'; heading: string; details: string[] }
  | { kind: 'ready'; data: TimarroTimelineData; normalized: NormalizedTimeline };

/**
 * `<timarro-timeline>` — renders a horizontal timeline from §5-shaped JSON.
 *
 * Attributes: `src` (JSON URL) · `locale` (BCP-47, default browser) ·
 * `orientation` (M4: auto|horizontal|vertical — horizontal-only for now) ·
 * `legend` (M5). Setting the `data` property wins over `src`.
 *
 * Events (bubbling, composed): `timarro:load` {timeline} · `timarro:error`
 * {message[, issues]} · `timarro:select` {event}.
 */
export class TimarroTimeline extends HTMLElement {
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
  #openEventId: string | null = null;
  #onDocumentClick = (event: MouseEvent): void => this.#handleDocumentClick(event);
  #onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.#closePopover();
  };

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    applyStyles(this.#root);
    this.#container = document.createElement('div');
    this.#container.className = 'container';
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
        if (width !== this.#lastWidth) {
          this.#lastWidth = width;
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

  #render(): void {
    this.#closePopover();
    const container = this.#container;
    container.replaceChildren();
    const state = this.#state;

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
    container.append(header);

    if (state.normalized.domain === null) {
      container.append(this.#statusBox('timarro: timeline has no events'));
      return;
    }

    const viewport = document.createElement('div');
    viewport.className = 'viewport';
    viewport.setAttribute('part', 'viewport');
    const width = Math.max(this.clientWidth || 0, 480);
    this.#lastWidth = this.clientWidth || 0;
    renderTimeline(viewport, state.normalized, width, {
      locale: this.getAttribute('locale') ?? undefined,
      onSelect: (positioned, anchor) => this.#togglePopover(positioned, anchor),
    });
    container.append(viewport);

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

  #togglePopover(positioned: PositionedEvent, anchor: HTMLElement): void {
    const viewport = this.#container.querySelector<HTMLElement>('.viewport');
    if (!viewport) return;

    if (this.#openEventId === positioned.ev.src.id) {
      this.#closePopover();
      return;
    }
    this.#closePopover();

    const popover = renderPopover(positioned, this.getAttribute('locale') ?? undefined, () =>
      this.#closePopover(),
    );
    // Appended to .container, not the canvas — the viewport's overflow clipping must
    // not cut the popover off. Compensate for the viewport's horizontal scroll.
    const containerWidth = this.#container.clientWidth || 480;
    const left = Math.min(
      Math.max(positioned.left - viewport.scrollLeft, 8),
      Math.max(containerWidth - POPOVER_WIDTH - 8, 8),
    );
    popover.style.left = `${left}px`;
    popover.style.top = `${viewport.offsetTop + CANVAS_TOP_PAD + (positioned.lane + 1) * LANE_HEIGHT + 2}px`;
    this.#container.append(popover);
    this.#openEventId = positioned.ev.src.id;

    document.addEventListener('click', this.#onDocumentClick);
    document.addEventListener('keydown', this.#onDocumentKeydown);
    void anchor; // reserved for M4 focus management

    this.#dispatch('timarro:select', { event: positioned.ev.src });
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

  #closePopover(): void {
    this.#container.querySelector('.popover')?.remove();
    this.#openEventId = null;
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
  if (!customElements.get(tagName)) {
    customElements.define(tagName, TimarroTimeline);
  }
}
