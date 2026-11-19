import type { GeminiErrorKind } from '@/lib/ai/gemini-errors';

export type VideoFormat = '9:16' | '16:9' | '1:1';

export type VideoType = 'Explainer' | 'Title' | 'Lower third' | 'Short ad';

export type ThemePreference = 'system' | 'dark' | 'light';

export type ExportMode = 'standard' | 'compatibility';

export type PlanFont = 'sans' | 'serif' | 'mono';

export type PlanStatus = 'draft' | 'approved' | 'superseded';

export interface PlanPalette {
  background: string;
  surface: string;
  text: string;
  accent: string;
  accentAlt: string;
}

export interface PlanStyle {
  mood: string;
  palette: PlanPalette;
  font: PlanFont;
}

export interface PlanScene {
  id: string;
  name: string;
  durationSeconds: number;
  purpose: string;
  onScreenText: string[];
  visualIdea: string;
  motion: string;
}

export interface Plan {
  title: string;
  style: PlanStyle;
  scenes: PlanScene[];
}

export interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount?: number;
  totalTokenCount: number;
}

export interface SessionUsage {
  requestsMade: number;
  promptTokens: number;
  outputTokens: number;
  thoughtTokens?: number;
}

export interface DebugInfo {
  modelName: string;
  requestedModelName?: string;
  usedBackupModel?: boolean;
  usedStructuredSchema: boolean;
  repaired: boolean;
  timestamp: string;
  requestContext: {
    format: VideoFormat;
    type: VideoType;
    recentMessageCount: number;
    hasCurrentPlan: boolean;
    userPromptChars: number;
  };
  rawModelOutput?: string;
  repairModelOutput?: string;
  validationErrors?: string[];
  usageMetadata?: GeminiUsageMetadata;
}

export interface Project {
  id: string;
  title: string;
  format: VideoFormat;
  type: VideoType;
  createdAt: number;
  updatedAt: number;
}

export interface BaseMessage {
  id: string;
  projectId: string;
  createdAt: number;
}

export interface UserTextMessage extends BaseMessage {
  type: 'user_text';
  content: string;
}

export interface AssistantTextMessage extends BaseMessage {
  type: 'assistant_text';
  content: string;
}

export interface SystemNoticeMessage extends BaseMessage {
  type: 'system_notice';
  content: string;
}

export interface PlanMessage extends BaseMessage {
  type: 'plan';
  version: number;
  status: PlanStatus;
  message: string;
  assumptions: string[];
  plan: Plan;
  format: VideoFormat;
  projectType: VideoType;
  debugInfo?: DebugInfo;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  summary: string;
  userAction?: string;
  errorKind?: GeminiErrorKind;
  needsBackupModel?: boolean;
  details: string;
  retryable: boolean;
  retryPrompt?: string;
  debugInfo?: DebugInfo;
}

export type VideoStatus =
  | 'building'
  | 'ready'
  | 'partial'
  | 'paused'
  | 'failed'
  | 'superseded';

export type VideoSceneStatus =
  | 'pending'
  | 'writing'
  | 'checking'
  | 'repairing'
  | 'ok'
  | 'failed'
  | 'outdated';

export interface SceneAttempt {
  outcome:
    | 'ok'
    | 'truncated'
    | 'compile_error'
    | 'runtime_error'
    | 'internal_error'
    | 'api_error'
    | 'aborted';
  error?: string;
  modelName?: string;
}

export interface VideoSceneRecord {
  sceneId: string;
  name: string;
  specHash: string;
  status: VideoSceneStatus;
  statusNote?: string;
  modelName?: string;
  code: string;
  rawOutputs?: string[];
  attempts: SceneAttempt[];
  tokens: number;
  promptTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  elapsedMs: number;
  error?: string;
  errorKind?: GeminiErrorKind;
}

export interface VideoMessage extends BaseMessage {
  type: 'video';
  version: number;
  planMessageId: string;
  planVersion: number;
  status: VideoStatus;
  pauseReason?: 'google_busy' | 'stopped';
  pauseMessage?: string;
  scenes: VideoSceneRecord[];
  width: number;
  height: number;
  fps: number;
  modelName: string;
  format: VideoFormat;
  startedAt: number;
  finishedAt?: number;
}

// Reserved message types for future phases
export interface ReservedSceneCodeMessage extends BaseMessage {
  type: 'scene_code';
  content: string;
}

export interface ReservedRenderResultMessage extends BaseMessage {
  type: 'render_result';
  content: string;
}

export type ChatMessage =
  | UserTextMessage
  | AssistantTextMessage
  | SystemNoticeMessage
  | PlanMessage
  | ErrorMessage
  | VideoMessage
  | ReservedSceneCodeMessage
  | ReservedRenderResultMessage;

export type NewChatMessage = ChatMessage extends infer M
  ? M extends ChatMessage
    ? Omit<M, 'id' | 'createdAt'> & { id?: string; createdAt?: number }
    : never
  : never;

