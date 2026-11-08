#!/usr/bin/env node
// Regenerates every packaged image from code. All artwork is procedural
// (seeded noise, gradients and simple shapes) and original to this repository;
// no external image is used. See CREDITS.md.
//
// Usage: node scripts/assets/generate.mjs
// Needs `cwebp` (libwebp) on PATH for the .webp backgrounds. Output is
// deterministic for a given libwebp version; the committed files were made
// with libwebp 1.6.0.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import { crc32 } from '../lib/zip.mjs'
import { SRC_DIR } from '../lib/cli.mjs'

// ---------- helpers ----------

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const lerp = (a, b, t) => a + (b - a) * t
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const hex = value => [1, 3, 5].map(i => Number.parseInt(value.slice(i, i + 2), 16))
const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

class Canvas {
  constructor(width, height, fill) {
    this.width = width
    this.height = height
    this.data = new Float32Array(width * height * 3)
    if (fill) this.fill((x, y) => fill(x, y))
  }

  fill(fn) {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const c = fn(x, y)
        const i = (y * this.width + x) * 3
        this.data[i] = c[0]
        this.data[i + 1] = c[1]
        this.data[i + 2] = c[2]
      }
    }
  }

  /** Blends `color` with per-pixel coverage `alphaFn(x, y)` inside a bounding box. */
  paint(x0, y0, x1, y1, color, alphaFn, wrap = false) {
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y += 1) {
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x += 1) {
        let px = x
        let py = y
        if (wrap) {
          px = ((x % this.width) + this.width) % this.width
          py = ((y % this.height) + this.height) % this.height
        } else if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue
        const a = alphaFn(x, y)
        if (a <= 0) continue
        const i = (py * this.width + px) * 3
        this.data[i] = lerp(this.data[i], color[0], a)
        this.data[i + 1] = lerp(this.data[i + 1], color[1], a)
        this.data[i + 2] = lerp(this.data[i + 2], color[2], a)
      }
    }
  }

  toRgb(rand) {
    const out = Buffer.alloc(this.width * this.height * 3)
    for (let i = 0; i < this.data.length; i += 1) {
      // Light ordered dither to avoid banding in soft gradients.
      const dither = rand ? (rand() - 0.5) * 1.2 : 0
      out[i] = clamp(Math.round(this.data[i] + dither), 0, 255)
    }
    return out
  }
}

