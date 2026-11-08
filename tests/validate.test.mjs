import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { contrast, formatColor, NORMALISED_COLOR, parseColor } from '../scripts/lib/rules/color.mjs'
import { BUILTIN_PALETTES, validatePanelThemes } from '../scripts/lib/rules/panel-themes.mjs'
import { checkPackagedImage, inspectImage } from '../scripts/lib/images.mjs'
import { collectFiles, validatePackage } from '../scripts/lib/package.mjs'
import { SRC_DIR } from '../scripts/lib/cli.mjs'
import { clone, fakePng, loadManifest, minimalTheme, packageWith, themeById, tiffOrientation } from './helpers.mjs'

const errorsOf = themes => validatePanelThemes(themes).errors
const expectError = (themes, pattern) => {
  const errors = errorsOf(themes)
  assert.ok(errors.some(error => pattern.test(error)), `expected ${pattern} in:\n${errors.join('\n')}`)
}

describe('colour grammar', () => {
  it('accepts every documented form and normalises it', () => {
    const cases = {
      '#fff': 'rgb(255 255 255 / 1)',
      '#0008': 'rgb(0 0 0 / 0.533)',
      '#2A1D22': 'rgb(42 29 34 / 1)',
      '#2a1d2280': 'rgb(42 29 34 / 0.502)',
      'rgb(42, 29, 34)': 'rgb(42 29 34 / 1)',
      'rgba(42,29,34,.16)': 'rgb(42 29 34 / 0.16)',
      'rgb(42 29 34 / 0.16)': 'rgb(42 29 34 / 0.16)',
      'rgb(100% 0% 50% / 50%)': 'rgb(255 0 128 / 0.5)',
      'hsl(0, 100%, 50%)': 'rgb(255 0 0 / 1)',
      'hsla(120deg 100% 25% / 0.5)': 'rgb(0 128 0 / 0.5)',
      'oklch(1 0 0)': 'rgb(255 255 255 / 1)',
      'oklch(0% 0 0)': 'rgb(0 0 0 / 1)',
      'oklch(0.7 0.1 200deg / 80%)': formatColor(parseColor('oklch(0.7 0.1 200 / 0.8)')),
    }
    for (const [input, expected] of Object.entries(cases)) {
      const output = formatColor(parseColor(input))
      assert.equal(output, expected, input)
      assert.match(output, NORMALISED_COLOR)
    }
  })

  it('rejects anything outside the grammar', () => {
    const bad = [
      'red', 'transparent', 'currentcolor', 'url(x)', 'var(--a)', 'calc(1)', 'rgb(1 2 3);', 'rgb(1 2 3)}', '#fff\\', '"#fff"',
      ' #fff', '#fff ', 'RGB(1, 2, 3)', 'rgb(-1, 2, 3)', 'rgb(1e2, 2, 3)', 'rgb(256, 0, 0)', 'rgb(10%, 2, 3)', 'rgb(none 0 0)',
      'rgb(０, 0, 0)', 'rgb(0 0 0 / 1.5)', 'hsl(361, 50%, 50%)', 'hsl(10, 50, 50)', 'oklch(1.2 0 0)', 'oklch(0.5 0.5 0)',
      'oklch(0.9 0.37 140)', '#ff', '#fffff', `#${'f'.repeat(70)}`, 'rgb(1 2 3 from)', 'rgb(1\u0000 2 3)',
    ]
    for (const input of bad) assert.throws(() => parseColor(input), undefined, input)
  })

  it('rejects out-of-gamut oklch instead of clipping it', () => {
    assert.throws(() => parseColor('oklch(0.9 0.3 140)'), error => error.code === 'out_of_gamut')
  })

  it('computes WCAG contrast', () => {
    assert.equal(contrast(parseColor('#000'), parseColor('#fff')).toFixed(2), '21.00')
    assert.equal(contrast(parseColor('#777'), parseColor('#777')), 1)
  })
})

