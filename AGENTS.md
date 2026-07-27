# AGENTS.md

## Cursor Cloud specific instructions

`timarro` is a single npm library (no backend/database). It ships the `<timarro-timeline>`
web component plus an interactive Vite demo under `demo/`. All scripts live in
`package.json`; the CI pipeline is `.github/workflows/ci.yml`.

### Runtime / toolchain (non-obvious)

- Requires **Node 24** (`.nvmrc` = `24`, `engines.node >= 24`) and **pnpm 10.34.5**
  (`packageManager` field, provisioned via `corepack`).
- The VM's baseline `node` (`/exec-daemon/node`) is v22. Node 24 is provided through
  `nvm` (default alias set to 24), so **login shells** resolve Node 24 automatically.
  A clean non-login shell (`env -i bash -c ...`) will not have `node` on PATH — run
  commands in a normal/login shell. The update script (`corepack enable` +
  `pnpm install --frozen-lockfile`) relies on this.

### Running the app + tests (see `package.json` scripts)

- Demo app: `pnpm demo` → Vite dev server at http://localhost:5173 serving `demo/`
  with local JSON fixtures in `demo/data/`. This is the runnable application.
- Unit tests: `pnpm test` (Vitest + happy-dom, no server needed).
- E2E: `pnpm test:e2e` (Playwright auto-starts the Vite demo via `playwright.config.ts`).
  Requires the Chromium browser build; if missing run
  `pnpm exec playwright install chromium --with-deps` (browsers cache under
  `~/.cache/ms-playwright` and persist in the snapshot).
- Build/size: `pnpm build` (tsdown), `pnpm size`, `pnpm check:bundle`.

### Known gotchas

- `pnpm lint` runs `eslint . && prettier --check .` over the **whole repo**, including
  Markdown. Prettier formatting failures (e.g. an unformatted `README.md`/`AGENTS.md`)
  fail CI even though ESLint passes — run `pnpm format` (`prettier --write .`) before
  committing.
- `pnpm install` prints an "Ignored build scripts: esbuild" warning. It is harmless —
  esbuild resolves its binary from the platform `@esbuild/*` optional dependency, and
  build/test/demo all work.
