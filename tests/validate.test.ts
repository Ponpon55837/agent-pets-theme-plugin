import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PanelThemeValidationError, parsePanelThemes } from '../scripts/lib/rules/app/plugin-panel-themes.ts'
import { builtinPanelThemeColors, contrastRatio, formatPanelThemeColor, parsePanelThemeColor, validatePanelThemes } from '../scripts/lib/rules/panel-themes.ts'
import { checkPackagedImage, inspectImage, type ImageInfo } from '../scripts/lib/images.ts'
import { collectFiles, validatePackage } from '../scripts/lib/package.ts'
import { SRC_DIR } from '../scripts/lib/cli.ts'
import type { PackageFiles } from '../scripts/lib/signature.ts'
import { clone, fakePng, loadManifest, minimalTheme, packageWith, themeById, tiffOrientation, type TestManifest, type TestTheme } from './helpers.ts'

const errorsOf = (themes: unknown) => validatePanelThemes(themes).errors
const expectError = (themes: unknown, pattern: RegExp) => {
  const errors = errorsOf(themes)
  assert.ok(errors.some(error => pattern.test(error)), `expected ${pattern} in:\n${errors.join('\n')}`)
}
const appVerdict = (themes: unknown) => {
  try {
    parsePanelThemes(themes)
    return null
  } catch (error) {
    assert.ok(error instanceof PanelThemeValidationError)
    return error.diagnostic
  }
}
const colorOf = (value: string) => {
  const parsed = parsePanelThemeColor(value)
  assert.ok(parsed.ok, value)
  return parsed.color
}
const builtinColors = (mode: Parameters<typeof builtinPanelThemeColors>[0]) => Object.fromEntries(Object.entries(builtinPanelThemeColors(mode)).map(([key, color]) => [key, formatPanelThemeColor(color)]))

describe('colour grammar (vendored app parser)', () => {
  it('accepts every documented form and re-emits it canonically', () => {
    const cases = {
      '#fff': 'rgb(255 255 255 / 1)',
      '#0008': 'rgb(0 0 0 / 0.533)',
      '#2A1D22': 'rgb(42 29 34 / 1)',
      'rgb(42, 29, 34)': 'rgb(42 29 34 / 1)',
      'rgba(42,29,34,.16)': 'rgb(42 29 34 / 0.16)',
      'rgb(42 29 34 / 0.16)': 'rgb(42 29 34 / 0.16)',
      'rgb(100% 0% 50% / 50%)': 'rgb(255 0 128 / 0.5)',
      'hsl(0, 100%, 50%)': 'rgb(255 0 0 / 1)',
      'hsla(120deg 100% 25% / 0.5)': 'rgb(0 128 0 / 0.5)',
      'oklch(1 0 0)': 'rgb(255 255 255 / 1)',
      'oklch(0% 0 0)': 'rgb(0 0 0 / 1)',
    }
    for (const [input, expected] of Object.entries(cases)) assert.equal(formatPanelThemeColor(colorOf(input)), expected, input)
  })

  it('rejects anything outside the grammar and out-of-gamut oklch', () => {
    const bad = [
      'red', 'transparent', 'currentcolor', 'url(x)', 'var(--a)', 'calc(1)', 'rgb(1 2 3);', 'rgb(1 2 3)}', '#fff\\', '"#fff"',
      ' #fff', '#fff ', 'RGB(1, 2, 3)', 'rgb(-1, 2, 3)', 'rgb(1e2, 2, 3)', 'rgb(256, 0, 0)', 'rgb(10%, 2, 3)', 'rgb(none 0 0)',
      'rgb(０, 0, 0)', 'rgb(0 0 0 / 1.5)', 'hsl(361, 50%, 50%)', 'hsl(10, 50, 50)', 'oklch(1.2 0 0)', 'oklch(0.5 0.5 0)',
      '#ff', '#fffff', `#${'f'.repeat(70)}`, 'rgb(1 2 3 from)', 'rgb(1\u0000 2 3)',
    ]
    for (const input of bad) assert.equal(parsePanelThemeColor(input).ok, false, input)
    assert.deepEqual(parsePanelThemeColor('oklch(0.9 0.3 140)'), { ok: false, error: 'out_of_gamut' })
  })

  it('computes WCAG contrast', () => {
    assert.equal(contrastRatio(colorOf('#000'), colorOf('#fff')).toFixed(2), '21.00')
    assert.equal(contrastRatio(colorOf('#777'), colorOf('#777')), 1)
  })
})

