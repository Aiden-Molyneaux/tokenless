// Every IPC handler that can fail returns one of these. The renderer never
// receives a thrown exception across the wire — handlers wrap their body in
// logger.errorBoundary and convert any throw into an IpcError envelope. The
// logId lets the user click "Open in Dev Mode" to see the full trace.

export interface IpcOk<T> {
  readonly ok: true
  readonly data: T
}

export interface IpcError {
  readonly ok: false
  readonly error: {
    readonly message: string
    readonly code: string
    readonly logId: string
  }
}

export type IpcResult<T> = IpcOk<T> | IpcError
