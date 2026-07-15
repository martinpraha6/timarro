import { assignLanes } from '../layout/lanes';
import { createTimeScale } from '../layout/scale';
import type { NormalizedTimeline, ResolvedEvent } from '../model/normalize';
import { renderAxis } from './axis';
import {
  AXIS_HEIGHT,
  CANVAS_TOP_PAD,
  LANE_HEIGHT,
  renderEvent,
  type PositionedEvent,
} from './event-card';

export type { PositionedEvent } from './event-card';

export interface RenderContext {
  locale?: string;
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
 * positioned canvas with lane-packed events and a calendar axis. The canvas may be
 * wider than the viewport — horizontal overflow scrolls natively (no zoom in v1).
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
        fadeLeft,
        fadeRight,
        extent: [barStart, barStart + contentWidth],
        lane: 0,
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
    return { ev, kind, x, barWidth: 0, left, band, extent, lane: 0 };
  });

  const { lanes, laneCount } = assignLanes(positioned.map((p) => p.extent));
  positioned.forEach((p, i) => {
    p.lane = lanes[i] ?? 0;
  });

  const canvasWidth = Math.max(
    viewportWidth,
    scale.width,
    ...positioned.map((p) => p.extent[1] + 16),
  );

  const canvas = document.createElement('div');
  canvas.className = 'canvas';
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${CANVAS_TOP_PAD + laneCount * LANE_HEIGHT + AXIS_HEIGHT}px`;

  const list = document.createElement('div');
  list.className = 'events';
  list.setAttribute('role', 'list');
  for (const p of positioned) {
    list.append(renderEvent(p, ctx.locale, ctx.onSelect));
  }

  canvas.append(list, renderAxis(scale, ctx.locale));
  viewport.append(canvas);
}
