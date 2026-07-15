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
    const x = scale.toPx(ev.start.mid);
    const kind = ev.end ? 'range' : 'point';
    const barWidth = ev.end ? Math.max(scale.toPx(ev.end.mid) - x, MIN_RANGE_BAR_PX) : 0;
    // Estimated label width (capped; CSS ellipsizes) — avoids a measure/reflow pass.
    const labelWidth = Math.min(MAX_LABEL_PX, 24 + ev.src.title.length * 6.5);
    const left = kind === 'point' ? x - 6 : x;
    const contentWidth = (kind === 'point' ? 12 : barWidth) + 6 + labelWidth;
    return { ev, kind, x, barWidth, left, extent: [left, left + contentWidth], lane: 0 };
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
