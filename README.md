# Agent Pets Panel Theme Collection

[繁體中文](README.zh-TW.md)

A data-only plugin for [Agent Pets](https://github.com/Ponpon55837/agent-pets) that restyles the settings/status panel: text, surface, accent and state colours, corner radii, font families and size, and the panel background (solid colour, gradient or a packaged image). Every theme has a light set and a dark set, and the panel switches between them with your system or Agent Pets appearance setting. Some themes also let you pick your own background image.

The plugin has no code: no Worker, no permissions, no network access. Agent Pets validates every colour and file and builds the styles itself. Permission prompts, the plugin install sheet and other host-protected areas always keep the built-in look.

## Themes

There are no screenshots yet; each theme is described below.

| Theme | Light | Dark | Your own image | Type |
|---|---|---|---|---|
| **Sakura** | Pink watercolour washes with cherry blossoms in the top-right corner, under a pale pink overlay | Deep plum linear gradient | Light and dark | Rounded heading stack, radii 8/14/24 |
| **Nord Frost** | Solid snow-grey with frost-blue accents | Polar-night blue-grey with a soft radial glow from the top | No | System fonts, radii 6/10/16 |
| **Matcha Paper** | Tiled cream washi-paper texture with fibres | Solid deep matcha green | No | Serif headings, 5% larger text, radii 4/8/12 |
| **Midnight Terminal** | High-contrast white paper with a dark teal accent | Near-black vertical gradient with a bright teal accent | Dark only | Monospace headings, radii 2/4/8 |
| **Dune Dusk** | Sunset sky and layered sand dunes under a warm overlay | Starlit night with a crescent moon over violet dunes | Light and dark | Avenir Next / Segoe UI headings, 2% larger text, radii 10/16/26 |

Contrast, as checked by `npm run validate` (the lowest ratio of any text pair and of any accent/UI pair, over every backdrop the mode can show, including the darkest and lightest possible image pixel under the overlay):

| Theme | Light: text / UI | Dark: text / UI |
|---|---|---|
| Sakura | 5.08 / 3.30 | 5.02 / 3.67 |
| Nord Frost | 4.78 / 3.50 | 4.94 / 5.03 |
| Matcha Paper | 4.79 / 3.33 | 6.39 / 7.43 |
| Midnight Terminal | 5.82 / 5.09 | 5.18 / 6.84 |
| Dune Dusk | 4.66 / 3.35 | 5.04 / 3.77 |

The required minimums are 4.5:1 for text and 3:1 for the accent and other UI colours.

## Requirements

- Agent Pets **1.12.0 or later**. Earlier versions do not know the `panelThemes` contribution: the catalog hides this plugin from them, and loading the folder fails with an invalid-manifest error.
- Node.js 22 or later, only to validate, build or sign the package. There are no npm dependencies.

## Install

### From the catalog

1. In Agent Pets, open **Settings → Integrations → Plugins → Explore**.
2. Find **Panel Theme Collection**, choose **Install**, review the consent sheet ("Provide 5 panel themes") and confirm.
3. Enable the plugin on the **Installed** tab.

### From this folder (developer mode)

1. Clone this repository.
2. In Agent Pets, open **Settings → Integrations → Plugins → Advanced** and turn on **Developer mode**.
3. Open the install menu, choose **Load from folder…** and select the `src/` folder (it contains `plugin.json`).
4. Review the consent sheet, install and enable the plugin. Edits in `src/` are reloaded about half a second after you save.

### Choose a theme

Open **Settings → General → Appearance → Panel theme**. Pick a theme for **Light mode** and for **Dark mode** (they can differ), check the two previews and choose **Apply**. **Restore built-in** always returns to the default look.

For themes that allow your own image, the same card shows **Choose image…** for the mode. Agent Pets opens the file dialog, checks the image (PNG, JPEG or WebP, up to 20 MiB and 8192 px per side, not animated) and stores a copy in its own data folder. You can set fit, position, dim and blur. The plugin never sees the image or its path; removing the plugin deletes it.

## Build, sign and verify

```sh
npm test                 # node:test suite for the validator, archive and signing
npm run validate         # check src/ and print each theme's contrast summary
npm run build            # unsigned archive: dist/unsigned/panel-theme-collection-<version>.agentpet-plugin
npm run verify -- <archive> [--require-signature]   # exactly one archive path
```

`npm run validate` exits with an error for any problem the app would reject, for example:

```text
error: contributes.panelThemes[sakura].modes.light.colors.textMuted: 4.05:1 < 4.5:1 on darkest image pixel
error: contributes.panelThemes[sakura].modes.light.background.overlay.opacity: 0.82 is below the minimum 0.87
```

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
2. `npm test && npm run sign`, then `npm run verify -- dist/<archive> --require-signature`.
3. `npm run catalog-entry -- dist/<archive>` and open a pull request in the catalog repository with the archive under `packages/` and the printed entry in `index.json`.

## Add a theme

1. Add an object to `contributes.panelThemes` in `src/plugin.json` (at most 8 themes). Use a new `id` (`a-z`, `0-9`, `-`), a `displayName` in `zh-TW` and `en-US` (up to 48 characters) and optionally a `description` (up to 120).
2. Give it both `modes.light` and `modes.dark`. Each mode needs the 10 required colours: `bg`, `surface`, `surface2`, `text`, `textSecondary`, `textMuted`, `accent`, `accentText`, `onAccent`, `border`. Optional colours (for example `dangerText`, `successText`, `warnText`, `sage`) fall back to the built-in values; others are derived.
   - Colours are `#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()` or in-gamut `oklch()`. No named colours, `var()`, `calc()` or `url()`.
   - Text and surface colours must be opaque. Light mode: `bg` luminance at least 0.45 and text darker than `bg`. Dark mode: `bg` luminance at most 0.12 and text lighter than `bg`.
3. Pick a `background` per mode: `{ "type": "solid" }` (the default), a `gradient` (`linear` with `angle`, or `radial` with `position`; 2 to 5 opaque stops), or an `image` with an `overlay` `{ color, opacity }` between 0.50 and 0.95. The validator prints the smallest overlay that keeps every text colour readable over any image pixel.
4. For a user image, add `"userImage": { "allowed": true, "overlay": { "color": …, "opacity": … } }` to a mode. The same overlay rule applies.
5. Optional, shared by both modes: `typography.body` and `typography.heading` (1 to 5 family names, ending with a generic family such as `sans-serif`, `serif`, `monospace`, `system-ui`, `ui-serif`, `ui-rounded` or `ui-monospace`; list CJK families before the generic one), `typography.scale` (0.92 to 1.15, at most 2 decimals) and `shape` radii (`radiusSm` ≤ `radiusMd` ≤ `radiusLg`, at most 16/24/32).
6. Images go in `src/backgrounds/` as PNG or WebP: at most 8 MiB, 64 to 4096 px per side, 8.39 megapixels, not animated, no EXIF rotation. Fonts go in `src/fonts/` as WOFF2 (up to 1 MiB each, at most 4 faces per theme) and must be declared in the theme's `fonts` and referenced as `@id`. Only bundle OFL-licensed fonts, add their licence under `FONT-LICENSES/` and list them in `src/licenses.json` and `CREDITS.md`.
7. Run `npm run validate` until it reports no errors, then `npm test`.

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
  validate.mjs build.mjs sign.mjs verify.mjs catalog-entry.mjs keygen.mjs
  assets/generate.mjs    procedural artwork
  lib/rules/             colour grammar, derivation and contrast rules
  lib/                   images, package rules, ZIP, signatures
tests/                   node:test
```

## Licence

MIT, see [LICENSE](LICENSE). Asset sources are listed in [CREDITS.md](CREDITS.md).
