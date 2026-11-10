// 寵物 sprite 圖集規格的單一來源：主程序（匯入驗證、behaviorManifest 解析）與畫面端
// （PetAnimation、預覽、視窗尺寸）都從這裡取格子尺寸、列號與動作定義。
// tests/*.test.mts 會用 Node 直接執行這個檔，所以不得 import 任何 src 模組。

/** 每一格的像素尺寸；圖集寬高必須是它的整數倍。 */
export const PET_CELL_WIDTH = 192
export const PET_CELL_HEIGHT = 208

// 內建 Codex 寵物（public/pets/*）的兩種圖集版本：
//   v1：8 欄 x 9 列（1536x1872）
//   v2：8 欄 x 11 列（1536x2288），第 9–10 列是「看向」動作
//       （public/pets/qitian-dasheng/validation.json），不是走路或睡覺。
export const PET_ATLAS_COLUMNS = 8
export const PET_ATLAS_V1_ROWS = 9
export const PET_ATLAS_V2_ROWS = 11
/** 第 0–8 列（idle … review）是每個版本都必備的。 */
export const PET_ATLAS_MIN_ROWS = PET_ATLAS_V1_ROWS
/** 第 1 列在兩個版本都是 running-right，v2 預設拿來走路。 */
export const PET_ATLAS_WALK_ROW = 1

// 從檔頭就能檢查的上限（不必解碼），避免一張高度壓縮的小檔讓畫面端配置數 GB 記憶體。
export const PET_ATLAS_MAX_COLUMNS = 32
export const PET_ATLAS_MAX_ROWS = 64
export const PET_ATLAS_MAX_PIXELS = 16 * 1024 * 1024

/** 圖集列名；和 types/agent.ts 的狀態標籤一樣是技術識別字，維持英文。 */
export const PET_ATLAS_ROW_NAMES = Object.freeze([
  'idle', 'running-right', 'running-left', 'waving', 'jumping',
  'failed', 'waiting', 'running', 'review', 'look 0-157.5°', 'look 180-337.5°',
] as const)

/** 圖集固定列提供的動作。 */
export type PetAtlasMotionName = 'idle' | 'waving' | 'jumping' | 'failed' | 'waiting' | 'running' | 'review'
/** 只有寵物包宣告後才有的動作；沒宣告時回退成 idle。 */
export type PetOptionalMotionName = 'walk' | 'sleep'
export type PetMotionName = PetAtlasMotionName | PetOptionalMotionName

export const PET_OPTIONAL_MOTION_NAMES: readonly PetOptionalMotionName[] = Object.freeze(['walk', 'sleep'])
export const PET_MOTION_NAMES: readonly PetMotionName[] = Object.freeze([
  'idle', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review', ...PET_OPTIONAL_MOTION_NAMES,
])

export interface PetMotionDefinition {
  name: PetMotionName
  row: number
  frameDurations: readonly number[]
}

function motion(name: PetMotionName, row: number, frameDurations: number[]): PetMotionDefinition {
  return Object.freeze({ name, row, frameDurations: Object.freeze(frameDurations) })
}

// 每列的格數決定動作的節奏，也防止 waving、jumping 這類短動作踩進透明格。
// 整張表凍結：畫面端直接共用這些物件，任何地方都不能改到它。
export const PET_ATLAS_MOTIONS: Readonly<Record<PetAtlasMotionName, PetMotionDefinition>> = Object.freeze({
  idle: motion('idle', 0, [280, 110, 110, 140, 140, 320]),
  waving: motion('waving', 3, [140, 140, 140, 280]),
  jumping: motion('jumping', 4, [140, 140, 140, 140, 280]),
  failed: motion('failed', 5, [140, 140, 140, 140, 140, 140, 140, 240]),
  waiting: motion('waiting', 6, [150, 150, 150, 150, 150, 260]),
  running: motion('running', 7, [120, 120, 120, 120, 120, 220]),
  review: motion('review', 8, [150, 150, 150, 150, 150, 280]),
})

/** behaviorManifest 的上下限；主程序解析與畫面端套用共用同一組數字。 */
export const PET_MOTION_MAX_FRAMES = 16
export const PET_MOTION_MIN_FRAME_MS = 60
export const PET_MOTION_MAX_FRAME_MS = 3_000
/** 只宣告列號、沒給時長時，每格與最後一格的預設時長。 */
export const PET_MOTION_DEFAULT_FRAME_MS = 150
export const PET_MOTION_DEFAULT_LAST_FRAME_MS = 260

export interface PetMotionOverride {
  row: number
  frames?: number
  frameDurations?: number[]
}

/** pet.json／插件外觀的 behaviorManifest：任何動作都能被覆蓋。 */
export type PetMotionManifest = Partial<Record<PetMotionName, PetMotionOverride>>