describe('panel theme rules (vendored app validator)', () => {
  it('passes the complete built-in light and dark palettes', () => {
    const theme = minimalTheme()
    theme.modes.light.colors = builtinColors('light')
    theme.modes.dark.colors = builtinColors('dark')
    assert.deepEqual(errorsOf([theme]), [])
  })

  it('derives accentHover by the first mix step that keeps onAccent at 4.5:1 (R1)', () => {
    const theme = minimalTheme()
    delete theme.modes.light.colors.accentHover
    assert.deepEqual(errorsOf([theme]), [])
  })

  it('ships five themes, each with light, dark and pet pill colours, that the app accepts', () => {
    const themes = loadManifest().contributes.panelThemes
    assert.deepEqual(themes.map(theme => theme.id), ['sakura', 'nord-frost', 'matcha-paper', 'midnight-terminal', 'dune-dusk'])
    for (const theme of themes) {
      assert.deepEqual(Object.keys(theme.modes).sort(), ['dark', 'light'], theme.id)
      for (const mode of Object.values(theme.modes)) assert.ok(mode.petStatus, theme.id)
    }
    assert.equal(appVerdict(themes), null)
    const result = validatePanelThemes(themes)
    assert.deepEqual(result.errors, [])
    const kinds = new Set(result.themes.flatMap(theme => Object.values(theme.modes).map(mode => mode.background)))
    assert.deepEqual([...kinds].sort(), ['gradient', 'image', 'solid'])
    assert.ok(themes.some(theme => Object.values(theme.modes).some(mode => mode.userImage?.allowed === true)))
  })

  it('starts with the app diagnostic and then lists every other issue once', () => {
    const theme = minimalTheme()
    // The Nord Frost dark set before 1.12.0's pet-overlay and state-chip checks.
    Object.assign(theme.modes.dark.colors, { bg: '#2e3440', surface: '#3b4252', surface2: '#434c5e', text: '#eceff4', textSecondary: '#d8dee9', textMuted: '#c0c8d6', accent: '#88c0d0', accentText: '#a8dfec', onAccent: '#2e3440', border: 'rgb(236 239 244 / 0.18)', sage: '#a3be8c', sageDeep: '#b4cc9f', sageDark: '#cddcbf', dangerText: '#f5b3b9', successText: '#bcd6a4', warnText: '#f0d08a' })
    const errors = errorsOf([theme])
    assert.equal(errors[0], appVerdict([theme]))
    assert.equal(new Set(errors).size, errors.length)
    for (const pattern of [
      /^test\.dark\.colors\.successText: OKLab ΔE 0\.071 to warnText < 0\.08$/,
      /^test\.dark\.colors\.infoText: OKLab ΔE 0\.053 to accent < 0\.06$/,
      /^test\.dark\.colors\.dangerText: 3\.97:1 < 4\.5:1 on dangerText at 0\.12 over surface2 \(state chip\)$/,
      /^test\.dark\.colors\.infoText: 4\.46:1 < 4\.5:1 on pet bubble over a white desktop$/,
      /^test\.dark\.colors\.dangerText: 4\.30:1 < 4\.5:1 on dangerText at 0\.12 over the pet overlay over a white desktop \(danger button hover\)$/,
    ]) assert.ok(errors.some(error => pattern.test(error)), `${pattern}:\n${errors.join('\n')}`)
  })

  it('reports failing contrast pairs with the app wording', () => {
    const pairs: Array<[string, string, RegExp]> = [
      ['text', '#d8cbb8', /light\.colors\.text: .* < 4\.5:1 on surface$/],
      ['textMuted', '#9a917f', /light\.colors\.textMuted: .* on surface2$/],
      ['accentText', '#c9935a', /light\.colors\.accentText: .* < 3:1 on surface \(focus ring\)$/],
      ['accent', '#ead9c2', /light\.colors\.accent: .* < 3:1 on surface$/],
      ['onAccent', '#d07b40', /light\.colors\.onAccent: .* on accentHover mixed 12% toward text/],
      ['dangerText', '#e08070', /light\.colors\.dangerText: .* on surface$/],
      ['successText', '#9db07b', /light\.colors\.successText: .* on bg$/],
      ['warnText', '#d0a040', /light\.colors\.warnText: .* on surface2$/],
      ['surfaceWarm', '#8c491a', /light\.colors\.accentText: .* on surfaceWarm$/],
      ['surfaceSage', '#3d472b', /light\.colors\.sageDeep: .* on surfaceSage$/],
      ['textFaint', '#e0d8cc', /light\.colors\.textFaint: .* < 3:1 on bg$/],
      ['accentHover', '#f0c0a0', /light\.colors\.onAccent: .* on accentHover$/],
    ]
    for (const [key, value, pattern] of pairs) {
      const theme = minimalTheme()
      theme.modes.light.colors[key] = value
      expectError([theme], pattern)
    }
  })

  it('checks the 1.12.0 keys: infoText, shadow, highlight and the ignored borderOnAccent', () => {
    const cases: Array<[string, string, RegExp]> = [
      ['infoText', '#2e8c5b', /light\.colors\.infoText: OKLCH hue 157° is outside 200–290°/],
      ['shadow', '#808080', /light\.colors\.shadow: luminance 0\.216 > 0\.05/],
      ['highlight', '#808080', /light\.colors\.highlight: luminance 0\.216 < 0\.7/],
      ['borderOnAccent', 'rgb(0 0 0 / 0.99)', /light\.colors\.borderOnAccent: alpha must be 0\.02-0\.95/],
    ]
    for (const [key, value, pattern] of cases) {
      const theme = minimalTheme()
      theme.modes.light.colors[key] = value
      expectError([theme], pattern)
    }
    const deprecated = minimalTheme()
    deprecated.modes.light.colors.borderOnAccent = 'rgb(255 255 255 / 0.4)'
    const result = validatePanelThemes([deprecated])
    assert.deepEqual(result.errors, [])
    assert.deepEqual(result.themes[0].modes.light?.deprecated, ['borderOnAccent'])
  })

  it('checks petStatus keys, alpha and contrast over black and white desktops', () => {
    const cases: Array<[Record<string, string>, RegExp]> = [
      [{ background: '#ffffff' }, /light\.petStatus\.text: is required/],
      [{ background: '#ffffff', text: '#201e1d', glow: '#fff' }, /light\.petStatus: unknown key/],
      [{ background: 'rgb(255 255 255 / 0.5)', text: '#201e1d' }, /light\.petStatus\.background: alpha must be 0\.85-1/],
      [{ background: '#ffffff', text: '#201e1d', quotaFill: '#eeeeee' }, /light\.petStatus\.quotaFill: .* < 3:1 on pill over a black desktop/],
      [{ background: '#ffffff', text: '#201e1d', quotaTrack: 'rgb(0 0 0 / 0.05)' }, /light\.petStatus\.quotaTrack: alpha must be 0\.1-1/],
    ]
    for (const [petStatus, pattern] of cases) {
      const theme = minimalTheme()
      theme.modes.light.petStatus = petStatus
      expectError([theme], pattern)
    }
    const theme = minimalTheme()
    // The derived quotaFill is the mode's accent, which is too light for this pill; declare one.
    theme.modes.light.petStatus = { background: 'rgb(249 244 237 / 0.92)', text: '#201e1d' }
    expectError([theme], /light\.petStatus\.quotaFill: 2\.75:1 < 3:1 on pill over a black desktop/)
    theme.modes.light.petStatus.quotaFill = '#8c491a'
    assert.deepEqual(errorsOf([theme]), [])
    assert.equal(validatePanelThemes([theme]).themes[0].modes.light?.petStatus, true)
  })

  it('enforces the mode direction rules', () => {
    const swapped = minimalTheme()
    swapped.modes.light = clone(minimalTheme().modes.dark)
    expectError([swapped], /light mode needs a light bg/)
    const grey = minimalTheme()
    grey.modes.dark.colors.bg = '#707070'
    expectError([grey], /dark mode needs a dark bg/)
  })

  it('requires opaque text and bounded alpha elsewhere', () => {
    const cases: Array<[string, string, string, RegExp]> = [
      ['light', 'text', 'rgb(32 30 29 / 0.9)', /light\.colors\.text: must be opaque/],
      ['light', 'scrim', 'rgb(0 0 0 / 0.1)', /light\.colors\.scrim: alpha must be 0\.3-0\.9/],
      ['dark', 'border', 'rgb(255 255 255 / 0.05)', /dark\.colors\.border: alpha must be 0\.08-1/],
    ]
    for (const [mode, key, value, pattern] of cases) {
      const theme = minimalTheme()
      theme.modes[mode].colors[key] = value
      expectError([theme], pattern)
    }
  })

  it('samples gradients at every stop and between stops', () => {
    const theme = minimalTheme()
    theme.modes.dark.background = { type: 'gradient', kind: 'linear', stops: [{ color: '#1f1b16', at: 0 }, { color: '#6e5a40', at: 100 }] }
    expectError([theme], /on gradient stop 1$/)
    expectError([theme], /on gradient between stops 0 and 1$/)
  })

  it('enforces the minimum overlay and the 0.50 floor', () => {
    const theme = clone(themeById(loadManifest(), 'sakura'))
    const light = theme.modes.light
    light.background!.overlay!.opacity = 0.5
    const [error] = errorsOf([theme])
    const minimum = Number(/< minimum (0\.\d\d)/.exec(error)?.[1])
    assert.ok(minimum > 0.5 && minimum <= 0.95, error)
    light.background!.overlay!.opacity = minimum
    assert.deepEqual(errorsOf([theme]), [])
    light.background!.overlay!.opacity = 0.45
    expectError([theme], /overlay\.opacity: must be a number 0\.5-0\.95/)
    light.background!.overlay!.opacity = minimum
    light.userImage!.overlay!.opacity = 0.5
    expectError([theme], /userImage\.overlay\.opacity: 0\.5 < minimum/)
  })

  it('rejects an image background when no overlay can make it legible', () => {
    const theme = minimalTheme()
    theme.modes.light.background = { type: 'image', src: 'bg.webp', overlay: { color: '#f5ead8', opacity: 0.95 } }
    expectError([theme], /no overlay up to 0\.95 passes/)
  })

  it('accepts single-mode themes', () => {
    const theme = minimalTheme()
    delete theme.modes.dark
    assert.deepEqual(errorsOf([theme]), [])
    delete theme.modes.light
    expectError([theme], /modes: needs light and\/or dark/)
  })

  it('checks family lists', () => {
    const cases: Array<[TestTheme['typography'], RegExp]> = [
      [{ body: ['Helvetica', 'Arial'] }, /last entry must be a generic family/],
      [{ body: ['@missing', 'sans-serif'] }, /names no face/],
      [{ body: ['"Arial"', 'sans-serif'] }, /is not an allowed family name/],
      [{ body: ['a', 'b', 'c', 'd', 'e', 'serif'] }, /must list 1-5 families/],
    ]
    for (const [typography, pattern] of cases) {
      const theme = minimalTheme()
      theme.typography = typography
      expectError([theme], pattern)
    }
  })

  it('rejects, never clamps, out-of-range numbers and unsafe paths', () => {
    const cases: Array<[(t: TestTheme) => void, RegExp]> = [
      [t => { t.typography = { scale: 1.2 } }, /typography\.scale/],
      [t => { t.typography = { scale: 1.005 } }, /typography\.scale: must have at most 2 decimals/],
      [t => { t.shape = { radiusSm: 17 } }, /shape\.radiusSm/],
      [t => { t.shape = { radiusSm: 12, radiusMd: 10 } }, /radiusSm <= radiusMd/],
      [t => { t.modes.dark.background = { type: 'gradient', kind: 'linear', angle: 360, stops: [{ color: '#000', at: 0 }, { color: '#111', at: 100 }] } }, /angle/],
      [t => { t.modes.dark.background = { type: 'gradient', kind: 'linear', stops: [{ color: '#000', at: 50 }, { color: '#111', at: 10 }] } }, /stops must not decrease/],
      [t => { t.modes.dark.background = { type: 'gradient', kind: 'linear', stops: [{ color: '#000', at: 0 }] } }, /needs 2-5 stops/],
      [t => { t.modes.dark.background = { type: 'gradient', kind: 'linear', stops: [{ color: '#0008', at: 0 }, { color: '#111', at: 100 }] } }, /stops\[0\]\.color: must be opaque/],
      [t => { t.modes.dark.background = { type: 'image', src: 'a.webp', blur: 30, overlay: { color: '#000', opacity: 0.9 } } }, /blur/],
      [t => { t.modes.dark.background = { type: 'image', src: 'a.webp', opacity: 0.1, overlay: { color: '#000', opacity: 0.9 } } }, /opacity: must be a number 0\.2-1/],
      [t => { t.modes.dark.background = { type: 'image', src: 'a.jpg', overlay: { color: '#000', opacity: 0.9 } } }, /src: must be a safe relative/],
      [t => { t.modes.dark.background = { type: 'image', src: '../a.webp', overlay: { color: '#000', opacity: 0.9 } } }, /src: must be a safe relative/],
      [t => { t.modes.dark.background = { type: 'image', src: 'a/./b.webp', overlay: { color: '#000', opacity: 0.9 } } }, /src: must be a safe relative/],
      [t => { t.modes.dark.userImage = { allowed: false, overlay: { color: '#000', opacity: 0.9 } } }, /allowed: must be true/],
      [t => { t.fonts = [{ id: 'a', src: 'a.ttf' }] }, /\.woff2 path/],
      [t => { t.fonts = [{ id: 'a', src: 'a.woff2', weight: 500 }] }, /weight/],
      [t => { t.fonts = [{ id: 'a', src: 'a.woff2' }, { id: 'a', src: 'b.woff2' }] }, /duplicate id, weight and style/],
    ]
    for (const [mutate, pattern] of cases) {
      const theme = minimalTheme()
      mutate(theme)
      expectError([theme], pattern)
    }
  })

  it('rejects unknown keys, bad ids and bad counts', () => {
    const cases: Array<[unknown[], RegExp]> = [
      [[Object.assign(minimalTheme(), { css: 'body{}' })], /^test: unknown key/],
      [[(t => { t.modes.light.colors.link = '#000'; return t })(minimalTheme())], /light\.colors: unknown key/],
      [[(t => { t.modes.dark.extra = true; return t })(minimalTheme())], /^test\.dark: unknown key/],
      [[minimalTheme('Bad_ID')], /id: must match/],
      [[minimalTheme('dup'), minimalTheme('dup')], /^dup: duplicate theme id/],
      [Array.from({ length: 9 }, (_, i) => minimalTheme(`t${i}`)), /1-8 themes/],
      [[], /1-8 themes/],
      [[Object.assign(minimalTheme(), { displayName: { 'en-US': 'Only English' } })], /displayName: each locale needs/],
    ]
    for (const [themes, pattern] of cases) expectError(themes, pattern)
  })
})

