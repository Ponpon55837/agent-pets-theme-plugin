// NOT vendored: a local type-only stand-in for the app's src/types/ipc.ts.
// The vendored type modules name IpcErrorCode only in IPC result types the
// validator never uses; the real module pulls in most of the app's types.
// Erased at run time; it exists so tsc can check the vendored validator.
export type IpcErrorCode = string
