# Agent Pets Panel Theme Collection

[繁體中文](README.zh-TW.md)

A data-only plugin for [Agent Pets](https://github.com/Ponpon55837/agent-pets) that restyles the panel and the pet window: text, surface, accent and state colours, corner radii, font families and size, the panel background (solid colour, gradient or a packaged image) and the pet's status pill. Every theme has a light set and a dark set, and the app switches between them with your system or Agent Pets appearance setting. Some themes also let you pick your own background image.

The plugin has no code: no Worker, no permissions, no network access. Agent Pets validates every colour and file and builds the styles itself. Themes apply to every surface, including permission and risk prompts; the app only accepts a theme when every label stays readable on every surface it can appear on and danger, success, warning and info colours keep their hue.

## Themes

There are no screenshots yet; each theme is described below.

| Theme | Light | Dark | Your own image | Type |
|---|---|---|---|---|
| **Sakura** | Pink watercolour washes with cherry blossoms in the top-right corner, under a pale pink overlay | Deep plum linear gradient | Light and dark | Rounded heading stack, radii 8/14/24 |
| **Nord Frost** | Solid snow-grey with frost-blue accents | Polar-night blue-grey with a soft radial glow from the top | No | System fonts, radii 6/10/16 |
| **Matcha Paper** | Tiled cream washi-paper texture with fibres | Solid deep matcha green | No | Serif headings, 5% larger text, radii 4/8/12 |
| **Midnight Terminal** | High-contrast white paper with a dark teal accent | Near-black vertical gradient with a bright teal accent | Dark only | Monospace headings, radii 2/4/8 |
| **Dune Dusk** | Sunset sky and layered sand dunes under a warm overlay | Starlit night with a crescent moon over violet dunes | Light and dark | Avenir Next / Segoe UI headings, 2% larger text, radii 10/16/26 |

Every mode passes the full 1.12.0 contrast matrix, and every mode sets its own pet status pill colours. `npm run validate` prints each mode's background, the declared image overlay and user-image dim next to the computed minimum, and whether the pill is themed.

## Requirements

- Agent Pets **1.12.0 or later**. The catalog entry sets `"minAppVersion": "1.12.0"`, so older apps do not list the plugin; loading the folder in an older app fails with an invalid-manifest error.
- Node.js 22.18 or later, only to validate, build or sign the package (the vendored app validator is TypeScript run through Node's built-in type stripping). There are no npm dependencies.

## Install

### From the catalog

1. In Agent Pets, open **Settings → Plugins → Explore**.
2. Find **Panel Theme Collection**, choose **Install**, review the consent sheet ("Provide 5 panel themes") and choose **Agree and install**.
3. Enable the plugin on the **Installed** tab.

### From this folder (developer mode)

1. Clone this repository.
2. In Agent Pets, open **Settings → Plugins → Advanced** and turn on **Developer mode**.
3. Open **Install plugin…**, choose **Load from folder…** and select the `src/` folder (it contains `plugin.json`).
4. Review the consent sheet, install and enable the plugin. Edits in `src/` are reloaded about half a second after you save.

### Choose a theme

Once the plugin is enabled it gets its own tab in the panel, after **Sessions**, **Quota** and **History**. The tab's **Panel themes** section lists the five themes with a light and a dark preview each (including the pet status pill). The same list is in **Settings → Plugins → Panel Theme Collection → Panel themes**.

- **Use in light mode**, **Use in dark mode** or **Use for both modes** applies a theme. There is one theme per mode for the whole app, so applying one replaces the theme in use. The card in use shows **In use · Light** or **In use · Dark**.
- **Restore built-in** returns both modes to the default look.
- **Settings → General → Appearance → Panel theme** shows which theme each mode uses and has **Customize…**, **Open plugin settings** and **Restore built-in**.

For a theme that allows your own image (Sakura and Dune Dusk in both modes, Midnight Terminal in dark mode), its card shows the image controls for each mode in which it is in use: **Choose image…**, **Remove image**, **Fit**, **Position**, **Dim** and **Blur**. Agent Pets checks the image (PNG, JPEG or WebP, up to 20 MB and 8192 px per side, not animated) and stores a copy in its own data folder. The plugin never sees the image or its path; removing the plugin deletes it. **Dim** never goes below the minimum that keeps text readable.

### My themes

**Customize…** opens the theme editor. **Start from** can be any of these themes; the copy keeps its colours, gradients, radii, pet pill colours and image settings, but not the packaged background images (a My theme uses your own image). Saved copies are listed under **My themes** (in Appearance and below the theme list in the plugin's tab), are checked with the same rules, and do not change when this plugin is updated.

## Build, sign and verify

```sh
npm test                 # node:test suite for the validator, archive and signing
npm run validate         # check src/ and print each theme's contrast summary
npm run build            # unsigned archive: dist/unsigned/panel-theme-collection-<version>.agentpet-plugin
npm run verify -- [--require-signature] <archive>   # exactly one archive path; flags in any position
npm run sync-rules       # check the vendored validator against vendor.json
```

`npm run validate` runs the app's own validator and exits with an error exactly when Agent Pets would reject the package. The first line is the diagnostic the app shows in developer mode; the following lines list every other issue in the app's check order (the list the theme editor shows), for example:

```text
error: sakura.light.background.overlay.opacity: 0.5 < minimum 0.81; text 3.75:1 < 4.5:1 on black image pixel
error: nord-frost.dark.colors.dangerText: 3.97:1 < 4.5:1 on dangerText at 0.12 over surface2 (state chip)
```

#### Keeping the rules in sync with the app

`scripts/lib/rules/app/` is a byte-for-byte copy of the app's `electron/plugin-panel-themes.ts`, `panel-theme-color.ts` and `pet-sprite-validation.ts`. `scripts/lib/rules/vendor.json` pins the app commit and the SHA-256 of each file; `npm test` fails if a vendored file was edited.

```sh
npm run sync-rules -- --app <agent-pets checkout> --check        # compare with the pinned commit
npm run sync-rules -- --app <agent-pets checkout> --commit <rev>  # copy from <rev> and re-pin
AGENT_PETS_APP_DIR=<agent-pets checkout> npm test                 # also run the comparison in the tests
```

Files are read with `git show <commit>:<path>`, so uncommitted edits in the checkout are never copied.

### Signing

The publisher key is an Ed25519 private key in PKCS#8 PEM format. It must live outside this repository and outside any git work tree; the scripts refuse other paths, and `.gitignore` excludes `*.pem`, `keys/`, `signature.json`, `.env*` and `dist/`.

```sh
# once: create the key (never overwrites an existing file; mode 0600)
npm run keygen -- --out ~/.agent-pets/keys/panel-theme-collection.ed25519.pem

# every release: validate, sign and write dist/panel-theme-collection-<version>.agentpet-plugin
AGENT_PETS_SIGNING_KEY=~/.agent-pets/keys/panel-theme-collection.ed25519.pem npm run sign
# or
npm run sign -- --key ~/.agent-pets/keys/panel-theme-collection.ed25519.pem

# print the catalog index entry (size, sha256, publicKeyFingerprint, minAppVersion 1.12.0)
npm run catalog-entry -- dist/panel-theme-collection-<version>.agentpet-plugin   # exactly one archive path
```

`sign` adds `signature.json` at the archive root as described in the Agent Pets signing guide (sorted `path<TAB>sha256` lines over every other file, signed with Ed25519) and prints the archive size, SHA-256 and the key fingerprint. `src/` is not changed. Back the key up offline; if it is lost, users must confirm a new fingerprint.

Archives are deterministic: entries are sorted, stored without compression and stamped 1980-01-01, so the same `src/` always produces the same bytes.

### Publishing

1. Raise `version` in `src/plugin.json`. Published versions are never replaced.
2. `npm test && npm run sign`, then `npm run verify -- --require-signature dist/<archive>`.
3. `npm run catalog-entry -- dist/<archive>` and open a pull request in the catalog repository with the archive under `packages/` and the printed entry (with `"minAppVersion": "1.12.0"`) in `index.json`.

## Add a theme

1. Add an object to `contributes.panelThemes` in `src/plugin.json` (at most 8 themes). Use a new `id` (`a-z`, `0-9`, `-`), a `displayName` in `zh-TW` and `en-US` (up to 48 characters) and optionally a `description` (up to 120).
2. Give it both `modes.light` and `modes.dark`. Each mode needs the 10 required colours: `bg`, `surface`, `surface2`, `text`, `textSecondary`, `textMuted`, `accent`, `accentText`, `onAccent`, `border`. Optional colours fall back to the mode's built-in value (`dangerText`, `successText`, `warnText`, `infoText`, `scrim`, `shadow`, `highlight` and the `sage` family) or are derived from the required ones. `borderOnAccent` is still accepted but ignored.
   - Colours are `#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()` or in-gamut `oklch()`. No named colours, `var()`, `calc()` or `url()`.
   - Text and surface colours must be opaque. Light mode: `bg` luminance at least 0.45 and text darker than `bg`. Dark mode: `bg` luminance at most 0.12 and text lighter than `bg`.
   - State colours keep their hue (OKLCH): danger 0–50° or 340–360°, success 105–170°, warning 55–105°, info 200–290°, chroma at least 0.05, OKLab ΔE at least 0.08 between each other and 0.06 from `accent`. `shadow` needs luminance at most 0.05 and `highlight` at least 0.7.
   - Every text colour is checked on every surface it can appear on, including the 12% state chips and the pet bubble, status pill and pet-window menus (translucent `surface` over a black and a white desktop). A pale state colour on a light dark-mode `surface` is the usual failure; the validator names the pair.
3. Pick a `background` per mode: `{ "type": "solid" }` (the default), a `gradient` (`linear` with `angle`, or `radial` with `position`; 2 to 5 opaque stops), or an `image` with an `overlay` `{ color, opacity }` between 0.50 and 0.95. The validator prints the smallest overlay that keeps every text colour readable over any image pixel.
4. For a user image, add `"userImage": { "allowed": true, "overlay": { "color": …, "opacity": … } }` to a mode. The same overlay rule applies.
5. Optional per mode: `petStatus` for the pet status pill, with `background` (alpha 0.85–1) and `text` required and `border`, `textMuted`, `quotaFill`, `quotaTrack`, `quotaWarn` optional. Text must reach 4.5:1 and the quota colours 3:1 on the pill and on its track, over a black and a white desktop. The derived `quotaFill` is the mode's `accent`, which is often too light on the track; declare one.
6. Optional, shared by both modes: `typography.body` and `typography.heading` (1 to 5 family names, ending with a generic family such as `sans-serif`, `serif`, `monospace`, `system-ui`, `ui-serif`, `ui-rounded` or `ui-monospace`; list CJK families before the generic one), `typography.scale` (0.92 to 1.15, at most 2 decimals) and `shape` radii (`radiusSm` ≤ `radiusMd` ≤ `radiusLg`, at most 16/24/32).
7. Images go in `src/backgrounds/` as PNG or WebP: at most 8 MiB, 64 to 4096 px per side, 8.39 megapixels, not animated, no EXIF rotation. Fonts go in `src/fonts/` as WOFF2 (up to 1 MiB each, at most 4 faces per theme) and must be declared in the theme's `fonts` and referenced as `@id`. Only bundle OFL-licensed fonts, add their licence under `FONT-LICENSES/` and list them in `src/licenses.json` and `CREDITS.md`.
8. Run `npm run validate` until it reports no errors, then `npm test`.

The package may only contain `.json`, `.png`, `.webp` and `.woff2` files: at most 64 files and 25 MiB. Any other file in `src/`, including stray ones such as `.DS_Store`, fails validation; delete it.

`npm run assets` redraws the bundled backgrounds and icon from code (needs `cwebp` from libwebp).

## Repository layout

```text
src/                     the package root (load this folder in developer mode)
  plugin.json            manifest: workerless, contributes.panelThemes
  licenses.json          asset and font licences shipped with the package
  assets/icon.png
  backgrounds/*.webp
scripts/
  validate.mjs build.mjs sign.mjs verify.mjs catalog-entry.mjs keygen.mjs sync-rules.mjs
  assets/generate.mjs    procedural artwork
  lib/rules/app/         the app's validator, copied verbatim (pinned in lib/rules/vendor.json)
  lib/rules/             adapter over the vendored validator
  lib/                   images, package rules, ZIP, signatures
tests/                   node:test
```

## Licence

MIT, see [LICENSE](LICENSE). Asset sources are listed in [CREDITS.md](CREDITS.md).
