import type { TimeScale } from './layout/scale';
import {
  normalizeTimelineData,
  type NormalizedTimeline,
  type ResolvedEvent,
} from './model/normalize';
import { renderPopover, POPOVER_WIDTH } from './render/event-card';
import { measureBaseWidth, renderTimeline, type RenderContext } from './render/render';
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

interface ZoomControls {
  zoomOut: HTMLButtonElement;
  level: HTMLButtonElement;
  zoomIn: HTMLButtonElement;
  /** Off-screen live region; see `#buildZoomControls`. */
  status: HTMLElement;
}

/** Memoized {@link measureBaseWidth}, keyed on the inputs it actually depends on. */
interface BaseWidthCache {
  normalized: NormalizedTimeline;
  viewportWidth: number;
  value: number;
}

/** Container width (px) below which `orientation="auto"` switches to vertical. */
const VERTICAL_BREAKPOINT = 800;

/** Minimum canvas width the horizontal layout is laid out against. */
const MIN_PLOT_WIDTH = 480;

/**
 * 1× is the layout's own default: wide enough that point events stay inside
 * their lane budget, which on a dense timeline is already wider than the
 * viewport. Zooming out below it (down to `#minZoom`, where the whole domain
 * fits on screen) is what gets you the overview.
 */
const DEFAULT_ZOOM = 1;
const MAX_ZOOM = 16;
/** One button press / key press. ~1.7 presses per doubling. */
const ZOOM_STEP = 1.5;
/** Zoom per px of wheel travel: one 100px notch ≈ 1.4×. */
const WHEEL_ZOOM_RATE = 0.0035;
/** Coarse devices can report huge single deltas — cap one event's worth. */
const MAX_WHEEL_DELTA_PX = 200;
const WHEEL_LINE_PX = 16;
const WHEEL_PAGE_PX = 400;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Wheel deltas arrive in px, lines, or pages — normalize to px. */
function wheelDeltaPx(event: WheelEvent): number {
  // 1 = DOM_DELTA_LINE, 2 = DOM_DELTA_PAGE (spelled out: the static members
  // aren't present on every DOM implementation this runs in).
  const scale = event.deltaMode === 1 ? WHEEL_LINE_PX : event.deltaMode === 2 ? WHEEL_PAGE_PX : 1;
  return clamp(event.deltaY * scale, -MAX_WHEEL_DELTA_PX, MAX_WHEEL_DELTA_PX);
}

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
 * width < 800px) · `legend` (M5) · `zoom` (`off`/`false` disables the
 * horizontal zoom controls and gestures). Setting the `data` property wins
 * over `src`.
 *
 * Keyboard: arrow keys move focus chronologically between event markers
 * (roving tabindex), Home/End jump to the first/last event, Enter/Space
 * toggle the detail popover, Escape closes it and returns focus, `+`/`-`
 * zoom the horizontal plot and `0` fits it back.
 *
 * Zoom (horizontal only): the −/level/+ pill in the footer row beside the
 * legend, `Ctrl`/`⌘` + wheel or a trackpad pinch (anchored at the cursor).
 * A plain wheel is left to the host page.
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
    'zoom',
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
  /** Horizontal only: the scroll container, its scale, and the zoom pill. */
  #viewport: HTMLElement | null = null;
  #scale: TimeScale | null = null;
  #zoomControls: ZoomControls | null = null;
  #zoom = DEFAULT_ZOOM;
  /** Zoom at which the whole domain fits on screen; ≤ 1 once auto-spread bites. */
  #minZoom = DEFAULT_ZOOM;
  #baseWidthCache: BaseWidthCache | null = null;
  /** In-flight coalesced zoom redraw, and the anchor it should restore. */
  #zoomFrame: number | null = null;
  #pendingAnchor: { time: number; offset: number } | null = null;
  #onDocumentClick = (event: MouseEvent): void => {
    this.#handleDocumentClick(event);
  };
  #onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.#closePopover(true);
  };
  #onWheel = (event: WheelEvent): void => {
    this.#handleWheel(event);
  };

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    applyStyles(this.#root);
    this.#container = document.createElement('div');
    this.#container.className = 'container';
    this.#container.addEventListener('keydown', (event) => {
      if (this.#handleZoomKeydown(event)) return;
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
    this.#cancelZoomDraw();
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
    // A new timeline starts at its own default — the old zoom described a
    // domain that no longer exists, and the cached width measured it.
    this.#zoom = DEFAULT_ZOOM;
    this.#minZoom = DEFAULT_ZOOM;
    this.#baseWidthCache = null;
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
    // Everything below was just detached along with the container's children,
    // including whatever a coalesced zoom draw was about to redraw into.
    this.#viewport = null;
    this.#scale = null;
    this.#zoomControls = null;
    this.#cancelZoomDraw();
    this.#pendingAnchor = null;

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
    const ctx = this.#renderContext();
    if (orientation === 'vertical') {
      // The rail layout is flow-based and never overflows, so there is nothing
      // to zoom; drop back to the default so a flip back to horizontal is clean.
      this.#zoom = DEFAULT_ZOOM;
      this.#minZoom = DEFAULT_ZOOM;
      renderVerticalTimeline(viewport, state.normalized, ctx);
    } else if (this.#zoomEnabled()) {
      // Non-passive: the zoom gesture has to cancel the browser's own.
      viewport.addEventListener('wheel', this.#onWheel, { passive: false });
      this.#viewport = viewport;
      this.#drawPlot(viewport, state.normalized, ctx);
    } else {
      // Zoom turned off mid-session: drop back to the default rather than
      // freeze at whatever level the user had reached, since the pill and the
      // gestures that would take them back are both about to disappear.
      this.#zoom = DEFAULT_ZOOM;
      this.#minZoom = DEFAULT_ZOOM;
      this.#viewport = viewport;
      this.#drawPlot(viewport, state.normalized, ctx);
    }
    container.append(viewport);

    // Footer strip under the plot, above the attribution: legend on the left,
    // zoom pill pushed to the right. Either may be turned off on its own.
    const showZoom = orientation === 'horizontal' && this.#zoomEnabled();
    if (this.#legendEnabled() || showZoom) {
      const toolbar = document.createElement('div');
      toolbar.className = 'toolbar';
      if (this.#legendEnabled()) toolbar.append(this.#buildLegend());
      if (showZoom) toolbar.append(this.#buildZoomControls());
      container.append(toolbar);
    }

    this.#applyRovingTabindex();
    this.#syncZoomControls();

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

  #renderContext(): RenderContext {
    return {
      locale: this.getAttribute('locale') ?? undefined,
      onSelect: (ev: ResolvedEvent, anchor: HTMLElement) => {
        this.#togglePopover(ev, anchor);
      },
    };
  }

  /**
   * Visible width the horizontal layout packs against, before the auto-spread
   * and the zoom multiplier widen the canvas past it.
   */
  #viewportWidth(): number {
    return Math.max(this.clientWidth || 0, MIN_PLOT_WIDTH);
  }

  /**
   * Zoom-1 canvas width, measured at most once per (timeline, viewport width).
   * The measurement is a search over as many as a dozen trial layouts of every
   * event, and nothing it depends on changes while zooming — without the cache a
   * wheel gesture would pay for it again on every event it emits.
   */
  #baseWidth(normalized: NormalizedTimeline, viewportWidth: number): number {
    const cached = this.#baseWidthCache;
    if (cached?.normalized === normalized && cached.viewportWidth === viewportWidth)
      return cached.value;
    const value = measureBaseWidth(normalized, viewportWidth);
    this.#baseWidthCache = { normalized, viewportWidth, value };
    return value;
  }

  /**
   * Re-draws just the plot at the current zoom, leaving the heading, zoom pill,
   * legend and brand in place — a full `#render()` would rebuild the very
   * controls the click came from.
   */
  #renderPlot(): void {
    const viewport = this.#viewport;
    const state = this.#state;
    if (viewport === null || state.kind !== 'ready') return;
    // Every marker is about to move, and the popover is positioned from its
    // anchor's rect — close it rather than leave it pointing at nothing.
    this.#closePopover();
    const focused = this.#markers().indexOf(this.#root.activeElement as HTMLButtonElement);
    this.#drawPlot(viewport, state.normalized, this.#renderContext());
    this.#applyRovingTabindex(focused);
    this.#syncZoomControls();
  }

  /**
   * One draw of the horizontal plot, plus the zoom bookkeeping that depends on
   * it: the layout picks its own zoom-1 width, which is what sets how far out
   * the user is allowed to zoom.
   */
  #drawPlot(viewport: HTMLElement, normalized: NormalizedTimeline, ctx: RenderContext): void {
    const viewportWidth = this.#viewportWidth();
    const baseWidth = this.#baseWidth(normalized, viewportWidth);
    // Below this the domain is fully on screen, so there is nothing further to
    // reveal. It is 1 unless the layout had to spread itself out to stay legible.
    this.#minZoom = Math.min(DEFAULT_ZOOM, viewportWidth / baseWidth);
    // A resize can raise the floor out from under the current zoom. Settle that
    // before drawing — correcting afterwards would throw away a whole canvas.
    this.#zoom = Math.max(this.#zoom, this.#minZoom);
    this.#scale = renderTimeline(viewport, normalized, viewportWidth, ctx, this.#zoom, baseWidth);
  }

  /** Zoom defaults on; `zoom="false"` / `zoom="off"` removes it entirely. */
  #zoomEnabled(): boolean {
    const value = this.getAttribute('zoom');
    return value !== 'false' && value !== 'off';
  }

  /**
   * Applies a new zoom level and keeps the instant under `anchorClientX` (or the
   * viewport centre, for button and keyboard zoom) pinned to the same spot on
   * screen — without that, zooming in appears to fling the view sideways.
   *
   * `defer` coalesces the redraw onto the next frame; see `#scheduleZoomDraw`.
   */
  #setZoom(value: number, anchorClientX?: number, defer = false): void {
    const next = clamp(value, this.#minZoom, MAX_ZOOM);
    if (next === this.#zoom) return;

    // Captured against the geometry currently on screen. With a deferred draw
    // that is still the last-drawn geometry, so every event in a burst anchors
    // against the same picture the user is looking at and the last one wins.
    const viewport = this.#viewport;
    const scale = this.#scale;
    if (viewport !== null && scale !== null) {
      const inner = viewport.clientWidth;
      const offset =
        anchorClientX === undefined
          ? inner / 2
          : clamp(anchorClientX - viewport.getBoundingClientRect().left, 0, inner);
      this.#pendingAnchor = { time: scale.toTime(viewport.scrollLeft + offset), offset };
    } else {
      this.#pendingAnchor = null;
    }

    this.#zoom = next;
    // The readout tracks the gesture even on a frame where the plot doesn't.
    this.#syncZoomControls();
    if (defer) this.#scheduleZoomDraw();
    else this.#drawZoom();
  }

  /**
   * Wheel events outrun the frame budget on a big timeline — laying out a
   * 500-event plot costs ~35ms against a 16.7ms frame — so a gesture coalesces
   * into one draw per frame instead of one per event. Buttons and keys draw
   * immediately: they cannot arrive fast enough to matter.
   */
  #scheduleZoomDraw(): void {
    if (this.#zoomFrame !== null) return;
    this.#zoomFrame = requestAnimationFrame(() => {
      this.#zoomFrame = null;
      this.#drawZoom();
    });
  }

  #cancelZoomDraw(): void {
    if (this.#zoomFrame === null) return;
    cancelAnimationFrame(this.#zoomFrame);
    this.#zoomFrame = null;
  }

  #drawZoom(): void {
    const anchor = this.#pendingAnchor;
    this.#pendingAnchor = null;
    this.#renderPlot();
    const viewport = this.#viewport;
    if (viewport !== null && anchor !== null && this.#scale !== null) {
      viewport.scrollLeft = this.#scale.toPx(anchor.time) - anchor.offset;
    }
  }

  /** Compact −/level/+ pill; the level readout doubles as reset-to-default. */
  #buildZoomControls(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'zoom';
    group.setAttribute('part', 'controls');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Zoom');
    // Names the gestures that have no visible affordance of their own.
    group.title = 'Zoom: these buttons, the + / − keys, or Ctrl/⌘ + scroll (trackpad pinch)';

    const button = (className: string, label: string, onClick: () => void): HTMLButtonElement => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = className;
      el.setAttribute('aria-label', label);
      el.addEventListener('click', onClick);
      return el;
    };

    const zoomOut = button('zoom-btn', 'Zoom out', () => {
      this.#setZoom(this.#zoom / ZOOM_STEP);
    });
    zoomOut.textContent = '−';
    const level = button('zoom-btn zoom-level', 'Reset zoom', () => {
      this.#setZoom(DEFAULT_ZOOM);
    });
    const zoomIn = button('zoom-btn', 'Zoom in', () => {
      this.#setZoom(this.#zoom * ZOOM_STEP);
    });
    zoomIn.textContent = '+';

    // The level readout carries an aria-label ("Reset zoom (currently 2.3×)"),
    // so its accessible name — not its text — is what a screen reader reads, and
    // a silent relabel is not an announcement. This off-screen live region is
    // what actually reports the new level. Seeded before insertion so mounting
    // the widget doesn't announce anything.
    const status = document.createElement('span');
    status.className = 'zoom-status';
    status.setAttribute('aria-live', 'polite');
    status.textContent = this.#zoomLabel();

    group.append(zoomOut, level, zoomIn, status);
    this.#zoomControls = { zoomOut, level, zoomIn, status };
    return group;
  }

  #zoomLabel(): string {
    return `${this.#zoom.toFixed(1)}×`;
  }

  #syncZoomControls(): void {
    const controls = this.#zoomControls;
    if (controls === null) return;
    const label = this.#zoomLabel();
    controls.level.textContent = label;
    controls.level.setAttribute('aria-label', `Reset zoom (currently ${label})`);
    controls.level.disabled = this.#zoom === DEFAULT_ZOOM;
    controls.zoomOut.disabled = this.#zoom <= this.#minZoom;
    controls.zoomIn.disabled = this.#zoom >= MAX_ZOOM;
    // Guarded: re-writing identical text still mutates the live region, and some
    // screen readers announce that as a fresh change.
    const spoken = `Zoom ${label}`;
    if (controls.status.textContent !== spoken) controls.status.textContent = spoken;
  }

  #handleWheel(event: WheelEvent): void {
    // Only the zoom gesture is intercepted. A plain wheel keeps scrolling the
    // host page: an embed that swallows the page's scroll is a scroll trap.
    if (!event.ctrlKey && !event.metaKey) return;
    if (this.#renderedOrientation !== 'horizontal' || !this.#zoomEnabled()) return;
    event.preventDefault();
    this.#setZoom(
      this.#zoom * Math.exp(-wheelDeltaPx(event) * WHEEL_ZOOM_RATE),
      event.clientX,
      true,
    );
  }

  /** `+` / `-` / `0` on the plot. Returns true when the key was consumed. */
  #handleZoomKeydown(event: KeyboardEvent): boolean {
    // With a modifier these belong to the browser (page zoom); Shift is fair
    // game because `+` needs it on most layouts.
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (this.#renderedOrientation !== 'horizontal' || !this.#zoomEnabled()) return false;
    // An open card is a reading state, and re-drawing the plot would tear it
    // down (its position is derived from a marker that is about to move). Arrow
    // keys already leave it open, so a bare keystroke should not destroy it —
    // Escape closes it. The pointer gestures still zoom: those aim at the plot.
    if (this.#openEventId !== null) return false;

    let next: number;
    if (event.key === '+' || event.key === '=') next = this.#zoom * ZOOM_STEP;
    else if (event.key === '-' || event.key === '_') next = this.#zoom / ZOOM_STEP;
    else if (event.key === '0') next = DEFAULT_ZOOM;
    else return false;

    event.preventDefault();
    this.#setZoom(next);
    return true;
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

  /**
   * First marker is the single tab stop; arrow keys move focus from there.
   * `focusIndex` re-homes focus after a zoom re-render replaced the focused
   * marker with a fresh node — otherwise keyboard zooming drops to the body.
   */
  #applyRovingTabindex(focusIndex = -1): void {
    const markers = this.#markers();
    const active = focusIndex >= 0 && focusIndex < markers.length ? focusIndex : 0;
    markers.forEach((marker, index) => {
      marker.tabIndex = index === active ? 0 : -1;
    });
    // preventScroll: #setZoom restores the scroll position itself, from the
    // zoom anchor rather than from whichever marker happened to hold focus.
    if (focusIndex >= 0) markers[active]?.focus({ preventScroll: true });
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
