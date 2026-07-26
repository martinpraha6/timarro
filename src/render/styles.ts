/**
 * One stylesheet for the whole shadow tree. Uses a shared constructable stylesheet
 * when available; falls back to a persistent <style> element (the element renders
 * into a separate container so re-renders never wipe the fallback).
 *
 * Theming: --timarro-accent / --timarro-bg / --timarro-fg / --timarro-muted /
 * --timarro-border / --timarro-font / --timarro-display-font /
 * --timarro-mono-font / --timarro-error / --timarro-card-bg /
 * --timarro-card-fg.
 * Parts: header | viewport | event | axis | card | brand.
 */

const CSS = /* css */ `
  :host {
    display: block;
    --timarro-accent: #d6451b;
    --timarro-muted: #6b6459;
    --_accent: var(--timarro-accent, #d6451b);
    --_fg: var(--timarro-fg, #1a1714);
    --_muted: var(--timarro-muted, #6b6459);
    --_border: var(--timarro-border, #e7e2d9);
    font-family: var(--timarro-font, ui-sans-serif, system-ui, sans-serif);
    color: var(--_fg);
    background: var(--timarro-bg, transparent);
    line-height: 1.5;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }
  :host([hidden]) {
    display: none;
  }
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  .container {
    position: relative;
  }
  .heading {
    max-width: 48rem;
    margin: 0 0 1.5rem;
  }
  .header {
    margin: 0;
    color: var(--_fg);
    font-family: var(--timarro-display-font, ui-serif, Georgia, serif);
    font-size: clamp(1.45rem, 3vw, 2.15rem);
    font-weight: 520;
    line-height: 1.08;
    letter-spacing: -0.025em;
  }
  .description {
    max-width: 42rem;
    margin: 0.65rem 0 0;
    color: var(--_muted);
    font-size: 0.925rem;
    line-height: 1.65;
  }

  .viewport {
    position: relative;
    overflow-x: auto;
    overflow-y: hidden;
    border: 1px solid var(--_border);
    border-radius: 14px;
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--_border) 55%, transparent) 1px, transparent 1px)
        0 0 / 80px 100%,
      color-mix(in srgb, var(--timarro-card-bg, #fff) 92%, transparent);
    box-shadow:
      0 1px 1px color-mix(in srgb, var(--_fg) 4%, transparent),
      0 12px 32px color-mix(in srgb, var(--_fg) 4%, transparent);
    scrollbar-color: color-mix(in srgb, var(--_muted) 35%, transparent) transparent;
  }
  .viewport--vertical {
    overflow: visible;
    background: color-mix(in srgb, var(--timarro-card-bg, #fff) 94%, transparent);
  }
  .canvas {
    position: relative;
  }

  /* Vertical (rail) layout — markers on a left rail, cards to the right. */
  .vlist {
    --_vlist-inline-pad: 1.25rem;
    position: relative;
    padding: 1.25rem var(--_vlist-inline-pad) 1rem;
  }
  .vlist::before {
    content: '';
    position: absolute;
    left: calc(var(--_vlist-inline-pad) + 6px);
    top: 2rem;
    bottom: 2rem;
    width: 1px;
    background: color-mix(in srgb, var(--_accent) 38%, var(--_border));
  }
  .vevent {
    --_accent: var(--ev-color, var(--timarro-accent, #d6451b));
    position: relative;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: flex-start;
    gap: 1rem;
    padding: 0 0 1.4rem;
  }
  .vevent:last-child {
    padding-bottom: 0;
  }
  .vevent .marker {
    position: relative;
    z-index: 1;
    margin-top: 0.35rem;
  }
  .marker--vrange {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }
  .vbody {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    padding: 0 0 1.3rem;
    border-bottom: 1px solid color-mix(in srgb, var(--_border) 72%, transparent);
  }
  .vevent:last-child .vbody {
    padding-bottom: 0;
    border-bottom: 0;
  }
  .vbody .label {
    white-space: normal;
    max-width: none;
    overflow: visible;
    color: var(--_fg);
    font-family: var(--timarro-display-font, ui-serif, Georgia, serif);
    font-size: 1.05rem;
    font-weight: 580;
    line-height: 1.28;
  }
  .vdate {
    color: var(--_accent);
    font-family: var(--timarro-mono-font, ui-monospace, monospace);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.055em;
    line-height: 1.4;
    text-transform: uppercase;
  }
  .vdesc {
    display: -webkit-box;
    max-width: 48rem;
    overflow: hidden;
    color: var(--_muted);
    font-size: 0.85rem;
    line-height: 1.55;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  /* Range bands: a background layer painted below the event markers. */
  .ranges {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }
  .rband {
    /* Resolve the per-event accent once; children/inline styles read var(--_accent). */
    --_accent: var(--ev-color, var(--timarro-accent, #d6451b));
    position: absolute;
    border-radius: 8px;
    /* Semi-transparent so overlapping bands darken — the stack reads as density. */
    background: color-mix(in srgb, var(--_accent) 8%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--_accent) 16%, transparent);
  }
  .events {
    position: absolute;
    inset: 0;
    z-index: 1;
  }

  .event {
    /* Resolve the per-event accent once; .marker / .band read var(--_accent). */
    --_accent: var(--ev-color, var(--timarro-accent, #d6451b));
    position: absolute;
    z-index: 0; /* stacking context so the band's z-index: -1 stays inside the item */
    display: flex;
    align-items: center;
    gap: 8px;
    height: 42px;
  }
  /* Range bars sit in a shorter row so stacked ranges keep a visible gap. */
  .event--range {
    height: 38px;
  }
  .marker {
    appearance: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    flex: none;
    background: var(--_accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--timarro-card-bg, #fff) 88%, transparent);
    transition:
      transform 150ms ease,
      box-shadow 150ms ease;
  }
  .marker:hover {
    transform: scale(1.14);
    box-shadow:
      0 0 0 3px var(--timarro-card-bg, #fff),
      0 0 0 5px color-mix(in srgb, var(--_accent) 22%, transparent);
  }
  .marker--point {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .marker--month {
    /* Keep the precision ring, but mask the rail/axis behind its center. */
    background: var(--timarro-card-bg, #fff);
    border: 3px solid var(--_accent);
  }
  .marker--year {
    width: 11px;
    height: 11px;
    border-radius: 2px;
    transform: rotate(45deg);
  }
  .marker--year:hover {
    transform: rotate(45deg) scale(1.14);
  }
  .marker--range {
    height: 10px;
    border-radius: 5px;
    box-shadow: none;
  }
  .marker--range:hover {
    transform: translateY(-1px);
    box-shadow: 0 3px 8px color-mix(in srgb, var(--_accent) 25%, transparent);
  }

  /* Uncertainty band behind fuzzy point markers (M5). */
  .band {
    position: absolute;
    z-index: -1;
    top: 50%;
    transform: translateY(-50%);
    height: 8px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--_accent) 18%, transparent);
  }
  .band--circa {
    border-left: 1px dashed var(--_accent);
    border-right: 1px dashed var(--_accent);
  }
  .marker:focus-visible {
    outline: 2px solid var(--_accent);
    outline-offset: 4px;
  }
  .event-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }
  .label {
    color: var(--_fg);
    font-size: 12.5px;
    font-weight: 560;
    line-height: 1.25;
    white-space: nowrap;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .event-date {
    overflow: hidden;
    color: var(--_muted);
    font-family: var(--timarro-mono-font, ui-monospace, monospace);
    font-size: 9.5px;
    letter-spacing: 0.025em;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .axis {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
    height: 42px;
    border-top: 1px solid var(--_border);
    background: color-mix(in srgb, var(--timarro-card-bg, #fff) 78%, transparent);
  }
  .tick {
    position: absolute;
    top: 0;
    bottom: 0;
  }
  .tick-line {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 7px;
    background: var(--_muted);
    opacity: 0.5;
  }
  .tick--minor .tick-line {
    height: 4px;
    opacity: 0.2;
  }
  .tick-label {
    position: absolute;
    top: 12px;
    transform: translateX(-50%);
    color: var(--_muted);
    font-family: var(--timarro-mono-font, ui-monospace, monospace);
    font-size: 9.5px;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .popover {
    position: absolute;
    z-index: 10;
    width: min(320px, calc(100% - 16px));
    background: var(--timarro-card-bg, #fff);
    color: var(--timarro-card-fg, var(--_fg));
    border: 1px solid var(--_border);
    border-radius: 14px;
    box-shadow:
      0 18px 48px color-mix(in srgb, var(--_fg) 16%, transparent),
      0 2px 8px color-mix(in srgb, var(--_fg) 7%, transparent);
    padding: 1.15rem 1.2rem 1.2rem;
  }
  .popover-title {
    margin: 0 24px 0.3rem 0;
    font-family: var(--timarro-display-font, ui-serif, Georgia, serif);
    font-size: 1.15rem;
    font-weight: 600;
    line-height: 1.25;
  }
  .popover-date {
    margin: 0 0 0.85rem;
    color: var(--_accent);
    font-family: var(--timarro-mono-font, ui-monospace, monospace);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.045em;
    text-transform: uppercase;
  }
  .popover-desc {
    margin: 0 0 0.9rem;
    color: var(--_muted);
    font-size: 0.85rem;
    line-height: 1.6;
  }
  .popover img {
    display: block;
    max-width: 100%;
    border-radius: 8px;
    margin: 0 0 0.9rem;
  }
  .entities {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0 0 0.9rem;
    padding: 0;
    list-style: none;
  }
  .entities li {
    color: var(--_muted);
    font-size: 10.5px;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid var(--_border);
    background: color-mix(in srgb, var(--_accent) 6%, transparent);
  }
  .popover-media,
  .popover-source {
    margin: 0 0 4px;
    font-size: 11px;
    color: var(--_muted);
    word-break: break-all;
  }
  .popover-close {
    position: absolute;
    top: 8px;
    right: 8px;
    appearance: none;
    border: 0;
    background: transparent;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    padding: 6px;
    color: inherit;
    opacity: 0.55;
  }
  .popover-close:hover,
  .popover-close:focus-visible {
    opacity: 1;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-top: 0.75rem;
    color: var(--_muted);
    font-size: 10.5px;
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .legend-swatch {
    flex: none;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--timarro-accent, #d6451b);
  }
  .legend-swatch--month {
    background: transparent;
    border: 3px solid var(--timarro-accent, #d6451b);
  }
  .legend-swatch--year {
    border-radius: 2px;
    transform: rotate(45deg);
  }
  .legend-tilde {
    font-weight: 700;
    line-height: 1;
  }

  .brand {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.55rem;
  }
  .brand a {
    color: var(--_muted);
    font-size: 9.5px;
    letter-spacing: 0.025em;
    text-decoration: none;
  }
  .brand a:hover,
  .brand a:focus-visible {
    opacity: 1;
    text-decoration: underline;
  }

  .box {
    color: var(--_muted);
    border: 1px dashed var(--_border);
    border-radius: 12px;
    padding: 1rem;
  }
  .box--error {
    border-color: var(--timarro-error, #b3261e);
  }
  .issues {
    margin: 0.5rem 0 0;
    padding-left: 1.25rem;
  }

  @media (max-width: 480px) {
    .heading {
      margin-bottom: 1rem;
    }
    .vlist {
      --_vlist-inline-pad: 1rem;
      padding: 1rem;
    }
    .vevent {
      gap: 0.75rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation: none !important;
      transition: none !important;
      scroll-behavior: auto !important;
    }
  }
`;

let sharedSheet: CSSStyleSheet | null = null;

export function applyStyles(root: ShadowRoot): void {
  if (
    typeof CSSStyleSheet !== 'undefined' &&
    'replaceSync' in CSSStyleSheet.prototype &&
    'adoptedStyleSheets' in root
  ) {
    if (!sharedSheet) {
      sharedSheet = new CSSStyleSheet();
      sharedSheet.replaceSync(CSS);
    }
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sharedSheet];
  } else {
    const style = document.createElement('style');
    style.textContent = CSS;
    root.append(style);
  }
}
