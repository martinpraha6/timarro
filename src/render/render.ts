import { assignLanes } from '../layout/lanes';
import { createTimeScale } from '../layout/scale';
import type { NormalizedTimeline, ResolvedEvent } from '../model/normalize';
import { renderAxis } from './axis';
import {
  AXIS_HEIGHT,
  CANVAS_TOP_PAD,
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
  onSelect(ev: ResolvedEvent, anchor: HTMLElement): void;
}

const MAX_LABEL_PX = 180;
const MIN_RANGE_BAR_PX = 12;

/** Year/month precision spans a visible uncertainty interval; day/datetime doesn't. */
function isFuzzyPrecision(precision: string): boolean {
  return precision === 'year' || precision === 'month';
}

/**
 * Builds the horizontal timeline into `viewport` (cleared first): an absolutely
 * positioned canvas with lane-packed point events on top, ranges as full-height
 * translucent bands behind them (labeled bars packed into a region below), and a
 * calendar axis. The canvas may be wider than the viewport — horizontal overflow
 * scrolls natively (no zoom in v1).
 */
export function renderTimeline(
  viewport: HTMLElement,
  normalized: NormalizedTimeline,
  viewportWidth: number,
  ctx: RenderContext,
): void {
  viewport.replaceChildren();
  if (normalized.domain === null) return;

  const scale = createTimeScale(normalized.domain, viewportWidth);

  const positioned = normalized.events.map((ev): PositionedEvent => {
    const kind = ev.end ? 'range' : 'point';
    const color = safeCssColor(ev.src.color) ?? undefined;
    // Estimated label width (capped; CSS ellipsizes) — avoids a measure/reflow pass.
    const labelWidth = Math.min(MAX_LABEL_PX, 24 + ev.src.title.length * 6.5);

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
      const contentWidth = barWidth + 6 + labelWidth;
      return {
        ev,
        kind,
        x: barStart,
        barWidth,
        left: barStart,
        top: 0,
        fadeLeft,
        fadeRight,
        extent: [barStart, barStart + contentWidth],
        lane: 0,
        color,
      };
    }

    const x = scale.toPx(ev.start.mid);
    const left = x - 6;
    const band: [number, number] | undefined = isFuzzyPrecision(ev.startParts.precision)
      ? [scale.toPx(ev.start.earliest), scale.toPx(ev.start.latest)]
      : undefined;
    const contentWidth = 12 + 6 + labelWidth;
    // The uncertainty band counts toward the packing extent so same-lane
    // neighbours don't sit on top of it.
    const extent: [number, number] = [
      Math.min(left, band ? band[0] : left),
      Math.max(left + contentWidth, band ? band[1] : 0),
    ];
    return { ev, kind, x, barWidth: 0, left, top: 0, band, extent, lane: 0, color };
  });

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

  // Ranges stack by temporal overlap (bar span, not label), so overlapping
  // ranges land on separate lanes — and thus get different band heights.
  const rangeLanes = assignLanes(
    rangeIdx.map((i) => [positioned[i]!.x, positioned[i]!.x + positioned[i]!.barWidth] as const),
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
}
