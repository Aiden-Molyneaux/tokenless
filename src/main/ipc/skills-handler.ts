import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'

import { SkillsDao } from '../db'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'
import type { Broadcast } from './log-bridge'

import {
  IPC_SKILLS_LIST,
  IPC_SKILLS_TOGGLE_FAVORITE,
  IPC_SKILLS_TOGGLE_HIDDEN,
  IPC_SKILLS_RESCAN,
  IPC_SKILLS_CHANGED,
  type SkillsListResult,
  type SkillsToggleFavoriteRequest,
  type SkillsToggleFavoriteResult,
  type SkillsToggleHiddenRequest,
  type SkillsToggleHiddenResult,
  type SkillsRescanResult
} from '@shared/ipc/skills'

export class SkillsHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly broadcast: Broadcast,
    private readonly rescanFn: () => Promise<{ inserted: number; updated: number; markedStale: number }>
  ) {}

  list = async (): Promise<SkillsListResult> =>
    withIpcResult(this.logger, 'skill', 'skills-list', async () => ({
      skills: SkillsDao.listSkills(this.db)
    }))

  toggleFavorite = async (req: SkillsToggleFavoriteRequest): Promise<SkillsToggleFavoriteResult> =>
    withIpcResult(this.logger, 'skill', 'skills-toggle-favorite', async () => {
      const skill = SkillsDao.listSkills(this.db).find((s) => s.id === req.id)
      if (!skill) {
        const e = new Error('Skill not found') as Error & { code?: string }
        e.code = 'NOT_FOUND'
        throw e
      }
      SkillsDao.toggleFavorite(this.db, req.id, req.favorited)
      this.broadcast(IPC_SKILLS_CHANGED, undefined)
      return { id: req.id, favorited: req.favorited }
    })

  toggleHidden = async (req: SkillsToggleHiddenRequest): Promise<SkillsToggleHiddenResult> =>
    withIpcResult(this.logger, 'skill', 'skills-toggle-hidden', async () => {
      const skill = SkillsDao.listSkills(this.db).find((s) => s.id === req.id)
      if (!skill) {
        const e = new Error('Skill not found') as Error & { code?: string }
        e.code = 'NOT_FOUND'
        throw e
      }
      SkillsDao.toggleHidden(this.db, req.id, req.hidden)
      this.broadcast(IPC_SKILLS_CHANGED, undefined)
      return { id: req.id, hidden: req.hidden }
    })

  rescan = async (): Promise<SkillsRescanResult> =>
    withIpcResult(this.logger, 'skill', 'skills-rescan', async () => {
      const result = await this.rescanFn()
      this.broadcast(IPC_SKILLS_CHANGED, undefined)
      return { ...result, total: SkillsDao.listSkills(this.db).length }
    })

  install(ipcMain: IpcMain): void {
    const wrap = <Req, Res>(channel: string, fn: (req: Req) => Promise<Res>): void => {
      ipcMain.handle(channel, async (_e: IpcMainInvokeEvent, req: Req) => fn(req))
      this.installedHandlers.push(channel)
    }
    ipcMain.handle(IPC_SKILLS_LIST, () => this.list())
    this.installedHandlers.push(IPC_SKILLS_LIST)
    wrap<SkillsToggleFavoriteRequest, SkillsToggleFavoriteResult>(
      IPC_SKILLS_TOGGLE_FAVORITE,
      this.toggleFavorite
    )
    wrap<SkillsToggleHiddenRequest, SkillsToggleHiddenResult>(IPC_SKILLS_TOGGLE_HIDDEN, this.toggleHidden)
    ipcMain.handle(IPC_SKILLS_RESCAN, () => this.rescan())
    this.installedHandlers.push(IPC_SKILLS_RESCAN)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
