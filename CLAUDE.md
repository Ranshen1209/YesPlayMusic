# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This is the v1.x maintenance branch of YesPlayMusic — a third-party Netease Cloud Music player built with Vue 2 + Electron. Per `README.md`, only critical bug fixes are accepted here; new features go to the 2.0 alpha line. Keep changes scoped accordingly.

## Toolchain

- **Node**: 14 or 16 (`package.json` engines). `mise.local.toml` pins `16.20.2`; `.nvmrc` has `14`. Use 16 unless reproducing a 14-only issue.
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

There is **no test suite** configured. Don't claim test coverage; verify changes by running the app.

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

`.github/workflows/build.yaml` runs the Release job on every tag push (`v*`) and on `master` push, in a matrix over `macos-latest`, `windows-latest`, and `ubuntu-22.04`. `samuelmeuli/action-electron-builder@v1.6.0` invokes `yarn run vue-cli-service electron:build` per platform; when the ref is a `v*` tag it uploads artifacts to a draft GitHub Release on the repo named in `vue.config.js` `publish.owner` (currently `Ranshen1209/YesPlayMusic` — change before forking).

Two CI quirks must be preserved:
- A "Force git to use HTTPS for github SSH URLs" step uses **three** `git config --global --add url."https://github.com/".insteadOf <ssh-form>` calls. Without `--add` the entries overwrite each other; without all three forms `discord-rich-presence`'s git dependency on `discordjs/rpc` fails to resolve on runners with no SSH key.
- No snap target. The `snap` target requires `SNAPCRAFT_STORE_CREDENTIALS`; it was removed (along with the `Install Snapcraft` step) so Linux can finish.

### Internationalization

`src/locale/` holds JSON dictionaries; `vue-i18n` is configured at app bootstrap. The default language is inferred from `navigator.language` and persisted in `settings.lang` on first run. Supported: `en`, `zh-CN`, `zh-TW`, `tr`.

### Styling

Global SCSS lives under `src/assets/css/`. Components use scoped `<style lang="scss">`. Light/Dark/Auto is driven by `settings.appearance` and `changeAppearance()` in `src/utils/common.js`, plus a `prefers-color-scheme` listener in `src/store/index.js`.

## Conventions worth knowing

- **Prettier config** (`.prettierrc`) is enforced via husky; `yarn lint` will also flag deviations.
- Comments and many identifiers are in Chinese — match the surrounding language when editing nearby code; introduce English only in genuinely new modules.
- The codebase predates `<script setup>` and Composition API. Stay with Options API + Vuex unless rewriting a whole view.
- `window.resetApp()` in `src/main.js` is a documented user-facing escape hatch; don't remove it.
