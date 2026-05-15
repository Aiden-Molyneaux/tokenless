// Public Account shape that crosses the IPC boundary. Fields are camelCase
// (DAO maps snake_case <-> camelCase). config_dir per ADR-018 + ADR-005.

export interface Account {
  readonly id: number
  readonly label: string
  readonly configDir: string
  readonly apiKey: string | null   // renamed from apiKeyRef; DB column api_key_ref unchanged
  readonly createdAt: number
}

export interface CreateAccountInput {
  readonly label: string
  readonly configDir: string
  readonly apiKey?: string | null  // renamed from apiKeyRef
}
