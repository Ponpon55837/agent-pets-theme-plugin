# Credits and asset licences

Every file shipped in the package (`src/`) is listed here. No third-party
artwork, photographs or fonts are included.

| File | Source | Licence |
|---|---|---|
| `src/assets/icon.png` | Drawn by `scripts/assets/generate.ts` (procedural shapes) | MIT, see [LICENSE](LICENSE) |
| `src/backgrounds/sakura-light.webp` | Drawn by `scripts/assets/generate.ts` (seeded noise washes and petal shapes) | MIT |
| `src/backgrounds/matcha-paper.webp` | Drawn by `scripts/assets/generate.ts` (seamless value-noise paper with fibres) | MIT |
| `src/backgrounds/dune-light.webp` | Drawn by `scripts/assets/generate.ts` (gradient sky, sun, layered sine dunes) | MIT |
| `src/backgrounds/dune-dark.webp` | Drawn by `scripts/assets/generate.ts` (gradient sky, stars, moon, layered sine dunes) | MIT |
| `src/plugin.json`, `src/licenses.json` | Written for this repository | MIT |

The WebP files were encoded from the generated pixels with libwebp's `cwebp`
1.6.0 (`-q 80`/`82`, `-m 6`, `-metadata none`). libwebp is a build tool here; no
libwebp code is shipped.

## Fonts

None. Every theme uses system font stacks (for example `system-ui`,
`ui-serif`, `ui-monospace`, PingFang TC, Microsoft JhengHei), which are
installed with the operating system and are not redistributed. If a WOFF2 font
is added later it must be under the SIL Open Font License 1.1 (or a compatible
licence): add its `OFL.txt` under `FONT-LICENSES/`, an entry in
`src/licenses.json`, and a row in this file.
