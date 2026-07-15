import type { TimeScale } from '../layout/scale';
import { formatTickLabel } from './format';

const MIN_LABEL_SPACING_PX = 56;

export function renderAxis(scale: TimeScale, locale?: string): HTMLElement {
  const axis = document.createElement('div');
  axis.className = 'axis';
  axis.setAttribute('part', 'axis');
  axis.setAttribute('aria-hidden', 'true');

  const ticks = scale.ticks();
  const majors = ticks.filter((tick) => tick.level === 'major');
  const majorGap =
    majors.length > 1 ? scale.toPx(majors[1]!.t) - scale.toPx(majors[0]!.t) : Infinity;
  const labelStep = Math.max(1, Math.ceil(MIN_LABEL_SPACING_PX / majorGap));

  let majorIndex = 0;
  for (const tick of ticks) {
    const el = document.createElement('div');
    el.className = tick.level === 'major' ? 'tick tick--major' : 'tick tick--minor';
    el.style.left = `${scale.toPx(tick.t)}px`;

    const line = document.createElement('div');
    line.className = 'tick-line';
    el.append(line);

    if (tick.level === 'major') {
      if (majorIndex % labelStep === 0) {
        const label = document.createElement('span');
        label.className = 'tick-label';
        label.textContent = formatTickLabel(tick.t, scale.unit, locale);
        el.append(label);
      }
      majorIndex += 1;
    }
    axis.append(el);
  }
  return axis;
}