describe('image headers', () => {
  it('reads the packaged backgrounds', () => {
    const files = collectFiles(SRC_DIR)
    for (const [path, bytes] of files) {
      if (!path.endsWith('.webp') && !path.endsWith('.png')) continue
      const { info, problems } = checkPackagedImage(bytes, path.slice(path.lastIndexOf('.')))
      assert.deepEqual(problems, [], path)
      assert.equal(info?.animated, false)
    }
  })

  it('flags animation, rotation and size problems', () => {
    assert.equal((inspectImage(fakePng(100, 100, [['acTL', Buffer.alloc(8)]])) as ImageInfo).animated, true)
    assert.equal((inspectImage(fakePng(100, 100, [['eXIf', tiffOrientation(6)]])) as ImageInfo).orientation, 6)
    assert.match(checkPackagedImage(fakePng(5000, 100), '.png').problems.join(), /outside 64-4096/)
    assert.match(checkPackagedImage(fakePng(4000, 4000), '.png').problems.join(), /8,388,608/)
    assert.match(checkPackagedImage(fakePng(32, 100), '.png').problems.join(), /outside 64-4096/)
    assert.match(checkPackagedImage(fakePng(100, 100), '.webp').problems.join(), /extension/)
    assert.match(checkPackagedImage(Buffer.from('GIF89a........'), '.png').problems.join(), /signature/)
  })
})

