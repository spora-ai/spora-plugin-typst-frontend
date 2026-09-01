# Spora Plugin: Typst Frontend

Vue 3 admin SPA for [`spora-plugin-typst`](../spora-plugin-typst). Built and shipped as Composer type `spora-plugin-frontend`; the host SPA (`spora-frontend`) lazy-loads it via `/plugins/spora-plugin-typst-frontend/main.js`.

## What's in the box

Four tabs behind the plugin's `/apps/typst` admin slot:

| Tab | Purpose | Backend endpoints consumed |
| --- | --- | --- |
| **Fonts** | Drag-drop upload + table view of the principal's font library. Skill-shipped Inter OFL is read-only; principal uploads can be deleted. | `GET /typst/fonts`, `POST /typst/fonts`, `DELETE /typst/fonts/{name}` |
| **Examples** | `.typ` template upload + card view with inline source preview. Same skill-shipped vs principal distinction as fonts. | `GET /typst/examples`, `POST /typst/examples`, `DELETE /typst/examples/{name}` |
| **Images** | Image upload + thumbnail grid. Each row carries the canonical `/api/v1/assets/<uuid>.<ext>` URL — copyable into Typst `#image("…")` source. | `GET /typst/images`, `POST /typst/images`, `DELETE /typst/images/{id}` |
| **Playground** | Single-shot Typst editor with format selector. Calls `POST /api/v1/typst/compile` when available, with a "Backend compile endpoint not yet shipped" notice if the endpoint 404s. | `POST /typst/compile` (optional; follow-up PR) |

## Layout

```
.
├── composer.json                            # type: spora-plugin-frontend
├── frontend/                                # build output (gitignored except for the archive step)
│   ├── main.js
│   └── style.css
├── src/
│   ├── App.vue                              # entry component (single page)
│   ├── main.ts                              # IIFE bundle; exposes window.SporaAppTypst
│   ├── dev-main.ts                          # standalone `npm run dev` mount
│   ├── style.css                            # @tailwind components/utilities (no preflight — host owns the reset)
│   ├── shims.d.ts                           # PluginHostContext contract
│   ├── types.ts                             # wire shapes for the four resource kinds
│   ├── api/
│   │   ├── client.ts                        # setApi/getApi/ApiError — bridge to host's typed REST client
│   │   ├── fonts.ts
│   │   ├── examples.ts
│   │   └── images.ts
│   ├── stores/
│   │   ├── resources.ts                     # fonts + examples (tier-1 + tier-2)
│   │   └── images.ts                        # per-principal image library
│   ├── components/
│   │   ├── AlertBanner.vue
│   │   ├── FontUploader.vue
│   │   ├── FontList.vue
│   │   ├── ExampleUploader.vue
│   │   ├── ExampleList.vue
│   │   ├── ImageUploader.vue
│   │   ├── ImageList.vue
│   │   └── CompileForm.vue
│   └── pages/
│       └── TypstPage.vue                    # 4-tab page (single route)
├── scripts/
│   ├── smoke.js                             # static-analysis guard on the IIFE bundle + stylesheet scope
│   └── clean.js
├── tests/
│   ├── api/client.test.ts
│   └── stores/resources.test.ts
├── .github/workflows/ci.yml                 # lint + test + build + smoke + size-budget
└── index.html                               # `npm run dev` mount target
```

## Architectural invariants

### Plugin boundary

The bundle declares `important: '#spora-plugin-typst'` in Tailwind config — every generated utility is scoped beneath that selector so plugin classes can't leak into the host SPA or another plugin slot. The smoke check in CI asserts this guard is in place (rejects unscoped `.text-typst-*` utilities) so a future Tailwind config drift fails the build.

`corePlugins.preflight: false` — Tailwind's global reset is omitted because the host SPA owns document-level resets. The plugin's stylesheet sits inside the slot and inherits the host's cascade.

### Host contract

The bundle is mounted by `spora-frontend`'s `PluginAppPage.vue`, which passes a `PluginHostContext` to `mount()`. The context exposes `api` (typed REST client with CSRF + envelope unwrap), `pinia` (host's Pinia — we don't `setActivePinia(host.pinia)` because that would collide with the host's stores), `theme`, and `router`. The plugin installs a *local* Pinia for plugin-only state (the resource store, the image store).

`api/client.ts → setApi(...)` is called once per `mount()`. The rest of the plugin reads through `getApi()` at call-time, so the host's CSRF token / base URL / envelope unwrap is preserved without re-implementation.

### Architectural distinction from fonts/examples

Fonts and examples are plugin-private files. Images are full `media_assets` rows — the chat UI's `MediaEmbed` markdown references them via the canonical `/api/v1/assets/<uuid>.<ext>` URL, the media library's LIST endpoint sees them with the `plugin_slug='spora-plugin-typst'` filter, and the Media Archive plugin's `VersionsStrip` UI renders thumbnails when that plugin is installed. This split keeps font/example management plugin-internal while letting images participate in the operator's wider media surface.

## Quality gates

```
npm run lint      ESLint over src/, tests/, *.ts, *.vue
npm test          Vitest (8 cases, ~280ms)
npm run build     vue-tsc --noEmit + vite build → frontend/main.js + frontend/style.css
npm run smoke     Static-analysis guard on the IIFE bundle + stylesheet scope
```

The CI pipeline runs all four in sequence on every push and PR. A size-budget job fails if `main.js + style.css` exceed 200 KB pre-gzip (current build: 36.9 KB).

## Depends on

`spora-ai/spora-plugin-typst#feat/typst-images` — the backend plugin must be merged first; the frontend consumes:

- `GET /typst/fonts`, `POST /typst/fonts`, `DELETE /typst/fonts/{name}`
- `GET /typst/examples`, `POST /typst/examples`, `DELETE /typst/examples/{name}`
- `GET /typst/images`, `POST /typst/images`, `DELETE /typst/images/{id}`

The Playground tab gracefully degrades when `POST /typst/compile` is missing — that endpoint is a follow-up PR. Until it's shipped, the operator uses **Copy source** to drop the source into the chat composer for the agent to render via `typst_render`.

## Local development

```bash
npm install
npm run dev    # serves on http://localhost:5176 — needs the host SPA's plugin dev-proxy
               # (`SPORA_PLUGIN_DEV_PORTS=typst:5176 npm run dev` in spora-frontend)
```

Or stand up the host (`spora-local` or `spora-fgrassl`) with `spora-plugin-typst` installed and visit `/apps/typst` — the host lazy-loads `frontend/main.js` from the typst plugin's `public/plugins/typst/` directory.

## Releasing

1. Build the IIFE bundle: `npm run build`
2. Create a tarball: `composer archive --file=spora-plugin-typst-frontend-v0.1.0.tar.gz spora-plugin-typst-frontend` (uses the `archive.exclude` list in `composer.json`)
3. Tag + push: `git tag v0.1.0 && git push --tags`
4. Attach the tarball to the GitHub release. The `dist.url` in `composer.json` must match the uploaded asset URL.

`SporaPluginFrontendInstaller` reads `composer.json#extra.spora-plugin-slug` (must equal `'typst'` — same as `spora-plugin-typst/plugin.json#slug`) and the dist URL to know where to pull the bundle from.

## Authoring guidelines

Framework-level conventions — which classes are plugin-stable, what's framework-internal, schema versioning, deprecation policy — live in the [Spora docs → Plugin system](https://docs.spora-ai.com/reference/concepts/plugins-system). This plugin's PHP twin is the source of truth for the wire contracts the SPA talks to; any breaking change there propagates here as a `composer update` + `npm run build` cycle.
