import type { IpcMain, IpcMainInvokeEvent } from 'electron'

import { GearingEngine } from '../gearing'
import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'

import {
  IPC_GEARING_GEAR,
  type GearingGearRequest,
  type GearingGearResult
} from '@shared/ipc/gearing'

export class GearingHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly engine: GearingEngine,
    private readonly logger: Logger
  ) {}

  gear = async (req: GearingGearRequest): Promise<GearingGearResult> =>
    withIpcResult(this.logger, 'gearing', 'gearing-gear', async () => {
      const apiResult = await this.engine.gear({
        originalPrompt: req.originalPrompt,
        configs: req.configs
      })
      if (!apiResult.ok) {
        // Throw a tagged error so withIpcResult produces the right envelope
        // code. The classifier in withIpcResult propagates UPPER_SNAKE_CASE.
        const tagged = new Error(apiResult.error.message) as Error & { code?: string }
        tagged.code = apiResult.error.code
        throw tagged
      }
      this.logger.info('gearing', 'gearing-gear-ok', 'Gearing succeeded', {
        conversationId: req.conversationId,
        haikuInputTokens: apiResult.data.tokenBreakdown.haikuInputTokens,
        haikuOutputTokens: apiResult.data.tokenBreakdown.haikuOutputTokens,
        gearedInputEstimate: apiResult.data.tokenBreakdown.gearedInputEstimate,
        expectedDollars: apiResult.data.costPreview.expectedDollars
      })
      return { result: apiResult.data }
    })

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_GEARING_GEAR, async (_e: IpcMainInvokeEvent, req: GearingGearRequest) =>
      this.gear(req)
    )
    this.installedHandlers.push(IPC_GEARING_GEAR)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
