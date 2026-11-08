// Preloaded by `pnpm test` (node --import). Node strips TypeScript types on every
// start, and the suite starts the CLI scripts many times; a compile cache under
// node_modules/.cache lets each child reuse the stripped and compiled modules.
// Child processes inherit it through NODE_COMPILE_CACHE.

import { enableCompileCache } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const cache = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.cache', 'node-compile-cache')
process.env.NODE_COMPILE_CACHE ??= cache
enableCompileCache(process.env.NODE_COMPILE_CACHE)
