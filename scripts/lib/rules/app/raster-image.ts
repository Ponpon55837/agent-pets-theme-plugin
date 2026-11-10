// 點陣圖格式辨識的唯一來源：只比對檔頭 magic bytes，回傳 MIME。
// 接受哪些格式由各入口自己決定（寵物 spritesheet、插件套件、面板主題各不相同）；
// 尺寸、動畫、EXIF orientation 與解碼檢查也都在入口，不在這裡。
// 不得有任何 import：目錄驗證器會連同 plugin-panel-themes.ts 一起 vendor 這個檔。

interface RasterSignature {
  readonly type: string
  /** [位移, 位元組]；全部相符才算這個格式。 */
  readonly parts: readonly (readonly [offset: number, magic: readonly number[]])[]
}

const RASTER_SIGNATURES = [
  { type: 'image/png', parts: [[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]] },
  // SOI（FF D8）之後緊接下一個 marker 的 FF。
  { type: 'image/jpeg', parts: [[0, [0xff, 0xd8, 0xff]]] },
  // RIFF 容器的位移 4–7 是長度，不比對；位移 8 的 form type 必須是 WEBP。
  { type: 'image/webp', parts: [[0, [0x52, 0x49, 0x46, 0x46]], [8, [0x57, 0x45, 0x42, 0x50]]] },
] as const satisfies readonly RasterSignature[]

export type RasterImageType = (typeof RASTER_SIGNATURES)[number]['type']

function matches(bytes: Uint8Array, parts: RasterSignature['parts']): boolean {
  return parts.every(([offset, magic]) => bytes.length >= offset + magic.length
    && magic.every((value, index) => bytes[offset + index] === value))
}

/** 檔頭對應的格式；最多讀前 12 個位元組，不複製 buffer。截斷或不認得的檔頭回傳 null。 */
export function sniffRasterImageType(bytes: Uint8Array): RasterImageType | null {
  return RASTER_SIGNATURES.find(signature => matches(bytes, signature.parts))?.type ?? null
}

/** 檔頭是 `allowed` 之一時回傳該格式，否則 null。 */
export function rasterImageTypeIn(bytes: Uint8Array, allowed: ReadonlySet<RasterImageType>): RasterImageType | null {
  const type = sniffRasterImageType(bytes)
  return type !== null && allowed.has(type) ? type : null
}
