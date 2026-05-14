// ProjectsHandler — wraps ProjectsDao with withIpcResult and converts
// throws into IpcResult envelopes. After every write, broadcasts
// `projects:changed` so renderer hooks invalidate.
//
// Class shape (not IpcMain.handle) so tests can call methods directly.
// install() wires the methods to ipcMain.

import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { ProjectsDao } from '../db'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'
import {
  IPC_PROJECTS_LIST,
  IPC_PROJECTS_CREATE,
  IPC_PROJECTS_UPDATE,
  IPC_PROJECTS_DELETE,
  IPC_PROJECTS_CHANGED,
  type ProjectsListResult,
  type ProjectsCreateRequest,
  type ProjectsCreateResult,
  type ProjectsUpdateRequest,
  type ProjectsUpdateResult,
  type ProjectsDeleteRequest,
  type ProjectsDeleteResult
} from '@shared/ipc/projects'

export type Broadcast = (channel: string, payload: unknown) => void

export class ProjectsHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly broadcast: Broadcast
  ) {}

  list = async (): Promise<ProjectsListResult> =>
    withIpcResult(this.logger, 'db', 'projects-list', async () => {
      const projects = ProjectsDao.listProjects(this.db)
      return { projects }
    })

  create = async (req: ProjectsCreateRequest): Promise<ProjectsCreateResult> =>
    withIpcResult(this.logger, 'db', 'projects-create', async () => {
      const project = ProjectsDao.createProject(this.db, req.input)
      this.broadcast(IPC_PROJECTS_CHANGED, undefined)
      return { project }
    })

  update = async (req: ProjectsUpdateRequest): Promise<ProjectsUpdateResult> =>
    withIpcResult(this.logger, 'db', 'projects-update', async () => {
      const project = ProjectsDao.updateProject(this.db, req.input)
      if (!project) {
        const e = new Error('Project not found') as Error & { code?: string }
        e.code = 'NOT_FOUND'
        throw e
      }
      this.broadcast(IPC_PROJECTS_CHANGED, undefined)
      return { project }
    })

  delete = async (req: ProjectsDeleteRequest): Promise<ProjectsDeleteResult> =>
    withIpcResult(this.logger, 'db', 'projects-delete', async () => {
      const removed = ProjectsDao.deleteProject(this.db, req.id)
      if (!removed) {
        const e = new Error('Project not found') as Error & { code?: string }
        e.code = 'NOT_FOUND'
        throw e
      }
      this.broadcast(IPC_PROJECTS_CHANGED, undefined)
      return { id: req.id }
    })

  install(ipcMain: IpcMain): void {
    const wrap = <Req, Res>(channel: string, fn: (req: Req) => Promise<Res>): void => {
      ipcMain.handle(channel, async (_e: IpcMainInvokeEvent, req: Req) => fn(req))
      this.installedHandlers.push(channel)
    }
    ipcMain.handle(IPC_PROJECTS_LIST, () => this.list())
    this.installedHandlers.push(IPC_PROJECTS_LIST)
    wrap<ProjectsCreateRequest, ProjectsCreateResult>(IPC_PROJECTS_CREATE, this.create)
    wrap<ProjectsUpdateRequest, ProjectsUpdateResult>(IPC_PROJECTS_UPDATE, this.update)
    wrap<ProjectsDeleteRequest, ProjectsDeleteResult>(IPC_PROJECTS_DELETE, this.delete)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
