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

## Development

```sh
pnpm install
pnpm demo   # vite dev server with the demo page
pnpm test   # vitest
pnpm build  # tsup → dist/ (ESM + CJS + types + CDN bundle)
```

## License

[MIT](./LICENSE)
