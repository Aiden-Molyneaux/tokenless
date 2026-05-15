import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { TemplatesDao } from '../db'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'
import type { Broadcast } from './log-bridge'

import {
  IPC_TEMPLATES_LIST,
  IPC_TEMPLATES_CREATE,
  IPC_TEMPLATES_UPDATE,
  IPC_TEMPLATES_DELETE,
  IPC_TEMPLATES_CHANGED,
  type TemplatesListResult,
  type TemplatesCreateRequest,
  type TemplatesCreateResult,
  type TemplatesUpdateRequest,
  type TemplatesUpdateResult,
  type TemplatesDeleteRequest,
  type TemplatesDeleteResult
} from '@shared/ipc/templates'

export class TemplatesHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly broadcast: Broadcast
  ) {}

  list = async (): Promise<TemplatesListResult> =>
    withIpcResult(this.logger, 'db', 'templates-list', async () => ({
      templates: TemplatesDao.listTemplates(this.db)
    }))

  create = async (req: TemplatesCreateRequest): Promise<TemplatesCreateResult> =>
    withIpcResult(this.logger, 'db', 'templates-create', async () => {
      const template = TemplatesDao.createTemplate(this.db, req.input)
      this.broadcast(IPC_TEMPLATES_CHANGED, undefined)
      return { template }
    })

  update = async (req: TemplatesUpdateRequest): Promise<TemplatesUpdateResult> =>
    withIpcResult(this.logger, 'db', 'templates-update', async () => {
      const current = TemplatesDao.getTemplateById(this.db, req.input.id)
      if (!current) {
        const e = new Error('Template not found') as Error & { code?: string }
        e.code = 'NOT_FOUND'
        throw e
      }
      if (current.builtin) {
        const e = new Error('Built-in templates cannot be modified') as Error & { code?: string }
        e.code = 'BUILTIN_PROTECTED'
        throw e
      }
      const updated = TemplatesDao.updateTemplate(this.db, req.input)
      if (!updated) {
        const e = new Error('Template not found') as Error & { code?: string }
        e.code = 'NOT_FOUND'
        throw e
      }
      this.broadcast(IPC_TEMPLATES_CHANGED, undefined)
      return { template: updated }
    })

  delete = async (req: TemplatesDeleteRequest): Promise<TemplatesDeleteResult> =>
    withIpcResult(this.logger, 'db', 'templates-delete', async () => {
      const current = TemplatesDao.getTemplateById(this.db, req.id)
      if (!current) {
        const e = new Error('Template not found') as Error & { code?: string }
        e.code = 'NOT_FOUND'
        throw e
      }
      if (current.builtin) {
        const e = new Error('Built-in templates cannot be deleted') as Error & { code?: string }
        e.code = 'BUILTIN_PROTECTED'
        throw e
      }
      TemplatesDao.deleteTemplate(this.db, req.id)
      this.broadcast(IPC_TEMPLATES_CHANGED, undefined)
      return { id: req.id, deleted: true }
    })

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_TEMPLATES_LIST, () => this.list())
    this.installedHandlers.push(IPC_TEMPLATES_LIST)
    ipcMain.handle(IPC_TEMPLATES_CREATE, async (_e: IpcMainInvokeEvent, req: TemplatesCreateRequest) =>
      this.create(req)
    )
    this.installedHandlers.push(IPC_TEMPLATES_CREATE)
    ipcMain.handle(IPC_TEMPLATES_UPDATE, async (_e: IpcMainInvokeEvent, req: TemplatesUpdateRequest) =>
      this.update(req)
    )
    this.installedHandlers.push(IPC_TEMPLATES_UPDATE)
    ipcMain.handle(IPC_TEMPLATES_DELETE, async (_e: IpcMainInvokeEvent, req: TemplatesDeleteRequest) =>
      this.delete(req)
    )
    this.installedHandlers.push(IPC_TEMPLATES_DELETE)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
