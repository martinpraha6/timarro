import { assignLanes } from '../layout/lanes';
import { createTimeScale, type TimeScale } from '../layout/scale';
import type { NormalizedTimeline, ResolvedEvent } from '../model/normalize';
import { renderAxis } from './axis';
import {
  AXIS_HEIGHT,
  CANVAS_TOP_PAD,
  estimateLabelWidth,
  LANE_HEIGHT,
  RANGE_LANE_HEIGHT,
  RANGE_ROW_HEIGHT,
  RANGES_TOP_GAP,
  renderEvent,
  renderRangeBand,
  safeCssColor,
  type PositionedEvent,
} from './event-card';

export type { PositionedEvent } from './event-card';

export interface RenderContext {
  locale?: string | undefined;
  onSelect: (ev: ResolvedEvent, anchor: HTMLElement) => void;
}

const MIN_RANGE_BAR_PX = 12;

/**
 * Point events stack no deeper than this at the default zoom. A stack much taller
 * than this stops reading as a timeline and starts reading as a list — past it the
 * canvas is widened instead, trading vertical crowding for horizontal scrolling.
 * Ranges are exempt: they pack in their own region below, and a busy range stack
 * is legible in a way a deep column of point labels is not.
 */
const MAX_POINT_LANES = 5;
/** Ceiling on that auto-spread, as a multiple of the viewport width. */
const MAX_SPREAD_FACTOR = 12;
/** Geometric step while searching for a width inside the lane budget. */
const SPREAD_STEP = 1.4;

/** Year/month precision spans a visible uncertainty interval; day/datetime doesn't. */
function isFuzzyPrecision(precision: string): boolean {
  return precision === 'year' || precision === 'month';
}

/**
 * The canvas width at zoom 1: the smallest width at or above `viewportWidth` that
 * packs point events into at most {@link MAX_POINT_LANES} lanes, giving up at
 * {@link MAX_SPREAD_FACTOR}×. It exceeds the viewport when the spread kicked in,
 * which is what makes zoom 1 mean "readable" rather than "everything visible".
 *
 * Label widths are fixed px while positions scale with the canvas, so widening
 * always separates events that collided — the search only has to find how much.
 * It starts at the viewport and steps up, so the common case (a timeline that was
 * never crowded) settles on the first try.
 *
 * Depends only on the data and the viewport width, never on zoom, and costs up to
 * {@link MAX_SPREAD_FACTOR}-worth of trial layouts of every event. Callers that
 * re-draw at many zoom levels should measure once and hand the result to
 * {@link renderTimeline} rather than let it re-measure per draw.
 */
export function measureBaseWidth(normalized: NormalizedTimeline, viewportWidth: number): number {
  const domain = normalized.domain;
  if (domain === null) return viewportWidth;
  const maxWidth = viewportWidth * MAX_SPREAD_FACTOR;
  let width = viewportWidth;
  for (;;) {
    const scale = createTimeScale(domain, width, width / viewportWidth);
    const points = positionEvents(normalized.events, scale).filter((p) => p.kind === 'point');
    if (assignLanes(points.map((p) => p.extent)).laneCount <= MAX_POINT_LANES) return width;
    if (width >= maxWidth) return maxWidth;
    width = Math.min(width * SPREAD_STEP, maxWidth);
  }
}

/** Places every event on the canvas. Pure — no lanes assigned yet (`top` is 0). */
function positionEvents(events: NormalizedTimeline['events'], scale: TimeScale): PositionedEvent[] {
  return events.map((ev): PositionedEvent => {
    const kind = ev.end ? 'range' : 'point';
    const color = safeCssColor(ev.src.color) ?? undefined;

    if (kind === 'range' && ev.end) {
      // Bar spans the full uncertainty envelope; fuzzy endpoints fade out via a
      // gradient across their interval instead of ending in a hard cap (M5).
      const barStart = scale.toPx(ev.start.earliest);
      const barEnd = Math.max(scale.toPx(ev.end.latest), barStart + MIN_RANGE_BAR_PX);
      const barWidth = barEnd - barStart;
      const half = barWidth / 2;
      const fadeLeft = isFuzzyPrecision(ev.startParts.precision)
        ? Math.min(scale.toPx(ev.start.latest) - barStart, half)
        : 0;
      const fadeRight =
        ev.endParts && isFuzzyPrecision(ev.endParts.precision)
          ? Math.min(barEnd - scale.toPx(ev.end.earliest), half)
          : 0;
      // Label sits above the bar; packing uses the wider of bar vs label overhang.
      const labelWidth = estimateLabelWidth(ev.src.title, barWidth);
      return {
        ev,
        kind,
        x: barStart,
        barWidth,
        left: barStart,
        top: 0,
        fadeLeft,
        fadeRight,
        extent: [barStart, barStart + Math.max(barWidth, labelWidth)],
        lane: 0,
        color,
      };
    }

    const x = scale.toPx(ev.start.mid);
    // Point labels sit above the marker, left-aligned with the marker centre.
    const left = x - 6;
    const labelWidth = estimateLabelWidth(ev.src.title);
    const band: [number, number] | undefined = isFuzzyPrecision(ev.startParts.precision)
      ? [scale.toPx(ev.start.earliest), scale.toPx(ev.start.latest)]
      : undefined;
    const contentWidth = Math.max(12, labelWidth);
    // The uncertainty band counts toward the packing extent so same-lane
    // neighbours don't sit on top of it.
    const extent: [number, number] = [
      Math.min(left, band ? band[0] : left),
      Math.max(left + contentWidth, band ? band[1] : 0),
    ];
    return { ev, kind, x, barWidth: 0, left, top: 0, band, extent, lane: 0, color };
  });
}

