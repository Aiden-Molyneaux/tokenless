import type { LogRecord } from '@shared/observability'
import type {
  AccountsListResult,
  AccountsCreateRequest,
  AccountsCreateResult,
  ProjectsListResult,
  ProjectsCreateRequest,
  ProjectsCreateResult,
  ProjectsUpdateRequest,
  ProjectsUpdateResult,
  ProjectsDeleteRequest,
  ProjectsDeleteResult,
  ConversationsListRequest,
  ConversationsListResult,
  ConversationsCreateRequest,
  ConversationsCreateResult,
  ConversationsUpdateRequest,
  ConversationsUpdateResult,
  ConversationsDeleteRequest,
  ConversationsDeleteResult
} from '@shared/ipc'

export interface TokenlessApi {
  readonly version: string
  readonly log: {
    send(record: LogRecord): void
    subscribe(fn: (record: LogRecord) => void): () => void
    getRecent(count?: number): Promise<readonly LogRecord[]>
  }
  readonly accounts: {
    list(): Promise<AccountsListResult>
    create(req: AccountsCreateRequest): Promise<AccountsCreateResult>
  }
  readonly projects: {
    list(): Promise<ProjectsListResult>
    create(req: ProjectsCreateRequest): Promise<ProjectsCreateResult>
    update(req: ProjectsUpdateRequest): Promise<ProjectsUpdateResult>
    delete(req: ProjectsDeleteRequest): Promise<ProjectsDeleteResult>
    onChanged(fn: () => void): () => void
  }
  readonly conversations: {
    listByProject(req: ConversationsListRequest): Promise<ConversationsListResult>
    create(req: ConversationsCreateRequest): Promise<ConversationsCreateResult>
    update(req: ConversationsUpdateRequest): Promise<ConversationsUpdateResult>
    delete(req: ConversationsDeleteRequest): Promise<ConversationsDeleteResult>
    onChanged(fn: () => void): () => void
  }
}

declare global {
  interface Window {
    readonly tokenless: TokenlessApi
  }
}

export {}
