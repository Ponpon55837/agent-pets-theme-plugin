// Shared contract for the two-step custom pet (theme) zip import.

export type SpriteAtlasVersion = 1 | 2

export type PetImportWarning =
  | 'declared-version-mismatch'
  | 'unexpected-row-count'
  | 'unexpected-column-count'
  | 'behavior-row-out-of-range'
  | 'ignored-entries'

export type PetImportDecision = 'install' | 'replace' | 'keep-both'

export interface PetImportAtlas {
  version: SpriteAtlasVersion
  columns: number
  rows: number
  width: number
  height: number
  frameWidth: number
  frameHeight: number
}

export interface PetImportConflict {
  /** The existing pet id (folder name) that the kit collides with. */
  id: string
  /** Built-in pets can only be kept beside, never replaced. */
  builtIn: boolean
  suggestedId: string
  suggestedDisplayName: string
}

export interface PetImportPreview {
  token: string
  /** Opaque; must be passed back unchanged to commit. */
  expectedState: string
  id: string
  displayName: string
  kind: 'person' | 'animal'
  atlas: PetImportAtlas
  warnings: PetImportWarning[]
  /** Behaviours filled from the atlas contract rather than declared by the kit. */
  autoBehaviors: Array<'walk'>
  conflict: PetImportConflict | null
  /** agent-pets://import-preview/<token>/spritesheet, served from the staging directory. */
  previewUrl: string
}

export type PetImportPrepareResult =
  | { ok: true; preview: PetImportPreview }
  | { ok: false; error: string; code?: string }

export type PetImportCommitErrorCode = 'E_IMPORT_EXPIRED' | 'E_IMPORT_DECISION' | 'E_IMPORT_STATE_CHANGED' | 'E_IMPORT_FAILED'

export type PetImportCommitResult =
  | { ok: true; id: string; displayName: string }
  | { ok: false; error: string; code: PetImportCommitErrorCode; preview?: PetImportPreview }