describe('panel theme rules', () => {
  it('passes the complete built-in light and dark palettes (regression fixture)', () => {
    const theme = minimalTheme()
    theme.modes.light.colors = BUILTIN_PALETTES.light
    theme.modes.dark.colors = BUILTIN_PALETTES.dark
    assert.deepEqual(errorsOf([theme]), [])
  })

  it('rejects the built-in light required colours alone, because derived accentHover is darker than the built-in one', () => {
    const theme = minimalTheme()
    delete theme.modes.light.colors.accentHover
    expectError([theme], /light\.colors\.onAccent: 4\.43:1 < 4\.5:1 on accentHover/)
  })

  it('passes the spec example theme (Sakura with fonts)', () => {
    const theme = clone(themeById(loadManifest(), 'sakura'))
    theme.fonts = [
      { id: 'nunito', src: 'fonts/nunito-400.woff2', weight: 400, style: 'normal' },
      { id: 'nunito', src: 'fonts/nunito-700.woff2', weight: 700 },
    ]
    theme.typography.body = ['@nunito', 'PingFang TC', 'system-ui', 'sans-serif']
    const result = validatePanelThemes([theme])
    assert.deepEqual(result.errors, [])
    assert.deepEqual(result.fontFiles, ['fonts/nunito-400.woff2', 'fonts/nunito-700.woff2'])
  })

  it('ships at least four themes, each with light and dark sets that pass', () => {
    const manifest = loadManifest()
    const themes = manifest.contributes.panelThemes
    assert.ok(themes.length >= 4)
    for (const theme of themes) assert.deepEqual(Object.keys(theme.modes).sort(), ['dark', 'light'], theme.id)
    const result = validatePanelThemes(themes)
    assert.deepEqual(result.errors, [])
    const kinds = new Set(result.themes.flatMap(theme => Object.values(theme.modes).map(mode => mode.background.type)))
    assert.deepEqual([...kinds].sort(), ['gradient', 'image', 'solid'])
    assert.ok(themes.some(theme => Object.values(theme.modes).some(mode => mode.userImage?.allowed === true)))
  })

  it('reports every failing contrast pair individually', () => {
    const pairs = [
      ['text', '#d8cbb8', /colors\.text: .* on bg/],
      ['textMuted', '#9a917f', /colors\.textMuted: .* on (bg|surface2)/],
      ['accentText', '#c9935a', /colors\.accentText: .* on/],
      ['accent', '#ead9c2', /colors\.accent: .* < 3:1 on/],
      ['onAccent', '#d07b40', /colors\.onAccent: .* on accent/],
      ['dangerText', '#e08070', /colors\.dangerText: .* on surface/],
      ['successText', '#9db07b', /colors\.successText: .* on surface/],
      ['warnText', '#d0a040', /colors\.warnText: .* on surface/],
      ['surfaceWarm', '#8c491a', /colors\.(accentText|text): .* on surfaceWarm/],
      ['surfaceSage', '#3d472b', /colors\.text: .* on surfaceSage/],
      ['textFaint', '#e0d8cc', /colors\.textFaint: .* < 3:1 on surface/],
      ['accentHover', '#f0c0a0', /colors\.onAccent: .* on accentHover/],
    ]
    for (const [key, value, pattern] of pairs) {
      const theme = minimalTheme()
      theme.modes.light.colors[key] = value
      expectError([theme], pattern)
    }
  })

  it('enforces the mode direction rules', () => {
    const swapped = minimalTheme()
    swapped.modes.light = clone(minimalTheme().modes.dark)
    expectError([swapped], /light mode bg luminance/)
    expectError([swapped], /light mode text must be darker/)
    const grey = minimalTheme()
    grey.modes.dark.colors.bg = '#707070'
    expectError([grey], /dark mode bg luminance/)
  })

  it('requires opaque text and surfaces and bounded alpha elsewhere', () => {
    const theme = minimalTheme()
    theme.modes.light.colors.text = 'rgb(32 30 29 / 0.9)'
    theme.modes.light.colors.scrim = 'rgb(0 0 0 / 0.1)'
    theme.modes.dark.colors.border = 'rgb(255 255 255 / 0.05)'
    expectError([theme], /light\.colors\.text: must be opaque/)
    expectError([theme], /light\.colors\.scrim: alpha must be 0\.3-0\.9/)
    expectError([theme], /dark\.colors\.border: alpha must be 0\.08-1/)
  })

  it('samples gradients between stops', () => {
    const theme = minimalTheme()
    // Both stops are dark enough on their own; their midpoint is not checked if sampling is missing.
    theme.modes.dark.background = { type: 'gradient', kind: 'linear', stops: [{ color: '#1f1b16', at: 0 }, { color: '#6e5a40', at: 100 }] }
    expectError([theme], /on stop|on stops 0-1 at/)
  })

  it('computes the minimum overlay and enforces it and the 0.50 floor', () => {
    const theme = clone(themeById(loadManifest(), 'sakura'))
    const light = theme.modes.light
    light.background.overlay.opacity = 0.5
    const result = validatePanelThemes([theme])
    const min = result.themes[0].modes.light.imageMinOverlay
    assert.ok(min > 0.5 && min <= 0.95, String(min))
    assert.ok(result.errors.some(error => error.includes(`below the minimum ${min}`)))
    light.background.overlay.opacity = min
    assert.deepEqual(errorsOf([theme]), [])
    light.background.overlay.opacity = 0.45
    expectError([theme], /overlay\.opacity: must be a number 0\.5-0\.95/)
    light.background.overlay.opacity = min
    light.userImage.overlay.opacity = 0.5
    expectError([theme], /userImage\.overlay\.opacity: 0\.5 is below the minimum/)
  })

  it('rejects an image background when no overlay can make it legible', () => {
    // The built-in light textMuted is 4.96:1 on bg, so even a 0.95 overlay over black falls short.
    const theme = minimalTheme()
    theme.modes.light.background = { type: 'image', src: 'bg.webp', overlay: { color: '#f5ead8', opacity: 0.95 } }
    expectError([theme], /no overlay opacity from 0\.50 to 0\.95/)
  })

  it('accepts single-mode themes', () => {
    const theme = minimalTheme()
    delete theme.modes.dark
    assert.deepEqual(errorsOf([theme]), [])
    delete theme.modes.light
    expectError([theme], /needs at least one of light, dark/)
  })

  it('checks family lists', () => {
    const theme = minimalTheme()
    theme.typography = { body: ['Helvetica', 'Arial'] }
    expectError([theme], /last entry must be a generic family/)
    theme.typography = { body: ['@missing', 'sans-serif'] }
    expectError([theme], /@missing is not declared/)
    theme.typography = { body: ['"Arial"', 'sans-serif'] }
    expectError([theme], /family names use letters/)
    theme.typography = { body: ['a', 'b', 'c', 'd', 'e', 'serif'] }
    expectError([theme], /1-5 family names/)
  })

  it('derives font sizes with the 11 px floor', () => {
    const theme = minimalTheme()
    theme.typography = { scale: 0.92 }
    const report = validatePanelThemes([theme]).themes[0]
    assert.equal(report.fontSizes.label, 11)
    assert.equal(report.fontSizes.displayMd, 20)
  })

  it('rejects, never clamps, out-of-range numbers', () => {
    const cases = [
      [t => { t.typography = { scale: 1.2 } }, /typography\.scale/],
      [t => { t.typography = { scale: 1.005 } }, /typography\.scale/],
      [t => { t.shape = { radiusSm: 17 } }, /shape\.radiusSm/],
      [t => { t.shape = { radiusSm: 12, radiusMd: 10 } }, /radiusSm <= radiusMd/],
      [t => { t.shape = { radiusLg: 10 } }, /radiusMd <= radiusLg/],
      [t => { t.modes.dark.background = { type: 'gradient', kind: 'linear', angle: 360, stops: [{ color: '#000', at: 0 }, { color: '#111', at: 100 }] } }, /angle/],
      [t => { t.modes.dark.background = { type: 'gradient', kind: 'linear', stops: [{ color: '#000', at: 50 }, { color: '#111', at: 10 }] } }, /non-decreasing/],
      [t => { t.modes.dark.background = { type: 'gradient', kind: 'linear', stops: [{ color: '#000', at: 0 }] } }, /2-5 stops/],
      [t => { t.modes.dark.background = { type: 'gradient', kind: 'linear', stops: [{ color: '#0008', at: 0 }, { color: '#111', at: 100 }] } }, /stops must be opaque/],
      [t => { t.modes.dark.background = { type: 'image', src: 'a.webp', blur: 30, overlay: { color: '#000', opacity: 0.9 } } }, /blur/],
      [t => { t.modes.dark.background = { type: 'image', src: 'a.webp', opacity: 0.1, overlay: { color: '#000', opacity: 0.9 } } }, /opacity: must be a number 0\.2-1/],
      [t => { t.modes.dark.background = { type: 'image', src: 'a.jpg', overlay: { color: '#000', opacity: 0.9 } } }, /src/],
      [t => { t.modes.dark.background = { type: 'image', src: '../a.webp', overlay: { color: '#000', opacity: 0.9 } } }, /src/],
      [t => { t.modes.dark.userImage = { allowed: false, overlay: { color: '#000', opacity: 0.9 } } }, /allowed/],
      [t => { t.fonts = [{ id: 'a', src: 'a.ttf' }] }, /\.woff2 path/],
      [t => { t.fonts = [{ id: 'a', src: 'a.woff2', weight: 500 }] }, /weight/],
      [t => { t.fonts = [{ id: 'a', src: 'a.woff2' }, { id: 'a', src: 'b.woff2' }] }, /duplicate \(id, weight, style\)/],
    ]
    for (const [mutate, pattern] of cases) {
      const theme = minimalTheme()
      mutate(theme)
      expectError([theme], pattern)
    }
  })

  it('rejects unknown keys, bad ids and bad counts', () => {
    const theme = minimalTheme()
    theme.css = 'body{}'
    theme.modes.light.colors.link = '#000'
    theme.modes.dark.extra = true
    expectError([theme], /\.css: unknown key/)
    expectError([theme], /colors\.link: unknown key/)
    expectError([theme], /dark\.extra: unknown key/)
    expectError([minimalTheme('Bad_ID')], /id: must match/)
    expectError([minimalTheme('dup'), minimalTheme('dup')], /duplicate theme id/)
    expectError(Array.from({ length: 9 }, (_, i) => minimalTheme(`t${i}`)), /1-8 themes/)
    expectError([], /1-8 themes/)
    const unnamed = minimalTheme()
    unnamed.displayName = { 'en-US': 'Only English' }
    expectError([unnamed], /displayName/)
  })
})

