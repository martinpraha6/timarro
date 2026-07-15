/**
 * Placeholder data shape until the real schema lands (M2: src/schema/types.ts).
 * Internal only — not exported as public API.
 */
interface DraftTimelineData {
  timeline?: { title?: string };
  events?: unknown[];
}

export class TimarroTimeline extends HTMLElement {
  // src / locale / orientation / legend attributes arrive with the rendering core (M3).
  static readonly observedAttributes: readonly string[] = [];

  #root: ShadowRoot;
  #data: DraftTimelineData | null = null;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
  }

  get data(): DraftTimelineData | null {
    return this.#data;
  }

  set data(value: DraftTimelineData | null) {
    this.#data = value;
    this.#render();
  }

  connectedCallback(): void {
    this.#render();
  }

  #render(): void {
    this.#root.replaceChildren();

    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        font-family: var(--timarro-font, system-ui, sans-serif);
      }
      .box {
        border: 1px dashed var(--timarro-accent, #888);
        border-radius: 8px;
        color: var(--timarro-fg, inherit);
        padding: 1rem;
      }
    `;

    const box = document.createElement('div');
    box.className = 'box';
    // Data strings go through textContent only — never innerHTML.
    box.textContent = this.#data
      ? `${this.#data.timeline?.title ?? 'Untitled timeline'} — ${
          this.#data.events?.length ?? 0
        } events (renderer arrives in M3)`
      : 'timarro: no data';

    this.#root.append(style, box);
  }
}

export function define(tagName = 'timarro-timeline'): void {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, TimarroTimeline);
  }
}
