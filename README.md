# timarro

Framework-agnostic web component for rendering historical timelines: `<timarro-timeline>`.

![Timeline with precision-distinct markers: dots for exact dates, rings for months, diamonds for years, uncertainty bands, and a legend](./docs/screenshot.png)

- **Zero dependencies, no framework** — a vanilla-TS [custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) that works in any page or stack (plain HTML, Next.js, Vue, CMS embeds, …).
- **Data in, timeline out** — consumes a JSON document of events; where the data comes from is not the engine's business.
- **Fuzzy dates are first-class** — events with year/month precision ("1943", "May 1943", "~1943") render visually distinct from exact dates: rings and diamonds instead of dots, uncertainty bands, gradient-faded range endpoints.
- **Responsive** — horizontal lanes in wide containers, a vertical rail under 800px of _container_ (not viewport) width; or pin either mode.
- **Accessible** — full keyboard navigation (arrows/Home/End across events, Enter opens details, Esc closes), ARIA throughout, `prefers-reduced-motion` respected.

The engine is the open rendering layer of [timarro.com](https://timarro.com), a platform
for creating, sharing, and embedding timelines. Rendered timelines carry a small
"Powered by Timarro" link.

## Install

Via a bundler:

```ts
import { define } from 'timarro';

define(); // registers <timarro-timeline>
```

```html
<timarro-timeline src="/data/apollo.json"></timarro-timeline>
```

Plain HTML, self-registering from a CDN:

```html
<script src="https://unpkg.com/timarro"></script>
<timarro-timeline src="/data/apollo.json"></timarro-timeline>
```

Or set data programmatically:

```ts
document.querySelector('timarro-timeline').data = {
  timeline: { id: '…', title: 'Apollo program' },
  events: [/* … */],
};
```

Next.js (custom elements don't SSR — define client-side):

```tsx
'use client';
import { useEffect } from 'react';

export default function Timeline() {
  useEffect(() => {
    import('timarro').then((m) => m.define());
  }, []);
  return <timarro-timeline src="/fixtures/apollo.json" />;
}
```

## API

### Attributes

| Attribute     | Values                               | Default        | Notes                                                     |
| ------------- | ------------------------------------ | -------------- | --------------------------------------------------------- |
| `src`         | URL of a timeline JSON document      | —              | fetched with abort-on-change; the `data` property wins    |
| `locale`      | BCP-47 tag (`en`, `cs`, `de-AT`, …)  | browser locale | all dates format via `Intl` in UTC                        |
| `orientation` | `auto` \| `horizontal` \| `vertical` | `auto`         | `auto` switches to vertical when the container is < 800px |
| `legend`      | `false` / `off` to hide              | shown          | compact key for the precision marker shapes               |

### Properties

| Property | Type                          | Notes                                                     |
| -------- | ----------------------------- | --------------------------------------------------------- |
| `data`   | `TimarroTimelineData \| null` | set to render; reads back the last _valid_ data or `null` |

### Events (bubbling, composed)

| Event            | `detail`                | Fires when                                   |
| ---------------- | ----------------------- | -------------------------------------------- |
| `timarro:load`   | `{ timeline }`          | data validated and rendered                  |
| `timarro:error`  | `{ message[, issues] }` | fetch failed or validation rejected the data |
| `timarro:select` | `{ event }`             | an event marker is activated                 |

### Theming

CSS custom properties: `--timarro-accent`, `--timarro-bg`, `--timarro-fg`,
`--timarro-font`, `--timarro-error`, `--timarro-card-bg`, `--timarro-card-fg`.

Shadow parts for deeper styling: `::part(header | viewport | event | axis | card | legend | brand)`.

```css
timarro-timeline {
  --timarro-accent: #9333ea;
  --timarro-font: 'Iowan Old Style', serif;
}
```

## Data format (v1)

The element consumes `{ timeline, events }` (full types in `timarro`, canonical Zod
schema in `timarro/schema`). Event dates use a fuzzy-date grammar:

| `date.start` / `date.end`              | `date.precision` | Rendered as                |
| -------------------------------------- | ---------------- | -------------------------- |
| `"1943"`                               | `year`           | year-wide uncertainty band |
| `"1943-05"`                            | `month`          | month-wide band            |
| `"1943-05-12"`                         | `day`            | exact marker               |
| `"1943-05-12T14:30[:00][Z or ±HH:MM]"` | `datetime`       | exact marker               |

Rules:

- `precision` must match the granularity of `start` (validation error otherwise).
- `end` is optional and may use a different granularity than `start`.
- Date-only values are UTC calendar dates; naive datetimes are treated as UTC.
- `"circa": true` marks an approximate date ("~1943") without widening its interval.
- Every value resolves to a half-open interval `[earliest, latest)` — markers sit at the
  midpoint, uncertainty bands span the interval.
- BCE dates are rejected in v1.

Validation: the element validates on `data` set and renders the issues. Programmatic use:

```ts
import { validateTimelineData } from 'timarro'; // dependency-free, ships in the embed
import { timarroTimelineDataSchema } from 'timarro/schema'; // canonical Zod schema
```

## Development

```sh
pnpm install
pnpm demo   # vite dev server with the demo page
pnpm test   # vitest
pnpm build  # tsup → dist/ (ESM + CJS + types + CDN bundle)
```

## License

[MIT](./LICENSE)
