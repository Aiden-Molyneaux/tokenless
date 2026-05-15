import type { Turn, Feedback, FeedbackSummary } from '../types/turns'
import type { IpcResult } from './envelope'

export const IPC_TURNS_LIST_BY_CONVERSATION = 'turns:list-by-conversation'
export const IPC_TURNS_UPDATE_FEEDBACK = 'turns:update-feedback'
export const IPC_TURNS_FEEDBACK_SUMMARY = 'turns:feedback-summary'
export const IPC_TURNS_CHANGED = 'turns:changed'

export interface TurnsListRequest {
  readonly conversationId: number
}
export interface TurnsListResponse {
  readonly turns: readonly Turn[]
}

export interface TurnsUpdateFeedbackRequest {
  readonly id: number
  readonly feedback: Feedback
}
export interface TurnsUpdateFeedbackResponse {
  readonly id: number
  readonly feedback: Feedback
}

export interface TurnsFeedbackSummaryResponse {
  readonly summary: FeedbackSummary
}

export type TurnsListResult = IpcResult<TurnsListResponse>
export type TurnsUpdateFeedbackResult = IpcResult<TurnsUpdateFeedbackResponse>
export type TurnsFeedbackSummaryResult = IpcResult<TurnsFeedbackSummaryResponse>
