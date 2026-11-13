# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project status

This is the v1.x maintenance branch of YesPlayMusic — a third-party Netease Cloud Music player built with Vue 2 + Electron. Per `README.md`, only critical bug fixes are accepted here; new features go to the 2.0 alpha line. Keep changes scoped accordingly.

## Toolchain

- **Node**: 22.12+ on the Node 22 line (`package.json` engines). `.nvmrc`, `mise.local.toml`, and CI pin `22.23.2`; Electron 43's installer requires Node 22.
- **Electron**: pinned to `43.8.7`, a supported branch that retains macOS 12 and Linux armv7l support. Windows native acrylic uses the public `setBackgroundMaterial` API on Windows 11 22H2+; never use undocumented AccentPolicy APIs or `transparent: true` for this feature.
- **Package manager**: `yarn` (a 655KB `yarn.lock` is committed; do not switch to npm).
- **Husky pre-commit** runs `npm run prettier` against `src/`. Format-on-save is expected.

## Common commands

```sh
yarn install              # installs deps; postinstall runs electron-builder install-app-deps

# Web dev
yarn serve                # vue-cli-service serve, default port 8080 (override via DEV_SERVER_PORT)
yarn build                # web production build → dist/
yarn lint                 # vue-cli-service lint (eslint + prettier)
yarn prettier             # prettier --write ./src

# Electron dev
yarn electron:serve       # launches Electron pointing at the dev server
yarn electron:build       # current platform build → dist_electron/
yarn electron:build-mac   # / -win / -linux / -all for cross-target builds
yarn electron:buildicon   # regenerate platform icons from build/icons/icon.png

# Backend API (required for any meaningful local run)
yarn netease_api:run      # runs @neteaseapireborn/api on :3000
```

The dev server proxies `^/api` → `http://localhost:3000` (see `vue.config.js`). The Electron renderer hits `VUE_APP_ELECTRON_API_URL_DEV` (default `http://127.0.0.1:10754`) instead — its main process bootstraps the API in-process via `src/electron/services.js`.

`yarn verify:windows-vibrancy` runs focused Node regression checks for native material support, accessibility fallbacks, and lifecycle cleanup. These do not replace running the app; Windows compositor appearance still needs a Windows 11 desktop for visual verification.

`node scripts/smoke-electron.js [packaged-executable]` checks startup, native modules, settings, and the isolated Last.fm callback. It uses a temporary profile and random loopback ports via `IS_TEST=true` and `YPM_TEST_API_PORT` / `YPM_TEST_RENDERER_PORT`, so it can run alongside an installed player. Release CI runs it on all three platforms. Without `IS_TEST`, the app keeps ports 10754 and 27232.

## Environment

Copy `.env.example` to `.env`. Key vars:
- `VUE_APP_NETEASE_API_URL` — API base for the web build (typically `/api` behind a proxy).
- `VUE_APP_ELECTRON_API_URL` / `..._DEV` — API base used by the Electron renderer.
- `VUE_APP_LASTFM_API_KEY` / `..._SHARED_SECRET` — Last.fm scrobble credentials (already populated with public app keys).
- `DEV_SERVER_PORT` — overrides webpack-dev-server port.

`process.env.IS_ELECTRON` is injected by `vue.config.js` via `DefinePlugin` and is the canonical web-vs-desktop branch throughout the codebase. Always guard `window.require('electron')` behind it.

## Architecture

### Build dual-target

A single Vue CLI 4 / Webpack 4 setup produces both the web bundle and the Electron app via `vue-cli-plugin-electron-builder`. `vue.config.js` is where most non-trivial config lives:

- Webpack 4 + `esbuild-loader` (`target: es2015`) is used to transpile `node_modules` so modern ESM packages don't break the legacy webpack.
- Terser's legacy MD4 disk cache is disabled for Node 22 / OpenSSL 3 compatibility. The main-process plugin already minifies, so Webpack's duplicate default minimizer is disabled there. Do not enable the legacy OpenSSL provider.
- Desktop renderer assets use `/` (the same local HTTP origin as the HTML), not cross-origin `app://` module scripts. Keep this when changing the Electron build config.
- `LimitChunkCountPlugin` caps output to 3 chunks — assume small bundle splitting; avoid introducing dynamic-import-heavy patterns expecting many chunks.
- SVGs under `src/assets/icons` are loaded via `svg-sprite-loader` (used by `<SvgIcon>`); other SVGs go through the default file loader.
- `@unblockneteasemusic/rust-napi` is declared as an electron-builder external — it's a native `.node` module loaded at runtime, not bundled.

