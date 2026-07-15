import type { TimarroTimelineData } from './schema/types';
import { validateTimelineData } from './schema/validate';

export class TimarroTimeline extends HTMLElement {
  // src / locale / orientation / legend attributes arrive with the rendering core (M3).
  static readonly observedAttributes: readonly string[] = [];

  #root: ShadowRoot;
  #data: TimarroTimelineData | null = null;
  #issues: string[] = [];

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
  }

  /** The last successfully validated data; null if unset or the last set was invalid. */
  get data(): TimarroTimelineData | null {
    return this.#data;
  }

  set data(value: TimarroTimelineData | null) {
    if (value === null) {
      this.#data = null;
      this.#issues = [];
    } else {
      const result = validateTimelineData(value);
      if (result.ok) {
        this.#data = result.data;
        this.#issues = [];
      } else {
        this.#data = null;
        this.#issues = result.issues.map((issue) => `${issue.path}: ${issue.message}`);
      }
    }
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
      .box--error {
        border-color: var(--timarro-error, #b3261e);
      }
      .issues {
        margin: 0.5rem 0 0;
        padding-left: 1.25rem;
      }
    `;

    const box = document.createElement('div');
    box.className = 'box';

    // Data strings go through textContent only — never innerHTML.
    if (this.#issues.length > 0) {
      box.classList.add('box--error');
      const head = document.createElement('div');
      const n = this.#issues.length;
      head.textContent = `timarro: invalid data (${n} issue${n === 1 ? '' : 's'})`;
      const list = document.createElement('ul');
      list.className = 'issues';
      for (const issue of this.#issues.slice(0, 3)) {
        const item = document.createElement('li');
        item.textContent = issue;
        list.append(item);
      }
      if (n > 3) {
        const item = document.createElement('li');
        item.textContent = `… and ${n - 3} more`;
        list.append(item);
      }
      box.append(head, list);
    } else if (this.#data) {
      box.textContent = `${this.#data.timeline.title} — ${this.#data.events.length} events (renderer arrives in M3)`;
    } else {
      box.textContent = 'timarro: no data';
    }

    this.#root.append(style, box);
  }
}

export function define(tagName = 'timarro-timeline'): void {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, TimarroTimeline);
  }
}