function encodePng(width, height, rgb, channels = 3) {
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = channels === 4 ? 6 : 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Periodic value noise on a grid of `cells`, so it tiles when cells divides the size. */
function valueNoise(rand, cells) {
  const grid = Array.from({ length: cells * cells }, () => rand())
  const at = (gx, gy) => grid[(((gy % cells) + cells) % cells) * cells + (((gx % cells) + cells) % cells)]
  return (u, v) => {
    const x = u * cells
    const y = v * cells
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const tx = smoothstep(0, 1, x - x0)
    const ty = smoothstep(0, 1, y - y0)
    return lerp(lerp(at(x0, y0), at(x0 + 1, y0), tx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx), ty)
  }
}

function fbm(rand, octaves, baseCells) {
  const layers = Array.from({ length: octaves }, (_, i) => valueNoise(rand, baseCells * 2 ** i))
  return (u, v) => {
    let sum = 0
    let amp = 0.5
    let norm = 0
    for (const layer of layers) {
      sum += layer(u, v) * amp
      norm += amp
      amp *= 0.5
    }
    return sum / norm
  }
}

// ---------- artwork ----------

function sakuraLight() {
  const W = 1600
  const H = 1000
  const rand = mulberry32(0x5a4b)
  const noise = fbm(rand, 5, 3)
  const paper = hex('#fbf1f3')
  const blush = hex('#f3c6d3')
  const rose = hex('#e79bb3')
  const c = new Canvas(W, H, (x, y) => {
    const n = noise(x / W, y / H)
    // Watercolour wash, strongest toward the top-right corner.
    const d = Math.hypot((x - W) / W, y / H)
    const wash = smoothstep(1.1, 0.1, d) * (0.55 + 0.6 * n)
    return mixRgb(paper, blush, clamp(wash * 0.75))
  })
  // Pigment pools with soft, noisy edges.
  for (let i = 0; i < 14; i += 1) {
    const cx = lerp(W * 0.45, W * 1.05, rand())
    const cy = lerp(-H * 0.05, H * 0.6, rand())
    const r = lerp(60, 220, rand())
    const strength = lerp(0.12, 0.3, rand())
    c.paint(cx - r * 1.4, cy - r * 1.4, cx + r * 1.4, cy + r * 1.4, rose, (x, y) => {
      const edge = r * (0.85 + 0.35 * noise(x / 300 + i, y / 300))
      const d = Math.hypot(x - cx, y - cy)
      return smoothstep(edge, edge * 0.55, d) * strength
    })
  }
  // Petals: five-lobed blossoms and loose single petals.
  const petal = (cx, cy, size, angle, color, alpha) => {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    c.paint(cx - size * 1.2, cy - size * 1.2, cx + size * 1.2, cy + size * 1.2, color, (x, y) => {
      const dx = ((x - cx) * cos + (y - cy) * sin) / size
      const dy = (-(x - cx) * sin + (y - cy) * cos) / size
      // Teardrop with a notch at the tip.
      const body = dx * dx * 2.2 + (dy + 0.1) * (dy + 0.1) * 1.1
      const notch = Math.hypot(dx, dy - 0.95) < 0.18 ? 1 : 0
      const inside = smoothstep(1, 0.86, body) * (1 - notch)
      return inside * alpha * (0.75 + 0.25 * (1 - Math.abs(dx)))
    })
  }
  const blossomColors = [hex('#f7b7c9'), hex('#f4a6bd'), hex('#f9cbd8')]
  for (let i = 0; i < 9; i += 1) {
    const cx = lerp(W * 0.55, W * 0.98, rand())
    const cy = lerp(H * 0.04, H * 0.5, rand())
    const size = lerp(26, 52, rand())
    const turn = rand() * Math.PI * 2
    const color = blossomColors[i % blossomColors.length]
    for (let k = 0; k < 5; k += 1) {
      const a = turn + (k * Math.PI * 2) / 5
      petal(cx + Math.sin(a) * size * 0.55, cy - Math.cos(a) * size * 0.55, size * 0.62, a, color, 0.85)
    }
    c.paint(cx - 10, cy - 10, cx + 10, cy + 10, hex('#d9577f'), (x, y) => smoothstep(7, 3, Math.hypot(x - cx, y - cy)) * 0.9)
  }
  for (let i = 0; i < 46; i += 1) {
    const t = rand()
    const cx = lerp(W * 0.2, W, t) + (rand() - 0.5) * 200
    const cy = lerp(H * 0.05, H * 0.95, rand() * (1 - t * 0.5))
    petal(cx, cy, lerp(10, 22, rand()), rand() * Math.PI * 2, blossomColors[i % 3], lerp(0.45, 0.8, rand()))
  }
  return { width: W, height: H, rgb: c.toRgb(mulberry32(7)) }
}

function matchaPaper() {
  const S = 512
  const rand = mulberry32(0x3a7c)
  const coarse = fbm(rand, 4, 4)
  const fine = fbm(rand, 3, 32)
  const base = hex('#f1ead6')
  const shade = hex('#ddd3b6')
  const green = hex('#a9b98a')
  const c = new Canvas(S, S, (x, y) => {
    const n = coarse(x / S, y / S) * 0.65 + fine(x / S, y / S) * 0.35
    return mixRgb(base, shade, clamp((n - 0.35) * 1.4))
  })
  // Washi fibres: short curved strokes that wrap around the tile edges.
  for (let i = 0; i < 260; i += 1) {
    const x0 = rand() * S
    const y0 = rand() * S
    const len = lerp(12, 46, rand())
    const angle = rand() * Math.PI
    const bend = (rand() - 0.5) * 0.04
    const width = lerp(0.5, 1.1, rand())
    const color = rand() < 0.18 ? green : shade
    const alpha = lerp(0.25, 0.55, rand())
    for (let s = 0; s <= len; s += 0.5) {
      const a = angle + bend * s
      const px = x0 + Math.cos(a) * s
      const py = y0 + Math.sin(a) * s
      c.paint(px - 2, py - 2, px + 2, py + 2, color, (x, y) => smoothstep(width + 0.6, width - 0.4, Math.hypot(x - px, y - py)) * alpha * 0.35, true)
    }
  }
  // Sparse matcha flecks.
  for (let i = 0; i < 40; i += 1) {
    const px = rand() * S
    const py = rand() * S
    const r = lerp(0.8, 2, rand())
    c.paint(px - 4, py - 4, px + 4, py + 4, hex('#7f9a5a'), (x, y) => smoothstep(r + 0.7, r - 0.3, Math.hypot(x - px, y - py)) * 0.5, true)
  }
  return { width: S, height: S, rgb: c.toRgb(mulberry32(11)) }
}

function duneLayers(c, rand, layers) {
  const { width: W, height: H } = c
  for (const layer of layers) {
    const phases = Array.from({ length: 4 }, () => rand() * Math.PI * 2)
    const ridge = x => {
      const u = x / W
      return H * (layer.base
        + layer.amp * (Math.sin(u * 2.1 * Math.PI + phases[0]) * 0.6
        + Math.sin(u * 4.3 * Math.PI + phases[1]) * 0.25
        + Math.sin(u * 9.7 * Math.PI + phases[2]) * 0.1
        + Math.sin(u * 17 * Math.PI + phases[3]) * 0.05))
    }
    const ridges = Float32Array.from({ length: W }, (_, x) => ridge(x))
    c.paint(0, H * (layer.base - layer.amp * 1.2), W - 1, H - 1, layer.color, (x, y) => {
      const top = ridges[x]
      return smoothstep(top - 0.8, top + 0.8, y)
    })
    // Lit flank: a lighter band just below the crest.
    if (layer.light) {
      c.paint(0, H * (layer.base - layer.amp * 1.2), W - 1, H - 1, layer.light, (x, y) => {
        const top = ridges[x]
        const slope = ridges[Math.min(W - 1, x + 1)] - top
        const lit = clamp(-slope * 0.6 + 0.3)
        return smoothstep(top - 0.8, top + 0.8, y) * smoothstep(top + H * 0.09, top, y) * lit * 0.55
      })
    }
  }
}

function duneLight() {
  const W = 1600
  const H = 1000
  const rand = mulberry32(0xd00e)
  const skyTop = hex('#f6d7c3')
  const skyMid = hex('#f8c9a8')
  const skyLow = hex('#fbe7cf')
  const c = new Canvas(W, H, (x, y) => {
    const t = y / H
    return t < 0.4 ? mixRgb(skyTop, skyMid, t / 0.4) : mixRgb(skyMid, skyLow, clamp((t - 0.4) / 0.25))
  })
  const sunX = W * 0.72
  const sunY = H * 0.42
  c.paint(sunX - 420, sunY - 420, sunX + 420, sunY + 420, hex('#fde9c8'), (x, y) => smoothstep(420, 60, Math.hypot(x - sunX, y - sunY)) * 0.55)
  c.paint(sunX - 90, sunY - 90, sunX + 90, sunY + 90, hex('#fff3dc'), (x, y) => smoothstep(78, 74, Math.hypot(x - sunX, y - sunY)))
  duneLayers(c, rand, [
    { base: 0.58, amp: 0.05, color: hex('#efb995'), light: hex('#f7d2b4') },
    { base: 0.68, amp: 0.06, color: hex('#e5a179'), light: hex('#f2c09b') },
    { base: 0.8, amp: 0.06, color: hex('#d98a62'), light: hex('#eeb18b') },
    { base: 0.92, amp: 0.05, color: hex('#c8754f'), light: hex('#e39e78') },
  ])
  return { width: W, height: H, rgb: c.toRgb(mulberry32(13)) }
}

function duneDark() {
  const W = 1600
  const H = 1000
  const rand = mulberry32(0xd4a7)
  const top = hex('#0d0b16')
  const mid = hex('#221a36')
  const low = hex('#3a2a45')
  const c = new Canvas(W, H, (x, y) => {
    const t = y / H
    return t < 0.55 ? mixRgb(top, mid, t / 0.55) : mixRgb(mid, low, clamp((t - 0.55) / 0.2))
  })
  for (let i = 0; i < 520; i += 1) {
    const sx = rand() * W
    const sy = rand() ** 1.6 * H * 0.62
    const r = rand() < 0.08 ? lerp(1.3, 2.1, rand()) : lerp(0.5, 1.1, rand())
    const a = lerp(0.35, 1, rand())
    c.paint(sx - 4, sy - 4, sx + 4, sy + 4, hex('#f4ecff'), (x, y) => smoothstep(r + 0.8, r - 0.4, Math.hypot(x - sx, y - sy)) * a)
  }
  const mx = W * 0.24
  const my = H * 0.22
  c.paint(mx - 260, my - 260, mx + 260, my + 260, hex('#5a4a7a'), (x, y) => smoothstep(260, 40, Math.hypot(x - mx, y - my)) * 0.35)
  c.paint(mx - 60, my - 60, mx + 60, my + 60, hex('#f3ead8'), (x, y) => {
    const d = Math.hypot(x - mx, y - my)
    const shadow = Math.hypot(x - mx - 18, y - my + 8)
    return smoothstep(46, 44, d) * smoothstep(40, 44, shadow)
  })
  duneLayers(c, rand, [
    { base: 0.6, amp: 0.05, color: hex('#3b2c4f'), light: hex('#55426a') },
    { base: 0.7, amp: 0.06, color: hex('#2f2340'), light: hex('#4a3a5e') },
    { base: 0.82, amp: 0.06, color: hex('#241b33'), light: hex('#3d2f50') },
    { base: 0.93, amp: 0.05, color: hex('#1a1426'), light: hex('#2f2440') },
  ])
  return { width: W, height: H, rgb: c.toRgb(mulberry32(17)) }
}

function icon() {
  const S = 256
  const out = Buffer.alloc(S * S * 4)
  const top = hex('#2e3440')
  const bottom = hex('#15121c')
  const swatches = [
    { x: 100, y: 104, r: 58, color: hex('#f2a7c0') },
    { x: 158, y: 104, r: 58, color: hex('#88c0d0') },
    { x: 100, y: 156, r: 58, color: hex('#9cc069') },
    { x: 158, y: 156, r: 58, color: hex('#e08a5a') },
  ]
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      // Rounded square, radius 56, with 2x2 supersampling on edges.
      let coverage = 0
      let rgb = [0, 0, 0]
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const px = x + ox
        const py = y + oy
        const qx = Math.max(Math.abs(px - S / 2) - (S / 2 - 8 - 56), 0)
        const qy = Math.max(Math.abs(py - S / 2) - (S / 2 - 8 - 56), 0)
        if (Math.hypot(qx, qy) > 56) continue
        coverage += 0.25
        let color = mixRgb(top, bottom, py / S)
        for (const s of swatches) {
          const d = Math.hypot(px - s.x, py - s.y)
          if (d < s.r * 0.62) color = mixRgb(color, s.color, 0.92)
        }
        rgb = rgb.map((v, i) => v + color[i] * 0.25)
      }
      const i = (y * S + x) * 4
      if (coverage > 0) {
        out[i] = Math.round(rgb[0] / coverage)
        out[i + 1] = Math.round(rgb[1] / coverage)
        out[i + 2] = Math.round(rgb[2] / coverage)
      }
      out[i + 3] = Math.round(coverage * 255)
    }
  }
  return encodePng(S, S, out, 4)
}

// ---------- output ----------

const work = mkdtempSync(join(tmpdir(), 'panel-theme-assets-'))
try {
  const backgrounds = {
    'sakura-light': { art: sakuraLight, quality: 80 },
    'matcha-paper': { art: matchaPaper, quality: 82 },
    'dune-light': { art: duneLight, quality: 80 },
    'dune-dark': { art: duneDark, quality: 80 },
  }
  for (const [name, { art, quality }] of Object.entries(backgrounds)) {
    const { width, height, rgb } = art()
    const png = join(work, `${name}.png`)
    writeFileSync(png, encodePng(width, height, rgb))
    const target = resolve(SRC_DIR, 'backgrounds', `${name}.webp`)
    execFileSync('cwebp', ['-quiet', '-q', String(quality), '-m', '6', '-metadata', 'none', png, '-o', target])
    console.log(`wrote src/backgrounds/${name}.webp (${width}x${height})`)
  }
  writeFileSync(resolve(SRC_DIR, 'assets', 'icon.png'), icon())
  console.log('wrote src/assets/icon.png (256x256)')
} finally {
  rmSync(work, { recursive: true, force: true })
}
