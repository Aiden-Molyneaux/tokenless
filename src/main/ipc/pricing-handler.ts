import type { IpcMain, IpcMainInvokeEvent } from 'electron'

import { Logger } from '../observability/logger'
import { withIpcResult } from './with-ipc-result'

import {
  IPC_PRICING_LIST,
  type PricingEntry,
  type PricingListResult
} from '@shared/ipc/pricing'

export class PricingHandler {
  private installedHandlers: string[] = []

  constructor(
    private readonly logger: Logger,
    private readonly pricingProvider: () => readonly PricingEntry[]
  ) {}

  list = async (): Promise<PricingListResult> =>
    withIpcResult(this.logger, 'api', 'pricing-list', async () => ({
      entries: this.pricingProvider()
    }))

  install(ipcMain: IpcMain): void {
    ipcMain.handle(IPC_PRICING_LIST, (_e: IpcMainInvokeEvent) => this.list())
    this.installedHandlers.push(IPC_PRICING_LIST)
  }

  uninstall(ipcMain: IpcMain): void {
    for (const ch of this.installedHandlers) ipcMain.removeHandler(ch)
    this.installedHandlers = []
  }
}