### Audio player core (`src/utils/Player.js`)

A single class wraps `howler.js` and is the source of truth for playback state. It is instantiated **once** in `src/store/index.js` and attached as `store.state.player`, wrapped in a `Proxy` that auto-persists to localStorage and forwards state to the Electron main process on every set. Implications:

- Mutating any `_field` on the player triggers persistence + IPC. Be careful with high-frequency writes; existing code uses `excludeSaveKeys` for transient fields.
- Components access the player via `this.$store.state.player`, not via Vuex mutations. Player methods are called directly.
- Track sources can come from the Netease API, cached blobs in IndexedDB (`src/utils/db.js`), or UnblockNeteaseMusic — `Player.js` orchestrates the fallback chain.

### Layered structure

- `src/api/` — thin axios wrappers per Netease resource (`track.js`, `playlist.js`, `auth.js`, ...). All requests go through `src/utils/request.js`.
- `src/store/` — Vuex 3 store (`state.js`, `mutations.js`, `actions.js`) plus two plugins:
  - `plugins/localStorage.js` persists `settings`, `data`, and `downloads` to `localStorage` on every mutation.
  - `plugins/sendSettings.js` (Electron only) mirrors settings to the main process.
- `src/views/` — top-level routed pages; `src/router/index.js` is the single route table.
- `src/components/` — shared SFCs. `Player.vue` is the playback UI bound to the player singleton; `Navbar.vue`, `ContextMenu.vue`, `TrackList.vue` are reused everywhere.
- `src/electron/` — main-process modules: `ipcMain.js`, `menu.js`, `tray.js`, `touchBar.js` (macOS), `mpris.js` (Linux), `globalShortcut.js`, `services.js` (embedded API server), `download.js` + `metadata.js` (download pipeline with ID3/Vorbis tag writing). `background.js` (the electron-builder main entry) wires these up.
- `src/utils/platform.js` exposes `isCreateTray`, `isCreateMpris`, etc. — use these flags rather than re-checking `process.platform`.

### Download pipeline (`src/utils/download.js` ↔ `src/electron/download.js` ↔ `src/electron/metadata.js`)

Downloads only run in the Electron build. Renderer flow: fetch song URL via `getMP3` → fetch full song detail (`getTrackDetail`) plus lyric (for composer) in parallel → assemble a `meta` payload → IPC to the main-process `download:track` handler. The handler streams the audio to disk, then `metadata.writeTags` dispatches by extension to `node-id3` (MP3/ID3v2) or `metaflac-js` (FLAC/Vorbis) and embeds the album cover (axios-fetched with `Referer: music.163.com`). Tag write failure is logged but never fails the download.

Both `node-id3` and `metaflac-js` are declared in `vue.config.js` `electronBuilder.externals` so webpack does not bundle them. The download task list lives in `state.downloads.tasks` and is persisted via `plugins/localStorage.js`; on app boot, `state.js` re-hydrates and re-marks lingering `pending`/`downloading` tasks as `failed(interrupted)` so a refresh during transfer never leaves zombie rows.

The main process is bundled with the same Webpack 4 + esbuild loader chain as the renderer, but **only targets ES2015**. Do not use ES2020 features in `src/electron/*` — optional-chaining-with-bracket-access (`obj?.['key']`) silently breaks the bundle.

### CI / Release

`.github/workflows/build.yaml` runs only via `workflow_dispatch` and rejects refs that are not `v*` tags. A matrix over `macos-15-intel`, `windows-latest`, and `ubuntu-22.04` builds each platform and uploads Actions Artifacts. macOS uses an Intel host to avoid the arm64 hosted-runner capacity issue and still builds both x64 and arm64 packages. After all three succeed, one `publish-release` job downloads those CI artifacts inside GitHub Actions, verifies the complete platform/update-manifest set, and creates a single draft GitHub Release.

