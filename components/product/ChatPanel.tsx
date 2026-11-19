'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, MessageSquarePlus, Square } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import type { CompiledComponentType } from '@/lib/compile';
import { VIDEO_TYPES } from '@/lib/constants';
import type {
  ChatMessage,
  ErrorMessage,
  Plan,
  PlanMessage,
  PlanScene,
  Project,
  VideoMessage,
  VideoType,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/IconButton';
import { Spinner } from '@/components/ui/Spinner';
import { CodeViewerSheet } from './CodeViewerSheet';
import { ErrorCard } from './ErrorCard';
import { PlanCard } from './PlanCard';
import { SceneEditorSheet } from './SceneEditorSheet';
import { VideoCard } from './VideoCard';

interface ChatPanelProps {
  project: Project | null;
  messages: ChatMessage[];
  loadingMessages: boolean;
  draftType: VideoType;
  thinkingStartedAt: number | null;
  thinkingStatusText?: string | null;
  compiledByVideoId: Record<string, Record<string, CompiledComponentType>>;
  buildingVideoMessageId: string | null;
  activeVideoStatusDetail?: string | null;
  activeVideoWaitStartedAt?: number | null;
  onSelectType: (type: VideoType) => void;
  onSendMessage: (content: string) => Promise<boolean>;
  onStopThinking: () => void;
  onRetryError: (message: ErrorMessage) => void;
  onUpdatePlan: (messageId: string, updatedPlan: Plan) => Promise<void>;
  onBuildVideo: (planMessageId: string) => Promise<void>;
  onReopenPlan: (messageId: string) => Promise<void>;
  onStopVideoBuild: () => void;
  onResumeVideoBuild: (videoMessageId: string) => void;
  onRebuildScene: (videoMessageId: string, sceneId: string) => void;
  onRetryFailedScenes: (videoMessageId: string) => void;
  onRuntimeErrorDetected: (videoMessageId: string, errorMessage: string) => void;
  hasBackupModel?: boolean;
  onOpenSettings?: () => void;
  onOpenNewVideo: () => void;
}

function ThinkingIndicator({
  startedAt,
  statusText,
  onStop,
}: {
  startedAt: number;
  statusText?: string | null;
  onStop: () => void;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - startedAt));
    }, 100);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const secondsLabel = `${(elapsedMs / 1000).toFixed(1)}s`;
  const showSlowHint = elapsedMs >= 25_000;

  return (
    <div className="flex justify-start">
      <div className="inline-flex max-w-full flex-col gap-1.5 rounded-[14px] border border-border bg-surface-2 px-3.5 py-2 text-xs text-text-secondary">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Spinner size="sm" />
            <span className="font-medium text-text break-words">
              {statusText || 'Thinking'}
            </span>
            <span className="font-mono text-[11px] text-text-muted tabular-nums shrink-0">
              {secondsLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showSlowHint && (
              <span className="text-[11px] text-warning">
                Still waiting for Google. You can stop and retry, or switch model in Settings.
              </span>
            )}
            <button
              type="button"
              onClick={onStop}
              className="inline-flex min-h-[30px] items-center gap-1 rounded-[8px] border border-border bg-surface-1 px-2.5 py-1 text-[11px] font-medium text-text hover:bg-bg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent shrink-0"
            >
              <Square className="h-2.5 w-2.5 fill-current" />
              <span>Stop</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatPanel({
  project,
  messages,
  loadingMessages,
  draftType,
  thinkingStartedAt,
  thinkingStatusText,
  compiledByVideoId,
  buildingVideoMessageId,
  activeVideoStatusDetail,
  activeVideoWaitStartedAt,
  onSelectType,
  onSendMessage,
  onStopThinking,
  onRetryError,
  onUpdatePlan,
  onBuildVideo,
  onReopenPlan,
  onStopVideoBuild,
  onResumeVideoBuild,
  onRebuildScene,
  onRetryFailedScenes,
  onRuntimeErrorDetected,
  hasBackupModel = false,
  onOpenSettings,
  onOpenNewVideo,
}: ChatPanelProps) {
  const isMobile = useIsMobile();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [editingSceneTarget, setEditingSceneTarget] = useState<{
    messageId: string;
    scene: PlanScene;
  } | null>(null);
  const [codeViewerTarget, setCodeViewerTarget] = useState<{
    sceneName: string;
    code: string;
  } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const activeType = project ? project.type : draftType;
  const isThinking = thinkingStartedAt !== null;
  const isBuildingVideo = buildingVideoMessageId !== null;
  const composerBusy = isThinking || isBuildingVideo;

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, project?.id, isThinking, isBuildingVideo]);

  const resizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 148;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    resizeTextarea(e.target);
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending || composerBusy) return;

    setSending(true);
    try {
      const accepted = await onSendMessage(trimmed);
      if (accepted) {
        setInput('');
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      }
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isMobile) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleSaveEditedScene = async (updatedScene: PlanScene) => {
    if (!editingSceneTarget) return;
    const planMessage = messages.find(
      (m) => m.id === editingSceneTarget.messageId && m.type === 'plan'
    );
    if (!planMessage || planMessage.type !== 'plan') return;

    const updatedPlan: Plan = {
      ...planMessage.plan,
      scenes: planMessage.plan.scenes.map((scene) =>
        scene.id === updatedScene.id ? updatedScene : scene
      ),
    };
    await onUpdatePlan(planMessage.id, updatedPlan);
  };

  const planById = new Map<string, PlanMessage>();
  const activeVideoByPlanId = new Map<string, VideoMessage>();

  for (const msg of messages) {
    if (msg.type === 'plan') {
      planById.set(msg.id, msg);
    } else if (msg.type === 'video' && msg.status !== 'superseded') {
      activeVideoByPlanId.set(msg.planMessageId, msg);
    }
  }

  const renderMessageItem = (message: ChatMessage) => {
    switch (message.type) {
      case 'user_text':
        return (
          <div key={message.id} className="flex justify-end">
            <div
              dir="auto"
              className="max-w-[85%] rounded-[16px] rounded-br-[4px] bg-accent px-4 py-2.5 text-sm leading-relaxed text-accent-fg whitespace-pre-wrap break-words"
            >
              {message.content}
            </div>
          </div>
        );

      case 'system_notice':
        return (
          <div key={message.id} className="flex justify-center py-1">
            <div className="max-w-md rounded-[12px] border border-border bg-surface-2 px-3.5 py-2.5 text-center text-xs leading-relaxed text-text-secondary">
              {message.content}
            </div>
          </div>
        );

      case 'assistant_text':
        return (
          <div key={message.id} className="flex justify-start">
            <div
              dir="auto"
              className="max-w-[90%] rounded-[16px] rounded-bl-[4px] border border-border bg-surface-2 px-4 py-2.5 text-sm leading-relaxed text-text whitespace-pre-wrap break-words"
            >
              {message.content}
            </div>
          </div>
        );

      case 'plan':
        return (
          <PlanCard
            key={message.id}
            message={message}
            projectType={project?.type ?? message.projectType}
            linkedVideo={activeVideoByPlanId.get(message.id) ?? null}
            isBuildingVideo={isBuildingVideo || isThinking}
            onUpdatePlan={onUpdatePlan}
            onBuildVideo={onBuildVideo}
            onReopenPlan={onReopenPlan}
            onOpenSceneEditor={(messageId, scene) =>
              setEditingSceneTarget({ messageId, scene })
            }
          />
        );

      case 'video': {
        const linkedPlanMsg = planById.get(message.planMessageId);
        return (
          <VideoCard
            key={message.id}
            message={message}
            linkedPlan={linkedPlanMsg ? linkedPlanMsg.plan : null}
            compiledBySceneId={compiledByVideoId[message.id] ?? {}}
            isAnyBuildRunning={composerBusy}
            activeSceneStatusDetail={
              buildingVideoMessageId === message.id
                ? activeVideoStatusDetail
                : null
            }
            activeWaitStartedAt={
              buildingVideoMessageId === message.id
                ? activeVideoWaitStartedAt
                : null
            }
            onStopBuild={onStopVideoBuild}
            onResumeBuild={onResumeVideoBuild}
            onRebuildScene={onRebuildScene}
            onRetryFailedScenes={onRetryFailedScenes}
            onViewCode={(sceneName, code) =>
              setCodeViewerTarget({ sceneName, code })
            }
            onRuntimeErrorDetected={onRuntimeErrorDetected}
            hasBackupModel={hasBackupModel}
            onOpenSettings={onOpenSettings}
          />
        );
      }

      case 'error':
        return (
          <ErrorCard
            key={message.id}
            message={message}
            disabled={composerBusy || sending}
            hasBackupModel={hasBackupModel}
            onOpenSettings={onOpenSettings}
            onRetry={onRetryError}
          />
        );

      case 'scene_code':
      case 'render_result':
        return (
          <div key={message.id} className="flex justify-start">
            <div className="max-w-[85%] rounded-[12px] border border-border bg-surface-2 px-3.5 py-2 text-xs text-text-secondary">
              {message.content}
            </div>
          </div>
        );

      default: {
        const _exhaustive: never = message;
        return _exhaustive;
      }
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {loadingMessages ? (
          <div className="space-y-3">
            <div className="ml-auto h-11 w-3/5 animate-pulse rounded-[16px] bg-surface-2" />
            <div className="mx-auto h-10 w-4/5 animate-pulse rounded-[12px] bg-surface-2" />
          </div>
        ) : messages.length === 0 && !isThinking ? (
          <div className="flex h-full flex-col items-center justify-center py-8 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-text text-balance">
              What are we making?
            </h1>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-text-secondary">
              Pick a video type below and describe your scene.
            </p>

            <div className="mt-5 flex max-w-sm flex-wrap items-center justify-center gap-2">
              {VIDEO_TYPES.map((type) => {
                const selected = activeType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onSelectType(type)}
                    aria-pressed={selected}
                    className={cn(
                      'min-h-[40px] rounded-[12px] border px-3.5 py-2 text-xs font-medium transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      selected
                        ? 'border-accent bg-accent/12 text-accent'
                        : 'border-border bg-surface-1 text-text-secondary hover:bg-surface-2 hover:text-text'
                    )}
                  >
                    {type}
                  </button>
                );
              })}
            </div>

            {!project && (
              <button
                type="button"
                onClick={onOpenNewVideo}
                className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text transition-colors cursor-pointer"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                <span>Choose aspect ratio first</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3.5">
            {messages.map((msg) => renderMessageItem(msg))}
            {thinkingStartedAt !== null && (
              <ThinkingIndicator
                key={thinkingStartedAt}
                startedAt={thinkingStartedAt}
                statusText={thinkingStatusText}
                onStop={onStopThinking}
              />
            )}
            <div ref={scrollEndRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-surface-1 px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2 rounded-[14px] border border-border bg-surface-2 p-1.5 focus-within:border-accent">
          <textarea
            ref={textareaRef}
            rows={1}
            dir="auto"
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={composerBusy}
            placeholder={
              isThinking
                ? 'Director is thinking...'
                : isBuildingVideo
                  ? 'Building scenes...'
                  : 'Describe your video or request a change...'
            }
            aria-label="Message composer"
            className="min-h-[40px] max-h-[148px] flex-1 resize-none bg-transparent px-2.5 py-2 text-sm leading-[22px] text-text placeholder:text-text-muted focus:outline-none disabled:opacity-60"
          />
          <IconButton
            variant="primary"
            aria-label="Send message"
            disabled={!input.trim() || sending || composerBusy}
            onClick={() => void handleSend()}
          >
            <ArrowUp className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="mt-1.5 hidden md:flex items-center justify-between px-1 text-[11px] text-text-muted">
          <span>Enter to send · Shift+Enter for new line</span>
          {project && (
            <span className="font-mono">
              {project.format} · {project.type}
            </span>
          )}
        </div>
      </div>

      <SceneEditorSheet
        open={editingSceneTarget !== null}
        scene={editingSceneTarget?.scene ?? null}
        onClose={() => setEditingSceneTarget(null)}
        onSave={handleSaveEditedScene}
      />

      <CodeViewerSheet
        open={codeViewerTarget !== null}
        sceneName={codeViewerTarget?.sceneName ?? ''}
        code={codeViewerTarget?.code ?? ''}
        onClose={() => setCodeViewerTarget(null)}
      />
    </div>
  );
}