describe('package rules', () => {
  it('accepts the repository package', () => {
    const result = validatePackage(collectFiles(SRC_DIR))
    assert.deepEqual(result.errors, [])
    assert.deepEqual(result.warnings, [])
  })

  it('checks referenced, unreferenced and disallowed files', () => {
    const manifest = loadManifest()
    const cases: Array<[PackageFiles, RegExp]> = [
      [packageWith(manifest, { remove: ['backgrounds/dune-dark.webp'] }), /dune-dark\.webp: referenced but missing/],
      [packageWith(manifest, { add: { 'fonts/extra.woff2': 'wOF2xxxx' } }), /extra\.woff2: font is not referenced/],
      [packageWith(manifest, { add: { 'notes.txt': 'x' } }), /notes\.txt: not allowed/],
      [packageWith(manifest, { add: { 'photo.jpg': 'x' } }), /photo\.jpg: not allowed/],
      [packageWith(manifest, { add: { 'font.ttf': 'x' } }), /font\.ttf: not allowed/],
      [packageWith(manifest, { add: { 'main.js': 'x' } }), /main\.js: not allowed/],
      [packageWith(manifest, { add: { 'signature.json': '{}' } }), /signature\.json: remove it from src/],
      [packageWith(manifest, { add: { 'backgrounds/dune-dark.webp': fakePng(100, 100) } }), /content is PNG but the extension is \.webp/],
      [packageWith(manifest, { add: { 'bad.json': '{' } }), /bad\.json: invalid UTF-8 JSON/],
    ]
    for (const [files, pattern] of cases) {
      const result = validatePackage(files)
      assert.ok(result.errors.some(error => pattern.test(error)), `${pattern}:\n${result.errors.join('\n')}`)
    }
  })

  it('checks woff2 fonts by magic and size', () => {
    const manifest = loadManifest()
    const theme = themeById(manifest, 'nord-frost')
    theme.fonts = [{ id: 'inter', src: 'fonts/inter.woff2' }]
    theme.typography!.body = ['@inter', 'system-ui', 'sans-serif']
    assert.deepEqual(validatePackage(packageWith(manifest, { add: { 'fonts/inter.woff2': 'wOF2\0\0\0\0' } })).errors, [])
    assert.match(validatePackage(packageWith(manifest, { add: { 'fonts/inter.woff2': 'wOFF\0\0\0\0' } })).errors.join(), /wOF2 signature/)
    const big = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(1024 * 1024)])
    assert.match(validatePackage(packageWith(manifest, { add: { 'fonts/inter.woff2': big } })).errors.join(), /> 1 MiB/)
  })

  it('enforces the workerless manifest root', () => {
    const cases: Array<[(m: TestManifest) => void, RegExp]> = [
      [m => { m.entry = 'dist/main.js' }, /entry: this is a workerless/],
      [m => { m.permissions = { storage: true } }, /permissions/],
      [m => { m.contributes.feed = {} }, /contributes\.feed/],
      [m => { m.homepage = 'x' }, /homepage: unknown manifest field/],
      [m => { m.version = '1.0' }, /version/],
      [m => { m.apiVersion = '2' }, /apiVersion/],
      [m => { m.id = '_host' }, /^id:/],
      [m => { m.icon = 'assets/icon.svg' }, /icon/],
    ]
    for (const [mutate, pattern] of cases) {
      const manifest = loadManifest()
      mutate(manifest)
      const result = validatePackage(packageWith(manifest))
      assert.ok(result.errors.some(error => pattern.test(error)), `${pattern}:\n${result.errors.join('\n')}`)
    }
  })

  it('enforces the file count and total size caps', () => {
    const many: Record<string, string> = {}
    for (let i = 0; i < 64; i += 1) many[`extra/${i}.json`] = '{}'
    assert.match(validatePackage(packageWith(loadManifest(), { add: many })).errors.join(), /files > 64/)
  })
})
