/**
 * One stylesheet for the whole shadow tree. Uses a shared constructable stylesheet
 * when available; falls back to a persistent <style> element (the element renders
 * into a separate container so re-renders never wipe the fallback).
 *
 * Theming: --timarro-accent / --timarro-bg / --timarro-fg / --timarro-font /
 * --timarro-error / --timarro-card-bg / --timarro-card-fg.
 * Parts: header | viewport | event | axis | card | brand.
 */

const CSS = /* css */ `
  :host {
    display: block;
    font-family: var(--timarro-font, system-ui, sans-serif);
    color: var(--timarro-fg, inherit);
    background: var(--timarro-bg, transparent);
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
  .header {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .viewport {
    position: relative;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .viewport--vertical {
    overflow: visible;
  }
  .canvas {
    position: relative;
  }

  /* Vertical (rail) layout — markers on a left rail, cards to the right. */
  .vlist {
    position: relative;
    padding: 2px 0;
  }
  .vlist::before {
    content: '';
    position: absolute;
    left: 5px;
    top: 12px;
    bottom: 12px;
    width: 2px;
    background: color-mix(in srgb, var(--timarro-accent, #2563eb) 30%, transparent);
  }
  .vevent {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 6px 0;
  }
  .vevent .marker {
    position: relative;
    z-index: 1;
    margin-top: 3px;
  }
  .marker--vrange {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }
  .vbody {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .vbody .label {
    white-space: normal;
    max-width: none;
    overflow: visible;
  }
  .vdate {
    font-size: 11px;
    opacity: 0.65;
  }

  .event {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
  }
  .marker {
    appearance: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    flex: none;
    background: var(--timarro-accent, #2563eb);
  }
  .marker--point {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .marker--range {
    height: 10px;
    border-radius: 5px;
  }
  .marker:focus-visible {
    outline: 2px solid var(--timarro-accent, #2563eb);
    outline-offset: 2px;
  }
  .label {
    font-size: 12.5px;
    line-height: 1.2;
    white-space: nowrap;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .axis {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 30px;
    border-top: 1px solid color-mix(in srgb, currentColor 25%, transparent);
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
    background: currentColor;
    opacity: 0.45;
  }
  .tick--minor .tick-line {
    height: 4px;
    opacity: 0.2;
  }
  .tick-label {
    position: absolute;
    top: 10px;
    transform: translateX(-50%);
    font-size: 11px;
    opacity: 0.65;
    white-space: nowrap;
  }

  .popover {
    position: absolute;
    z-index: 10;
    width: 280px;
    background: var(--timarro-card-bg, #fff);
    color: var(--timarro-card-fg, #111827);
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
    padding: 12px 14px;
  }
  .popover-title {
    margin: 0 24px 2px 0;
    font-size: 14px;
  }
  .popover-date {
    margin: 0 0 8px;
    font-size: 12px;
    opacity: 0.7;
  }
  .popover-desc {
    margin: 0 0 8px;
    font-size: 12.5px;
    line-height: 1.45;
  }
  .popover img {
    display: block;
    max-width: 100%;
    border-radius: 6px;
    margin: 0 0 8px;
  }
  .entities {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0 0 8px;
    padding: 0;
    list-style: none;
  }
  .entities li {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--timarro-accent, #2563eb) 12%, transparent);
  }
  .popover-media,
  .popover-source {
    margin: 0 0 4px;
    font-size: 11px;
    opacity: 0.7;
    word-break: break-all;
  }
  .popover-close {
    position: absolute;
    top: 6px;
    right: 6px;
    appearance: none;
    border: 0;
    background: transparent;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 4px;
    color: inherit;
    opacity: 0.55;
  }
  .popover-close:hover,
  .popover-close:focus-visible {
    opacity: 1;
  }

  .brand {
    display: flex;
    justify-content: flex-end;
    margin-top: 2px;
  }
  .brand a {
    font-size: 10.5px;
    opacity: 0.6;
    color: inherit;
    text-decoration: none;
  }
  .brand a:hover,
  .brand a:focus-visible {
    opacity: 1;
    text-decoration: underline;
  }

  .box {
    border: 1px dashed var(--timarro-accent, #888);
    border-radius: 8px;
    padding: 1rem;
  }
  .box--error {
    border-color: var(--timarro-error, #b3261e);
  }
  .issues {
    margin: 0.5rem 0 0;
    padding-left: 1.25rem;
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
