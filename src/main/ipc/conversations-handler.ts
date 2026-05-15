// ConversationsHandler — wraps ConversationsDao with withIpcResult and converts
// throws into IpcResult envelopes. After every write, broadcasts
// `conversations:changed` so renderer hooks invalidate.

import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { ConversationsDao, TurnsDao } from '../db'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'
import {
  IPC_CONVERSATIONS_LIST_BY_PROJECT,
  IPC_CONVERSATIONS_CREATE,
  IPC_CONVERSATIONS_UPDATE,
  IPC_CONVERSATIONS_DELETE,
  IPC_CONVERSATIONS_CHANGED,
  IPC_CONVERSATIONS_BRANCH,
  type ConversationsListRequest,
  type ConversationsListResult,
  type ConversationsCreateRequest,
  type ConversationsCreateResult,
  type ConversationsUpdateRequest,
  type ConversationsUpdateResult,
  type ConversationsDeleteRequest,
  type ConversationsDeleteResult,
  type ConversationsBranchRequest,
  type ConversationsBranchResult
} from '@shared/ipc/conversations'

export type Broadcast = (channel: string, payload: unknown) => void

export class ConversationsHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly broadcast: Broadcast
  ) {}

  listByProject = async (req: ConversationsListRequest): Promise<ConversationsListResult> =>
    withIpcResult(this.logger, 'db', 'conversations-list-by-project', async () => {
      const conversations = ConversationsDao.listConversationsByProject(this.db, req.projectId)
      return { conversations }
    })

  create = async (req: ConversationsCreateRequest): Promise<ConversationsCreateResult> =>
    withIpcResult(this.logger, 'db', 'conversations-create', async () => {
      const conversation = ConversationsDao.createConversation(this.db, req.input)
      this.broadcast(IPC_CONVERSATIONS_CHANGED, undefined)
      return { conversation }
    })

  update = async (req: ConversationsUpdateRequest): Promise<ConversationsUpdateResult> =>
    withIpcResult(this.logger, 'db', 'conversations-update', async () => {
      const conversation = ConversationsDao.updateConversation(this.db, req.input)
      if (!conversation) {
        const e = new Error('Conversation not found') as Error & { code?: string }
        e.code = 'NOT_FOUND'
        throw e
      }
      this.broadcast(IPC_CONVERSATIONS_CHANGED, undefined)
      return { conversation }
    })

  delete = async (req: ConversationsDeleteRequest): Promise<ConversationsDeleteResult> =>
    withIpcResult(this.logger, 'db', 'conversations-delete', async () => {
      const removed = ConversationsDao.deleteConversation(this.db, req.id)
      if (!removed) {
        const e = new Error('Conversation not found') as Error & { code?: string }
        e.code = 'NOT_FOUND'
        throw e
      }
      this.broadcast(IPC_CONVERSATIONS_CHANGED, undefined)
      return { id: req.id }
    })

  branch = async (req: ConversationsBranchRequest): Promise<ConversationsBranchResult> =>
    withIpcResult(this.logger, 'db', 'conversations-branch', async () => {
      const parent = ConversationsDao.getConversationById(this.db, req.parentConversationId)
      if (!parent) {
        const e = new Error('Parent conversation not found') as Error & { code?: string }
        e.code = 'NOT_FOUND'
        throw e
      }
      const lastTurn = TurnsDao.getLastByConversation(this.db, parent.id)
      if (!lastTurn) {
        const e = new Error('Cannot branch a conversation with no turns') as Error & { code?: string }
        e.code = 'BRANCH_EMPTY_CONVERSATION'
        throw e
      }
      const conversation = ConversationsDao.createBranchConversation(this.db, {
        parentConversationId: parent.id,
        branchedAtTurnId: lastTurn.id
      })
      this.broadcast(IPC_CONVERSATIONS_CHANGED, undefined)
      return { conversation }
    })

  install(ipcMain: IpcMain): void {
    const wrap = <Req, Res>(channel: string, fn: (req: Req) => Promise<Res>): void => {
      ipcMain.handle(channel, async (_e: IpcMainInvokeEvent, req: Req) => fn(req))
      this.installedHandlers.push(channel)
    }
    wrap<ConversationsListRequest, ConversationsListResult>(IPC_CONVERSATIONS_LIST_BY_PROJECT, this.listByProject)
    wrap<ConversationsCreateRequest, ConversationsCreateResult>(IPC_CONVERSATIONS_CREATE, this.create)
    wrap<ConversationsUpdateRequest, ConversationsUpdateResult>(IPC_CONVERSATIONS_UPDATE, this.update)
    wrap<ConversationsDeleteRequest, ConversationsDeleteResult>(IPC_CONVERSATIONS_DELETE, this.delete)
    ipcMain.handle(IPC_CONVERSATIONS_BRANCH, async (_e: IpcMainInvokeEvent, req: ConversationsBranchRequest) =>
      this.branch(req)
    )
    this.installedHandlers.push(IPC_CONVERSATIONS_BRANCH)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
