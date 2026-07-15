# timarro

> ⏳ **Under development.** This `0.0.x` release reserves the package name while the engine
> is being built — the API below is a preview and will change until `0.1.0`.

Framework-agnostic web component for rendering historical timelines: `<timarro-timeline>`.

- **Zero dependencies, no framework** — a vanilla-TS [custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) that works in any page or stack (plain HTML, Next.js, Vue, CMS embeds, …).
- **Data in, timeline out** — consumes a JSON document of events; where the data comes from is not the engine's business.
- **Fuzzy dates are first-class** — events with year/month precision ("1943", "May 1943", "c. 1943") render visually distinct from exact dates.

The engine is the open rendering layer of [timarro.com](https://timarro.com), a platform
for creating, sharing, and embedding timelines.

## Usage (API preview)

Via a bundler:

```ts
import { define } from 'timarro';

define(); // registers <timarro-timeline>
```

```html
<timarro-timeline src="/data/apollo.json"></timarro-timeline>
```

Or self-registering from a CDN:

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