export interface PetAtlasGrid {
  columns: number
  rows: number
}

export function petAtlasGridFromSize(width: number, height: number): PetAtlasGrid {
  return { columns: Math.floor(width / PET_CELL_WIDTH), rows: Math.floor(height / PET_CELL_HEIGHT) }
}

/** 覆蓋值放不進圖集（列不存在或格數超過欄數）時回傳 false，呼叫端應改用內建值。 */
export function petMotionFitsAtlas(override: PetMotionOverride, grid: PetAtlasGrid): boolean {
  if (!Number.isSafeInteger(override.row) || override.row < 0 || override.row >= grid.rows) return false
  return override.frames === undefined || override.frames <= grid.columns
}

// 主程序已經清理過，這裡再夾一次：渲染端不假設輸入一定乾淨，只在建表時跑、不在每一格。
function fitFrameDurations(source: readonly number[], count: number): readonly number[] {
  return Object.freeze(Array.from({ length: count }, (_, index) => {
    const value = source[index]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.round(Math.max(PET_MOTION_MIN_FRAME_MS, Math.min(PET_MOTION_MAX_FRAME_MS, value)))
    }
    return index === count - 1 ? PET_MOTION_DEFAULT_LAST_FRAME_MS : PET_MOTION_DEFAULT_FRAME_MS
  }))
}

function builtinMotion(name: PetMotionName): PetMotionDefinition | undefined {
  return Object.hasOwn(PET_ATLAS_MOTIONS, name) ? PET_ATLAS_MOTIONS[name as PetAtlasMotionName] : undefined
}

/**
 * 依寵物包的 behaviorManifest 決定一個動作實際要播的列與每格時長。
 * `grid` 未知（圖還沒載入）時只套用解析器的上下限；載入後會重算並排除放不下的覆蓋值。
 * 時長陣列永遠和格數一樣長，畫面端不會讀到 undefined；回傳值一律凍結。
 */
export function resolvePetMotion(name: PetMotionName, manifest: PetMotionManifest | undefined, grid: PetAtlasGrid | null): PetMotionDefinition {
  const declared = manifest && Object.hasOwn(manifest, name) ? manifest[name] : undefined
  const override = declared && (!grid || petMotionFitsAtlas(declared, grid)) ? declared : undefined
  const builtin = builtinMotion(name)
  if (!override) {
    if (!builtin) return resolvePetMotion('idle', manifest, grid)
    if (!grid || builtin.frameDurations.length <= grid.columns) return builtin
  }
  const frameLimit = Math.max(1, Math.min(PET_MOTION_MAX_FRAMES, grid?.columns ?? PET_MOTION_MAX_FRAMES))
  const wanted = override?.frames
    ?? override?.frameDurations?.length
    ?? builtin?.frameDurations.length
    ?? grid?.columns
    ?? PET_ATLAS_MOTIONS.idle.frameDurations.length
  const count = Math.max(1, Math.min(frameLimit, wanted))
  return Object.freeze({
    name,
    row: override?.row ?? builtin!.row,
    frameDurations: fitFrameDurations(override?.frameDurations ?? builtin?.frameDurations ?? [], count),
  })
}

export type PetMotionTable = Readonly<Record<PetMotionName, PetMotionDefinition>>

const BUILTIN_MAX_FRAMES = Math.max(...Object.values(PET_ATLAS_MOTIONS).map(item => item.frameDurations.length))

/** 沒有 manifest、圖集也放得下全部內建動作時共用的表；同一個物件，呼叫端可用 === 判斷有沒有變。 */
export const PET_DEFAULT_MOTION_TABLE: PetMotionTable = Object.freeze({
  ...PET_ATLAS_MOTIONS,
  walk: PET_ATLAS_MOTIONS.idle,
  sleep: PET_ATLAS_MOTIONS.idle,
})

/**
 * 一次把全部動作解析好，播放時只做 O(1) 查表，不在每次換動作或每一格重算。
 * 常見情況（沒有覆蓋值、標準 8 欄圖集）直接回傳 PET_DEFAULT_MOTION_TABLE，不配置新物件。
 */
export function resolvePetMotionTable(manifest: PetMotionManifest | undefined, grid: PetAtlasGrid | null): PetMotionTable {
  const hasOverride = manifest !== undefined && PET_MOTION_NAMES.some(name => Object.hasOwn(manifest, name))
  if (!hasOverride && (!grid || grid.columns >= BUILTIN_MAX_FRAMES)) return PET_DEFAULT_MOTION_TABLE
  const table = {} as Record<PetMotionName, PetMotionDefinition>
  for (const name of PET_MOTION_NAMES) table[name] = resolvePetMotion(name, manifest, grid)
  return Object.freeze(table)
}