/**
 * Builds the horizontal timeline into `viewport` (cleared first): an absolutely
 * positioned canvas with lane-packed point events on top, ranges as full-height
 * translucent bands behind them (labeled bars packed into a region below), and a
 * calendar axis. The canvas may be wider than the viewport — horizontal overflow
 * scrolls natively.
 *
 * Width is chosen in two stages. First {@link measureBaseWidth} widens the layout
 * until point events fit the {@link MAX_POINT_LANES} budget, which is what zoom 1
 * means; then `zoom` scales that. The domain never changes — zooming only buys
 * pixels per day, so packing re-runs at the new size and crowded labels spread
 * out. Pass `baseWidth` to reuse an earlier measurement; it is re-measured only
 * when omitted.
 *
 * Returns the scale, for mapping time ↔ canvas px so the caller can pin the
 * instant under the cursor while zooming.
 */
export function renderTimeline(
  viewport: HTMLElement,
  normalized: NormalizedTimeline,
  viewportWidth: number,
  ctx: RenderContext,
  zoom = 1,
  baseWidth = measureBaseWidth(normalized, viewportWidth),
): TimeScale | null {
  viewport.replaceChildren();
  if (normalized.domain === null) return null;

  const plotWidth = baseWidth * zoom;
  // Tick density follows the total stretch, not just the user's share of it.
  const scale = createTimeScale(normalized.domain, plotWidth, plotWidth / viewportWidth);
  const positioned = positionEvents(normalized.events, scale);

  // Points and ranges pack independently: points into lanes at the top, ranges
  // into their own region below. Chronological order in `positioned` is kept for
  // keyboard nav and DOM order.
  const pointIdx = positioned.flatMap((p, i) => (p.kind === 'point' ? [i] : []));
  const rangeIdx = positioned.flatMap((p, i) => (p.kind === 'range' ? [i] : []));

  const pointLanes = assignLanes(pointIdx.map((i) => positioned[i]!.extent));
  pointIdx.forEach((i, k) => {
    const p = positioned[i]!;
    p.lane = pointLanes.lanes[k] ?? 0;
    p.top = CANVAS_TOP_PAD + p.lane * LANE_HEIGHT;
  });

  // Ranges stack by label+bar extent so overhanging titles on short bars don't collide.
  const rangeLanes = assignLanes(
    rangeIdx.map((i) => positioned[i]!.extent),
    2,
  );
  const pointsHeight = pointLanes.laneCount * LANE_HEIGHT;
  const rangesTop = CANVAS_TOP_PAD + pointsHeight + (rangeLanes.laneCount > 0 ? RANGES_TOP_GAP : 0);
  rangeIdx.forEach((i, k) => {
    const p = positioned[i]!;
    p.lane = rangeLanes.lanes[k] ?? 0;
    p.top = rangesTop + p.lane * RANGE_LANE_HEIGHT;
    // Band reaches from the top of the events area down to this range's own bar;
    // deeper (more-overlapped) lanes yield taller bands. Semi-transparent fill
    // (CSS) makes overlaps darken so density reads at a glance.
    p.rangeBand = {
      left: p.x,
      width: p.barWidth,
      top: CANVAS_TOP_PAD,
      height: p.top + RANGE_ROW_HEIGHT - CANVAS_TOP_PAD,
    };
  });

  const plotBottom =
    rangeLanes.laneCount > 0
      ? rangesTop + rangeLanes.laneCount * RANGE_LANE_HEIGHT
      : CANVAS_TOP_PAD + pointsHeight;

  const canvasWidth = Math.max(
    viewportWidth,
    scale.width,
    ...positioned.map((p) => p.extent[1] + 16),
  );

  const canvas = document.createElement('div');
  canvas.className = 'canvas';
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${plotBottom + AXIS_HEIGHT}px`;

  // Background layer: range bands, painted below the events (pointer-transparent).
  const ranges = document.createElement('div');
  ranges.className = 'ranges';
  ranges.setAttribute('aria-hidden', 'true');
  for (const i of rangeIdx) {
    const band = renderRangeBand(positioned[i]!);
    if (band) ranges.append(band);
  }

  const list = document.createElement('div');
  list.className = 'events';
  list.setAttribute('role', 'list');
  for (const p of positioned) {
    list.append(renderEvent(p, ctx.locale, ctx.onSelect));
  }

  canvas.append(ranges, list, renderAxis(scale, ctx.locale));
  viewport.append(canvas);
  return scale;
}