Two CI quirks must be preserved:
- A "Force git to use HTTPS for github SSH URLs" step uses **three** `git config --global --add url."https://github.com/".insteadOf <ssh-form>` calls. Without `--add` the entries overwrite each other; without all three forms `discord-rich-presence`'s git dependency on `discordjs/rpc` fails to resolve on runners with no SSH key.
- No snap target. The `snap` target requires `SNAPCRAFT_STORE_CREDENTIALS`; it was removed (along with the `Install Snapcraft` step) so Linux can finish.

#### Cutting a release — always let CI build and upload (use `workflow_dispatch`)

The release-upload step is gated on `release: ${{ startsWith(github.ref, 'refs/tags/v') }}` (build.yaml). Artifacts are uploaded **only when the run's ref is a `v*` tag** — a `master` push or a `workflow_dispatch` against a branch builds but uploads nothing.

To publish a version: bump `package.json` `version` to match (the tag must equal the package version or `action-electron-builder` errors), commit, create the matching `v*` tag, then **run the workflow via `workflow_dispatch` against that tag** — e.g. `gh workflow run build.yaml --ref v0.4.19`. Let GitHub's runners produce and upload every platform's artifacts.

**Do NOT shuttle build artifacts through the local machine** (download-from-CI then re-upload, or uploading a local `electron:build`). It is slow over a home uplink (an ~89 MB DMG can need ~10 min and time out), and a local build's hashes won't match the CI-generated `latest*.yml`/`.blockmap` auto-update manifests. Local `electron:build-mac` is for *smoke-testing* a build only, never for release assets.

**Prevented race:** `action-electron-builder@v1.6.0` has no cross-job release lock. Never enable its `release` input in the matrix: doing so can split assets across multiple drafts. Matrix jobs must only upload Actions Artifacts; the single dependent `publish-release` job owns Release creation. Do not repair this race by routing large CI assets through a local machine.

#### Release handoff checklist (required)

- Treat the final tag tree as the release source of truth. A commit being in `master` history does not prove its behavior survived a later rewrite; inspect the final source and run `yarn verify:customizations` before dispatching.
- When a customization requirement changes, review and update the corresponding `verify:customizations` assertion before release. A passing check that still encodes an obsolete layout or behavior is a release failure, not evidence that the current requirement survived.
- Confirm `git rev-parse <tag>^{}` is the intended commit, `package.json` version matches the tag, and the workflow is dispatched against that tag, not `master` or a feature branch.
- macOS releases are currently unsigned because the project has no distributable Developer ID identity. Keep `CSC_IDENTITY_AUTO_DISCOVERY=false` explicit in CI so a runner identity cannot silently change release behavior. If signing is enabled later, require a valid distribution identity in repository secrets and verify the CI-produced app with `codesign --verify --deep --strict` before publishing (downloading for inspection is allowed; never re-upload it).
- After CI completes, inspect the draft release for macOS, Windows, and Linux assets plus every `latest*.yml`/`.blockmap` manifest. Do not call a release complete while any matrix platform is missing.
- The public Latest release may still point to an older version while the new release is Draft. Publish the verified draft only after asset inspection; never tell users the release is current while it remains Draft.
- Do not build locally and upload replacement assets. If the source or asset set is wrong, fix the source/tag and re-dispatch CI.

### Internationalization

`src/locale/` holds JSON dictionaries; `vue-i18n` is configured at app bootstrap. The default language is inferred from `navigator.language` and persisted in `settings.lang` on first run. Supported: `en`, `zh-CN`, `zh-TW`, `tr`.

### Styling

Global SCSS lives under `src/assets/css/`. Components use scoped `<style lang="scss">`. Light/Dark/Auto is driven by `settings.appearance` and `changeAppearance()` in `src/utils/common.js`, plus a `prefers-color-scheme` listener in `src/store/index.js`.

## Conventions worth knowing

- **Prettier config** (`.prettierrc`) is enforced via husky; `yarn lint` will also flag deviations.
- Comments and many identifiers are in Chinese — match the surrounding language when editing nearby code; introduce English only in genuinely new modules.
- The codebase predates `<script setup>` and Composition API. Stay with Options API + Vuex unless rewriting a whole view.
- `window.resetApp()` in `src/main.js` is a documented user-facing escape hatch; don't remove it.