describe('image headers', () => {
  it('reads the packaged backgrounds', () => {
    const files = collectFiles(SRC_DIR)
    for (const [path, bytes] of files) {
      if (!path.endsWith('.webp') && !path.endsWith('.png')) continue
      const { info, problems } = checkPackagedImage(bytes, path.slice(path.lastIndexOf('.')))
      assert.deepEqual(problems, [], path)
      assert.equal(info.animated, false)
    }
  })

  it('flags animation, rotation and size problems', () => {
    assert.equal(inspectImage(fakePng(100, 100, [['acTL', Buffer.alloc(8)]])).animated, true)
    assert.equal(inspectImage(fakePng(100, 100, [['eXIf', tiffOrientation(6)]])).orientation, 6)
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
    const cases = [
      [packageWith(manifest, { remove: ['backgrounds/dune-dark.webp'] }), /dune-dark\.webp: referenced but missing/],
      [packageWith(manifest, { add: { 'fonts/extra.woff2': 'wOF2xxxx' } }), /extra\.woff2: font is not referenced/],
      [packageWith(manifest, { add: { 'notes.txt': 'x' } }), /notes\.txt: not allowed/],
      [packageWith(manifest, { add: { 'photo.jpg': 'x' } }), /photo\.jpg: not allowed/],
      [packageWith(manifest, { add: { 'font.ttf': 'x' } }), /font\.ttf: not allowed/],
      [packageWith(manifest, { add: { 'main.js': 'x' } }), /main\.js: not allowed/],
      [packageWith(manifest, { add: { 'signature.json': '{}' } }), /signature\.json: remove it from src/],
      [packageWith(manifest, { add: { 'backgrounds/dune-dark.webp': fakePng(100, 100) } }), /content is PNG but the extension is \.webp/],
      [packageWith(manifest, { add: { 'bad.json': '{' } }), /bad\.json: invalid JSON/],
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
    theme.typography.body = ['@inter', 'system-ui', 'sans-serif']
    assert.deepEqual(validatePackage(packageWith(manifest, { add: { 'fonts/inter.woff2': 'wOF2\0\0\0\0' } })).errors, [])
    assert.match(validatePackage(packageWith(manifest, { add: { 'fonts/inter.woff2': 'wOFF\0\0\0\0' } })).errors.join(), /wOF2 signature/)
    const big = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(1024 * 1024)])
    assert.match(validatePackage(packageWith(manifest, { add: { 'fonts/inter.woff2': big } })).errors.join(), /> 1 MiB/)
  })

  it('enforces the workerless manifest root', () => {
    const cases = [
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
    const many = {}
    for (let i = 0; i < 64; i += 1) many[`extra/${i}.json`] = '{}'
    assert.match(validatePackage(packageWith(loadManifest(), { add: many })).errors.join(), /files > 64/)
  })
})
