# timarro

[![npm](https://img.shields.io/npm/v/timarro)](https://www.npmjs.com/package/timarro)
[![bundle](https://img.shields.io/badge/bundle-%E2%89%A4%2025%20kB-brightgreen)](https://www.npmjs.com/package/timarro)
[![license](https://img.shields.io/npm/l/timarro)](./LICENSE)

Framework-agnostic web component for historical timelines: **`<timarro-timeline>`**.

Drop in JSON. Get a keyboard-accessible, precision-aware timeline that works in any stack — plain HTML, Next.js, Vue, a CMS embed.

![A Leonardo da Vinci timeline: a cover portrait floated beside the title and description, then exact dates as dots, a month as a ring, approximate years as diamonds with a ~ prefix, multi-year periods as labeled bars with uncertainty bands behind them, a per-event colour accent, a calendar axis, a precision legend, and a zoom control](./docs/screenshot.png)

<sub>Cover art in the screenshot: Leonardo’s presumed self-portrait (red chalk, c. 1512) — public domain, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Leonardo_da_Vinci_-_presumed_self-portrait_-_WGA12798.jpg).</sub>

The open rendering layer of [timarro.com](https://timarro.com) — create, share, and embed visual timelines. Rendered timelines carry a small “Powered by Timarro” attribution.

---

## Why Timarro

- **Data in, timeline out** — consumes a JSON document of events. Where the data comes from is not the engine’s business.
- **Fuzzy dates are first-class** — year, month, day, and datetime precision render as distinct markers (diamonds, rings, dots), with uncertainty bands, gradient-faded range endpoints, and optional `circa`.
- **Labels that stay readable** — point events stack a short title and date above the marker; click the title to expand the full text. Ranges keep full titles on the bar.
- **Ranges that stack** — multi-day (or longer) spans draw as labeled bars with translucent bands behind the events they cover; overlapping ranges darken where they stack.
- **Zoom that adds detail instead of cropping** — zooming widens the canvas rather than narrowing the date range, so events never drop out of view; the axis refines decade → year → month → day on the way in.
- **Zero runtime deps in the embed** — vanilla TypeScript [custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components); ≤ 25 kB minified. An optional Zod schema ships on a separate subpath.
- **Responsive by container** — horizontal lanes when wide; a vertical rail under 800px of _container_ width (not viewport). Or pin either mode.
- **Accessible** — arrow / Home / End across events, Enter or Space opens details, Esc closes and returns focus, `+` / `-` / `0` zoom; ARIA throughout; `prefers-reduced-motion` respected.

---

## Install

```bash
npm install timarro
# or: pnpm add timarro · yarn add timarro · bun add timarro
```

### Package surface

| Entry              | Use for                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `timarro`          | `define()`, `TimarroTimeline`, `validateTimelineData`, TypeScript types |
| `timarro/register` | side-effect registration of `<timarro-timeline>`                        |
| `timarro/schema`   | canonical Zod schemas + shared enum literals (pulls in `zod`)           |

The element bundle stays dependency-free. Import `timarro/schema` only from tooling, servers, or the platform — never from code that must ship in the CDN embed.

### Bundler

```ts
import { define } from 'timarro';

define(); // registers <timarro-timeline>
// define('my-timeline'); // optional custom tag name
```

```html
<timarro-timeline src="/data/apollo.json"></timarro-timeline>
```

Or import the side-effect entry:

```ts
import 'timarro/register';
```

### CDN (self-registering)

```html
<script src="https://unpkg.com/timarro"></script>
<timarro-timeline src="/data/apollo.json"></timarro-timeline>
```

Also available on [jsDelivr](https://www.jsdelivr.com/package/npm/timarro). The IIFE exposes `window.Timarro`.

### Programmatic data

```ts
const el = document.querySelector('timarro-timeline');
el.data = {
  timeline: { id: 'tl-apollo', title: 'Apollo program' },
  events: [
    {
      id: 'ev-first-step',
      title: 'First step on the Moon',
      date: { start: '1969-07-21T02:56:15Z', precision: 'datetime' },
    },
  ],
};
```

Setting `data` aborts any in-flight `src` fetch — the property wins.

### Next.js

Custom elements don’t SSR. Define client-side; the validator and types remain importable from Node:

```tsx
'use client';

import { useEffect } from 'react';

export default function Timeline() {
  useEffect(() => {
    void import('timarro').then((m) => m.define());
  }, []);

  return <timarro-timeline src="/fixtures/apollo.json" />;
}
```

```ts
// Server-safe — no DOM required
import { validateTimelineData } from 'timarro';
```

---

## API

### Attributes

| Attribute     | Values                               | Default        | Notes                                                                |
| ------------- | ------------------------------------ | -------------- | -------------------------------------------------------------------- |
| `src`         | URL of a timeline JSON document      | —              | abort-on-change; `data` wins — see [Network access](#network-access) |
| `locale`      | BCP-47 tag (`en`, `cs`, `de-AT`, …)  | browser locale | all dates format via `Intl` in UTC                                   |
| `orientation` | `auto` \| `horizontal` \| `vertical` | `auto`         | `auto` switches to vertical when the container is < 800px            |
| `legend`      | `false` / `off` to hide              | shown          | compact key for the precision marker shapes                          |
| `zoom`        | `false` / `off` to disable           | enabled        | horizontal only — see [Zoom](#zoom)                                  |

### Properties

| Property | Type                          | Notes                                                     |
| -------- | ----------------------------- | --------------------------------------------------------- |
| `data`   | `TimarroTimelineData \| null` | set to render; reads back the last _valid_ data or `null` |

### Events

All bubble and are composed (`shadowRoot` → light DOM).

| Event            | `detail`                | Fires when                                   |
| ---------------- | ----------------------- | -------------------------------------------- |
| `timarro:load`   | `{ timeline }`          | data validated and rendered                  |
| `timarro:error`  | `{ message[, issues] }` | fetch failed or validation rejected the data |
| `timarro:select` | `{ event }`             | an event marker is activated                 |

```ts
el.addEventListener('timarro:select', (e) => {
  console.log(e.detail.event.title);
});
```

### Zoom

Zooming widens the canvas rather than narrowing the date range, so nothing ever drops out of view: the plot gains pixels per day, lanes re-pack so crowded labels separate, and the axis refines decade → year → month → day. Panning is the viewport’s own horizontal scroll.

**`1.0×` is the layout’s own default, not “everything on screen”.** Point events are held to **at most 5 stacked lanes** — if they would pack deeper, the layout widens itself until they don’t, and the timeline scrolls horizontally from the start. A twenty-deep column of labels reads as a list, not a timeline. Ranges are exempt: they pack in their own region below, where stacking stays legible.

So on a dense timeline the floor sits _below_ `1.0×`, at whatever level puts the whole domain on screen (`0.7×`, `0.4×`, …). That is the overview; `1.0×` is the readable default the reset returns to. On a timeline that was never crowded the two coincide.

| Input                                    | Effect                                                          |
| ---------------------------------------- | --------------------------------------------------------------- |
| `−` / `+` in the pill beside the legend  | one step (1.5×) out / in, around the centre of the view         |
| the level readout (`2.3×`)               | resets to the `1.0×` default                                    |
| **Ctrl** / **⌘** + wheel, trackpad pinch | zooms anchored at the cursor — the date under it stays put      |
| **+** / **-** / **0** keys               | step in / step out / default, with focus anywhere in the widget |
| **Shift** + wheel, horizontal swipe      | pans (native scroll)                                            |

The ceiling is `16×`. Plot height follows the content, so zooming in — which frees lanes as events stop colliding — shortens the plot rather than leaving a gap above the axis.

A **plain wheel is never intercepted**: it scrolls the host page, so an embed can’t become a scroll trap. Touch pinch is likewise left to the browser’s own page zoom, and below 800px the vertical rail has nothing to zoom.

Two details worth knowing: the keys are ignored while an event card is open, since redrawing the plot would close it (**Esc** first), and wheel zoom redraws at most once per frame, so during a fast gesture the readout can lead the plot by a frame.

`zoom="off"` removes the pill and the gestures and returns the plot to `1.0×` — with no controls left, there would be no way back from a zoomed-in view. The lane-budget spread is layout, not zoom, so it still applies.

### Keyboard

With focus on a marker: **← / →** (or **↑ / ↓** in vertical mode) move chronologically, **Home / End** jump to first / last, **Enter / Space** toggle the detail card, **Esc** closes it and returns focus to the marker. **+ / - / 0** zoom the horizontal plot when no card is open (see [Zoom](#zoom)).

### Theming

CSS custom properties on the host (defaults match the Timarro brand — vermilion accent, warm ink/paper neutrals):

| Token                    | Role                        | Default fallback        |
| ------------------------ | --------------------------- | ----------------------- |
| `--timarro-accent`       | markers, ranges, brand link | `#d6451b`               |
| `--timarro-bg`           | host background             | transparent             |
| `--timarro-fg`           | primary text                | `#1a1714`               |
| `--timarro-muted`        | secondary text              | `#6b6459`               |
| `--timarro-border`       | rules and dividers          | `#e7e2d9`               |
| `--timarro-font`         | UI / body                   | system sans             |
| `--timarro-display-font` | title                       | Georgia / serif         |
| `--timarro-mono-font`    | dates and tick labels       | system mono             |
| `--timarro-error`        | validation / load errors    | `#b3261e`               |
| `--timarro-card-bg`      | event detail card           | `#fff`                  |
| `--timarro-card-fg`      | event detail card text      | inherits `--timarro-fg` |

Shadow parts for deeper styling:
`::part(header | cover | controls | viewport | event | axis | card | legend | brand)`.

```css
timarro-timeline {
  --timarro-accent: #d6451b;
  --timarro-display-font: 'Fraunces', Georgia, serif;
  --timarro-font: 'IBM Plex Sans', system-ui, sans-serif;
  --timarro-mono-font: 'IBM Plex Mono', ui-monospace, monospace;
}
```

**Per-event accents:** set `color` on an event (any CSS color — `#d6451b`, `rebeccapurple`, `rgb(…)`, …). It overrides `--timarro-accent` for that event’s marker, range bar, and uncertainty / overlap band. Invalid or unsafe values are ignored at render time.

---

## Data format (v1)

Shape: `{ timeline, events }`. Full types live in `timarro`; the canonical Zod schema is `timarro/schema`.

```json
{
  "timeline": {
    "id": "tl-apollo",
    "title": "Apollo program",
    "description": "Key milestones of NASA's Apollo program, 1961–1972."
  },
  "events": [
    {
      "id": "ev-apollo-11-launch",
      "title": "Apollo 11 launches from Kennedy Space Center",
      "date": { "start": "1969-07-16T13:32:00Z", "precision": "datetime" },
      "entities": ["Neil Armstrong", "Buzz Aldrin", "Michael Collins"],
      "color": "#1a5fb4"
    },
    {
      "id": "ev-apollo-8",
      "title": "Apollo 8 — first crewed lunar orbit",
      "date": { "start": "1968-12-21", "end": "1968-12-27", "precision": "day" }
    }
  ]
}
```

`timeline.coverImageUrl` floats to the right of the heading, with `timeline.description` running up its left side and continuing below it. The cover keeps its own aspect ratio (never cropped), bounded by 30% of the width _and_ 28rem of height — so a tall portrait is held back by the height cap and renders narrower than 30%. It is dropped unless the URL is http(s). On the canvas, each point event shows a shortened title with the formatted date beneath it (click the title to expand); range events keep the full title on the bar. Opening a marker shows a detail card with description, entities, http(s) media, and `sourceRef` when present.

### Fuzzy dates

| `date.start` / `date.end`              | `date.precision` | Marker                   |
| -------------------------------------- | ---------------- | ------------------------ |
| `"1943"`                               | `year`           | diamond + year-wide band |
| `"1943-05"`                            | `month`          | ring + month-wide band   |
| `"1943-05-12"`                         | `day`            | solid dot                |
| `"1943-05-12T14:30[:00][Z or ±HH:MM]"` | `datetime`       | solid dot                |

Rules:

- `precision` must match the granularity of `start` (validation error otherwise).
- `end` is optional and may use a different granularity than `start`. With `end`, the event renders as a **range** (labeled bar + overlap band) instead of a point marker.
- Date-only values are UTC calendar dates; naive datetimes are treated as UTC.
- `"circa": true` marks an approximate date (`~1943`) without widening its interval — dashed band edges, `~` prefix on the label.
- Every value resolves to a half-open interval `[earliest, latest)` — point markers sit at the midpoint; uncertainty bands span the interval; range bars include endpoint fades when an endpoint is fuzzy.
- BCE dates are rejected in v1.

Optional event fields: `description`, `entities`, `mediaUrls` (http/https only), `sourceRef`, `color`, `order`.

Optional timeline fields: `coverImageUrl` (rendered — http/https only), plus `createdBy`, `visibility` and `sourceTypes`, which the renderer ignores. Unknown extra fields are ignored by validation.

### Validation

The element validates on `data` set and surfaces issues in the UI. For programmatic checks:

```ts
import { validateTimelineData, explainDateProblem } from 'timarro';
// dependency-free; ships in the embed

import { timarroTimelineDataSchema, PRECISIONS, SOURCE_TYPES, VISIBILITIES } from 'timarro/schema';
// canonical Zod schema + shared enum literals
```

`validateTimelineData` collects **all** issues (no fail-fast). `explainDateProblem` is the shared date-semantics check used by both the embed validator and the Zod schema.

---

## Network access

Socket.dev flags this package with a [Network access](https://socket.dev/alerts/networkAccess) alert. That is correct and expected: the embed contains exactly one network call, and it is the `src` attribute.

```ts
// src/element.ts — the whole of it
const response = await fetch(src, { signal: controller.signal });
```

It runs **only** when you set `src`, and it requests **only** the URL you put there. The response is parsed as JSON and validated before anything renders. The fetch aborts when `src` changes, when the `data` property is set, or when the element leaves the document.

Beyond that, the element causes browser requests for the image URLs in **your own timeline data** — `timeline.coverImageUrl` and the first entry of an event’s `mediaUrls` — by rendering them as `<img src>`. Both pass through an http(s)-only filter first, so `javascript:`, `data:`, and malformed URLs are dropped rather than rendered.

That is the complete list. The package sends **no** telemetry, analytics, beacons, or error reports, and never contacts timarro.com or any other endpoint of its own choosing — the “Powered by Timarro” attribution is a plain text link, not a request. There is no `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `Worker`, or dynamic `import()` in the published bundle, and the stylesheet references no remote fonts or images.

**If you want zero network activity from the component,** omit `src` and assign the [`data` property](#programmatic-data) instead. Fetching is then entirely yours to do — the element never reaches the `fetch` call:

```ts
const el = document.querySelector('timarro-timeline');
el.data = await fetch('/data/apollo.json').then((r) => r.json()); // your fetch, your policy
```

To verify any of this yourself, `npm pack timarro` and grep the tarball.

---

## Development

```bash
pnpm install
pnpm demo           # vite dev server with the demo page
pnpm test           # vitest
pnpm test:coverage  # vitest + coverage gate
pnpm build          # tsdown → dist/ (ESM + CJS + types + CDN bundle)
pnpm size           # assert ≤ 25 kB CDN bundle
pnpm check:package  # publint + arethetypeswrong
```

Requires Node ≥ 24 and pnpm 10 (see `packageManager` in `package.json`).

---

## License

[MIT](./LICENSE) · [timarro.com](https://timarro.com) · [npm](https://www.npmjs.com/package/timarro)
