'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/use-online';
import { useVisualViewportHeight } from '@/hooks/use-visual-viewport';
import {
  buildSingleScene,
  isEndOfBuildRetryEligible,
  RETRYING_ON_BACKUP_MODEL_NOTE,
} from '@/lib/ai/animator';
import { runDirectorTurn } from '@/lib/ai/director';
import { isAbortError } from '@/lib/ai/gemini-client';
import { compileComponent, type CompiledComponentType } from '@/lib/compile';
import {
  addMessage,
  createProject,
  deleteProject,
  deriveTitleFromMessage,
  listMessages,
  listProjects,
  saveNewVideoBuildTurn,
  savePlanTurn,
  updateMessage,
  updateProject,
} from '@/lib/db';
import type { GeminiModel } from '@/lib/gemini';
import {
  clearStoredBackupModel,
  clearStoredModel,
  getStoredActiveProjectId,
  getStoredApiKey,
  getStoredBackupModel,
  getStoredModel,
  setStoredActiveProjectId,
} from '@/lib/storage';
import type {
  ChatMessage,
  ErrorMessage,
  Plan,
  PlanMessage,
  PlanScene,
  Project,
  SessionUsage,
  VideoFormat,
  VideoMessage,
  VideoSceneRecord,
  VideoStatus,
  VideoType,
} from '@/lib/types';
import {
  buildSceneTheme,
  computeSceneSpecHash,
  getDimensionsForFormat,
  secondsToFrames,
  VIDEO_FPS,
} from '@/lib/video/dimensions';
import { ensurePipelineSelfTest } from '@/lib/video/self-test';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/Button';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { ChatPanel } from './ChatPanel';
import { NewVideoSheet } from './NewVideoSheet';
import { Onboarding } from './Onboarding';
import { ProjectsSheet } from './ProjectsSheet';
import {
  SceneRuntimeProbe,
  type SceneRuntimeProbeHandle,
} from './SceneRuntimeProbe';
import { SettingsSheet } from './SettingsSheet';
import { StagePanel } from './StagePanel';
import { TopBar } from './TopBar';

function subscribeHydration(): () => void {
  return () => {};
}

const EMPTY_SESSION_USAGE: SessionUsage = {
  requestsMade: 0,
  promptTokens: 0,
  outputTokens: 0,
  thoughtTokens: 0,
};

function compileVideosFromMessages(
  msgs: ChatMessage[]
): Record<string, Record<string, CompiledComponentType>> {
  const compiledMap: Record<string, Record<string, CompiledComponentType>> = {};
  for (const msg of msgs) {
    if (msg.type !== 'video' || msg.status === 'superseded') continue;
    const perScene: Record<string, CompiledComponentType> = {};
    for (const scene of msg.scenes) {
      if ((scene.status === 'ok' || scene.status === 'outdated') && scene.code) {
        const res = compileComponent(scene.code);
        if (res.ok) {
          perScene[scene.sceneId] = res.component;
        }
      }
    }
    compiledMap[msg.id] = perScene;
  }
  return compiledMap;
}

async function normalizeInterruptedBuilds(
  msgs: ChatMessage[]
): Promise<ChatMessage[]> {
  let changed = false;
  const normalized: ChatMessage[] = [];

  for (const msg of msgs) {
    if (msg.type === 'video' && msg.status === 'building') {
      changed = true;
      const updatedScenes: VideoSceneRecord[] = msg.scenes.map((scene) => {
        if (
          scene.status === 'pending' ||
          scene.status === 'writing' ||
          scene.status === 'checking' ||
          scene.status === 'repairing'
        ) {
          return {
            ...scene,
            status: 'pending',
            statusNote: 'Interrupted',
            error: undefined,
          };
        }
        return scene;
      });
      const fixedMsg: VideoMessage = {
        ...msg,
        status: 'paused',
        pauseReason: 'stopped',
        scenes: updatedScenes,
        finishedAt: msg.finishedAt ?? Date.now(),
      };
      await updateMessage(fixedMsg);
      normalized.push(fixedMsg);
    } else {
      normalized.push(msg);
    }
  }

  return changed ? normalized : msgs;
}

function WorkspaceShell() {
  const isOnline = useOnlineStatus();
  const vvHeight = useVisualViewportHeight();
  const { showToast } = useToast();

  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false
  );

  const [apiKey, setApiKey] = useState<string>(() =>
    typeof window !== 'undefined' ? getStoredApiKey() : ''
  );
  const [selectedModel, setSelectedModel] = useState<string>(() =>
    typeof window !== 'undefined' ? getStoredModel() : ''
  );
  const [backupModel, setBackupModel] = useState<string>(() =>
    typeof window !== 'undefined' ? getStoredBackupModel() : ''
  );
  const [models, setModels] = useState<GeminiModel[]>([]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null);
  const [thinkingStatusText, setThinkingStatusText] = useState<string | null>(
    null
  );
  const [compiledByVideoId, setCompiledByVideoId] = useState<
    Record<string, Record<string, CompiledComponentType>>
  >({});
  const [buildingVideoMessageId, setBuildingVideoMessageId] = useState<
    string | null
  >(null);
  const [activeVideoStatusDetail, setActiveVideoStatusDetail] = useState<
    string | null
  >(null);
  const [activeVideoWaitStartedAt, setActiveVideoWaitStartedAt] = useState<
    number | null
  >(null);

  const [sessionUsage, setSessionUsage] =
    useState<SessionUsage>(EMPTY_SESSION_USAGE);

  const [draftType, setDraftType] = useState<VideoType>('Explainer');
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [newVideoOpen, setNewVideoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const videoAbortControllerRef = useRef<AbortController | null>(null);
  const probeRef = useRef<SceneRuntimeProbeHandle | null>(null);
  const activeProjectIdRef = useRef<string | null>(activeProjectId);
  const handledRuntimeErrorsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      videoAbortControllerRef.current?.abort();
    };
  }, []);

  const effectiveApiKey = hydrated ? apiKey || getStoredApiKey() : '';
  const effectiveModel = hydrated ? selectedModel || getStoredModel() : '';
  const effectiveBackupModel = hydrated
    ? backupModel || getStoredBackupModel()
    : '';

  const abortInFlight = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (videoAbortControllerRef.current) {
      videoAbortControllerRef.current.abort();
      videoAbortControllerRef.current = null;
    }
    setThinkingStartedAt(null);
    setThinkingStatusText(null);
    setBuildingVideoMessageId(null);
    setActiveVideoStatusDetail(null);
    setActiveVideoWaitStartedAt(null);
  }, []);

  const loadWorkspaceProjects = useCallback(async () => {
    abortInFlight();
    const all = await listProjects();
    setProjects(all);

    const savedId = getStoredActiveProjectId();
    const match = all.find((p) => p.id === savedId) ?? all[0] ?? null;
    const nextId = match?.id ?? null;
    setActiveProjectId(nextId);
    setStoredActiveProjectId(nextId);
    setLoadingProjects(false);

    if (nextId) {
      setLoadingMessages(true);
      const rawMsgs = await listMessages(nextId);
      const msgs = await normalizeInterruptedBuilds(rawMsgs);
      setMessages(msgs);
      setCompiledByVideoId(compileVideosFromMessages(msgs));
      setLoadingMessages(false);
    } else {
      setMessages([]);
      setCompiledByVideoId({});
    }
  }, [abortInFlight]);

  useEffect(() => {
    if (!effectiveApiKey) return;
    let active = true;
    listProjects()
      .then(async (all) => {
        if (!active) return;
        setProjects(all);
        const savedId = getStoredActiveProjectId();
        const match = all.find((p) => p.id === savedId) ?? all[0] ?? null;
        const nextId = match?.id ?? null;
        setActiveProjectId(nextId);
        setStoredActiveProjectId(nextId);
        setLoadingProjects(false);

        if (nextId) {
          setLoadingMessages(true);
          const rawMsgs = await listMessages(nextId);
          const msgs = await normalizeInterruptedBuilds(rawMsgs);
          if (!active) return;
          setMessages(msgs);
          setCompiledByVideoId(compileVideosFromMessages(msgs));
          setLoadingMessages(false);
        } else {
          setMessages([]);
          setCompiledByVideoId({});
        }
      })
      .catch(() => {
        if (active) {
          setLoadingProjects(false);
          setLoadingMessages(false);
        }
      });

    return () => {
      active = false;
    };
  }, [effectiveApiKey]);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) ?? null;

  const handleSelectProject = async (id: string) => {
    if (id !== activeProjectId) {
      abortInFlight();
    }
    setActiveProjectId(id);
    setStoredActiveProjectId(id);
    setLoadingMessages(true);
    try {
      const rawMsgs = await listMessages(id);
      const msgs = await normalizeInterruptedBuilds(rawMsgs);
      setMessages(msgs);
      setCompiledByVideoId(compileVideosFromMessages(msgs));
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleCreateProject = async (input: {
    format: VideoFormat;
    type: VideoType;
  }) => {
    abortInFlight();
    const created = await createProject(input);
    setProjects((prev) => [created, ...prev]);
    setActiveProjectId(created.id);
    setStoredActiveProjectId(created.id);
    setMessages([]);
    setCompiledByVideoId({});
  };

  const handleRenameProject = async (id: string, title: string) => {
    const updated = await updateProject(id, { title });
    setProjects((prev) =>
      prev
        .map((p) => (p.id === id ? updated : p))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    );
  };

  const handleDeleteProject = async (id: string) => {
    if (activeProjectId === id) {
      abortInFlight();
    }
    await deleteProject(id);
    const remaining = projects.filter((p) => p.id !== id);
    setProjects(remaining);

    if (activeProjectId === id) {
      const next = remaining[0] ?? null;
      setActiveProjectId(next?.id ?? null);
      setStoredActiveProjectId(next?.id ?? null);
      if (next) {
        const rawMsgs = await listMessages(next.id);
        const msgs = await normalizeInterruptedBuilds(rawMsgs);
        setMessages(msgs);
        setCompiledByVideoId(compileVideosFromMessages(msgs));
      } else {
        setMessages([]);
        setCompiledByVideoId({});
      }
    }
    showToast('Project deleted', 'info');
  };

  const handleSelectType = async (type: VideoType) => {
    setDraftType(type);
    if (!activeProject) return;
    const updated = await updateProject(activeProject.id, { type });
    setProjects((prev) =>
      prev
        .map((p) => (p.id === updated.id ? updated : p))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    );
  };

  const executeDirectorTurn = useCallback(
    async (
      targetProject: Project,
      conversationMessages: ChatMessage[],
      userPrompt: string
    ) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setThinkingStartedAt(Date.now());
      setThinkingStatusText(null);

      const latestActivePlanMsg = [...conversationMessages]
        .reverse()
        .find(
          (m): m is PlanMessage =>
            m.type === 'plan' && m.status !== 'superseded'
        );

      try {
        const result = await runDirectorTurn({
          apiKey: effectiveApiKey,
          modelName: effectiveModel,
          backupModelName: effectiveBackupModel || undefined,
          format: targetProject.format,
          projectType: targetProject.type,
          recentMessages: conversationMessages,
          currentPlan: latestActivePlanMsg ? latestActivePlanMsg.plan : null,
          userPrompt,
          signal: controller.signal,
          onStatus: (ev) => {
            if (!controller.signal.aborted) {
              setThinkingStatusText(ev ? ev.message : null);
            }
          },
          onUsage: (delta) => {
            setSessionUsage((prev) => ({
              requestsMade: prev.requestsMade + delta.requestsMade,
              promptTokens: prev.promptTokens + delta.promptTokens,
              outputTokens: prev.outputTokens + delta.outputTokens,
              thoughtTokens: (prev.thoughtTokens ?? 0) + delta.thoughtTokens,
            }));
          },
        });

        if (controller.signal.aborted) {
          return;
        }

        if (result.ok) {
          if (result.output.kind === 'reply') {
            const assistantMsg = await addMessage({
              projectId: targetProject.id,
              type: 'assistant_text',
              content: result.output.text,
            });
            if (activeProjectIdRef.current === targetProject.id) {
              setMessages((prev) => [...prev, assistantMsg]);
            }
          } else {
            const { allMessages } = await savePlanTurn({
              projectId: targetProject.id,
              format: targetProject.format,
              projectType: targetProject.type,
              message: result.output.message,
              assumptions: result.output.assumptions,
              plan: result.output.plan,
              debugInfo: result.debugInfo,
            });
            if (activeProjectIdRef.current === targetProject.id) {
              setMessages(allMessages);
            }
          }
        } else {
          const errorMsg = await addMessage({
            projectId: targetProject.id,
            type: 'error',
            summary: result.summary,
            userAction: result.userAction,
            errorKind: result.errorKind,
            needsBackupModel:
              result.errorKind === 'model_not_found' && !effectiveBackupModel,
            details: result.details,
            retryable: result.retryable,
            retryPrompt: userPrompt,
            debugInfo: result.debugInfo,
          });
          if (activeProjectIdRef.current === targetProject.id) {
            setMessages((prev) => [...prev, errorMsg]);
          }
        }

        const refreshed = await listProjects();
        setProjects(refreshed);
      } catch (err: unknown) {
        if (isAbortError(err) || controller.signal.aborted) {
          return;
        }
        const messageText = err instanceof Error ? err.message : String(err);
        const errorMsg = await addMessage({
          projectId: targetProject.id,
          type: 'error',
          summary: 'Could not reach Gemini.',
          userAction: 'Check your internet connection and retry.',
          details: messageText,
          retryable: true,
          retryPrompt: userPrompt,
        });
        if (activeProjectIdRef.current === targetProject.id) {
          setMessages((prev) => [...prev, errorMsg]);
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          setThinkingStartedAt(null);
          setThinkingStatusText(null);
        }
      }
    },
    [effectiveApiKey, effectiveBackupModel, effectiveModel]
  );

  const handleSendMessage = async (content: string): Promise<boolean> => {
    if (!effectiveApiKey) {
      return false;
    }

    if (!effectiveModel) {
      setSettingsOpen(true);
      showToast('Select a Gemini model in Settings first.', 'info');
      return false;
    }

    let targetProject = activeProject;
    const existingMessages = messages;

    if (!targetProject) {
      targetProject = await createProject({
        format: '16:9',
        type: draftType,
        title: deriveTitleFromMessage(content),
      });
      activeProjectIdRef.current = targetProject.id;
      setActiveProjectId(targetProject.id);
      setStoredActiveProjectId(targetProject.id);
      setProjects((prev) => [targetProject!, ...prev]);
    } else if (
      targetProject.title === 'Untitled video' &&
      !existingMessages.some((m) => m.type === 'user_text')
    ) {
      targetProject = await updateProject(targetProject.id, {
        title: deriveTitleFromMessage(content),
      });
    }

    const userMsg = await addMessage({
      projectId: targetProject.id,
      type: 'user_text',
      content,
    });

    const updatedHistory: ChatMessage[] = [...existingMessages, userMsg];
    setMessages(updatedHistory);

    const refreshed = await listProjects();
    setProjects(refreshed);

    // Run Director turn passing history prior to the new user prompt (which is
    // provided explicitly as NEW USER MESSAGE in the Director context).
    void executeDirectorTurn(targetProject, existingMessages, content);
    return true;
  };

  const handleRetryError = (errorMessage: ErrorMessage) => {
    if (
      !activeProject ||
      !errorMessage.retryPrompt ||
      thinkingStartedAt !== null ||
      buildingVideoMessageId !== null
    ) {
      return;
    }
    if (!effectiveModel) {
      setSettingsOpen(true);
      showToast('Select a Gemini model in Settings first.', 'info');
      return;
    }
    void executeDirectorTurn(
      activeProject,
      messages,
      errorMessage.retryPrompt
    );
  };

  const handleUpdatePlan = async (messageId: string, updatedPlan: Plan) => {
    const target = messages.find(
      (m): m is PlanMessage => m.id === messageId && m.type === 'plan'
    );
    if (!target) return;

    const updatedMessage: PlanMessage = {
      ...target,
      plan: updatedPlan,
    };
    await updateMessage(updatedMessage);
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? updatedMessage : m))
    );
    const refreshed = await listProjects();
    setProjects(refreshed);
  };

  const handleReopenPlan = async (messageId: string) => {
    const target = messages.find(
      (m): m is PlanMessage => m.id === messageId && m.type === 'plan'
    );
    if (!target) return;

    const updatedMessage: PlanMessage = {
      ...target,
      status: 'draft',
    };
    await updateMessage(updatedMessage);
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? updatedMessage : m))
    );
    const refreshed = await listProjects();
    setProjects(refreshed);
  };

  const runPreflightSelfTest = useCallback(
    async (project: Project): Promise<boolean> => {
      const outcome = await ensurePipelineSelfTest({
        probeScene: async (probeReq) => {
          if (!probeRef.current) {
            return { ok: true };
          }
          return probeRef.current.probeScene(probeReq);
        },
      });

      if (outcome.ok) {
        return true;
      }

      const errorMsg = await addMessage({
        projectId: project.id,
        type: 'error',
        summary: `Internal check failed: ${outcome.error}. No AI request was made.`,
        details: [
          `Stage: ${outcome.stage}`,
          `Error: ${outcome.error}`,
          '',
          'Self-test scene TSX:',
          outcome.source,
        ].join('\n'),
        retryable: false,
        debugInfo: {
          modelName: effectiveModel,
          usedStructuredSchema: false,
          repaired: false,
          timestamp: new Date().toISOString(),
          requestContext: {
            format: project.format,
            type: project.type,
            recentMessageCount: messages.length,
            hasCurrentPlan: true,
            userPromptChars: 0,
          },
          rawModelOutput: outcome.source,
          validationErrors: [outcome.error],
        },
      });

      if (activeProjectIdRef.current === project.id) {
        setMessages((prev) => [...prev, errorMsg]);
      }

      return false;
    },
    [effectiveModel, messages.length]
  );

  const executeVideoSceneQueue = useCallback(
    async (params: {
      projectId: string;
      planMessage: PlanMessage;
      initialVideoMessage: VideoMessage;
      sceneIdsToBuild: Set<string>;
      initialRepairContextBySceneId?: Record<
        string,
        { previousCode: string; errorMessage: string }
      >;
    }) => {
      const {
        projectId,
        planMessage,
        initialVideoMessage,
        sceneIdsToBuild,
        initialRepairContextBySceneId,
      } = params;

      const controller = new AbortController();
      videoAbortControllerRef.current = controller;
      setBuildingVideoMessageId(initialVideoMessage.id);
      setActiveVideoStatusDetail(null);
      setActiveVideoWaitStartedAt(Date.now());

      let workingVideo: VideoMessage = initialVideoMessage;
      let pausedByBusy = false;
      let pausedBusyMessage: string | undefined;

      const commitVideoState = async (
        nextVideo: VideoMessage,
        persistToDb: boolean
      ) => {
        workingVideo = nextVideo;
        if (activeProjectIdRef.current === projectId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === nextVideo.id ? nextVideo : m))
          );
        }
        if (persistToDb) {
          await updateMessage(nextVideo);
        }
      };

      const plan = planMessage.plan;
      const otherScenesSummary = plan.scenes.map((s) => ({
        name: s.name,
        motion: s.motion,
      }));

      const endOfBuildRetryIds: string[] = [];

      const applyBusyPause = async (
        targetSceneId: string,
        targetSceneName: string,
        planSceneSpecHash: string,
        result: Extract<Awaited<ReturnType<typeof buildSingleScene>>, { ok: false }>,
        candidateScopeIds: Set<string>
      ) => {
        pausedByBusy = true;
        pausedBusyMessage = result.userAction
          ? `${result.error} ${result.userAction}`
          : result.error;
        const statusNoteLabel =
          result.errorKind === 'quota_day'
            ? 'Daily quota used up'
            : result.errorKind === 'quota_minute'
              ? 'Rate limit reached'
              : result.errorKind === 'timeout' ||
                  result.errorKind === 'timeout_budget'
                ? 'Timed out'
                : 'Model overloaded';

        await commitVideoState(
          {
            ...workingVideo,
            scenes: workingVideo.scenes.map((s) => {
              if (s.sceneId === targetSceneId) {
                return {
                  ...s,
                  name: targetSceneName,
                  specHash: planSceneSpecHash,
                  status: 'pending',
                  statusNote: statusNoteLabel,
                  modelName: result.modelName,
                  tokens: s.tokens + result.tokens,
                  promptTokens: (s.promptTokens ?? 0) + result.promptTokens,
                  outputTokens: (s.outputTokens ?? 0) + result.outputTokens,
                  thoughtTokens: (s.thoughtTokens ?? 0) + result.thoughtTokens,
                  elapsedMs: s.elapsedMs + result.elapsedMs,
                  error: undefined,
                  errorKind: undefined,
                };
              }
              if (
                candidateScopeIds.has(s.sceneId) &&
                s.status !== 'ok' &&
                s.status !== 'failed'
              ) {
                return {
                  ...s,
                  status: 'pending',
                  statusNote: statusNoteLabel,
                  error: undefined,
                  errorKind: undefined,
                };
              }
              return s;
            }),
          },
          true
        );
      };

      try {
        for (let idx = 0; idx < plan.scenes.length; idx++) {
          const planScene = plan.scenes[idx];
          if (!sceneIdsToBuild.has(planScene.id)) continue;

          if (controller.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }

          setActiveVideoWaitStartedAt(Date.now());

          const initialStage = initialRepairContextBySceneId?.[planScene.id]
            ? 'repairing'
            : 'writing';

          await commitVideoState(
            {
              ...workingVideo,
              scenes: workingVideo.scenes.map((s) =>
                s.sceneId === planScene.id
                  ? {
                      ...s,
                      name: planScene.name,
                      specHash: computeSceneSpecHash(planScene),
                      status: initialStage,
                      statusNote: undefined,
                      error: undefined,
                      errorKind: undefined,
                    }
                  : s
              ),
            },
            false
          );

          const result = await buildSingleScene({
            apiKey: effectiveApiKey,
            modelName: effectiveModel,
            backupModelName: effectiveBackupModel || undefined,
            format: workingVideo.format,
            width: workingVideo.width,
            height: workingVideo.height,
            fps: workingVideo.fps,
            style: plan.style,
            scene: planScene,
            sceneIndex: idx,
            totalScenes: plan.scenes.length,
            otherScenes: otherScenesSummary,
            initialRepairContext: initialRepairContextBySceneId?.[planScene.id],
            signal: controller.signal,
            probeScene: async (probeReq) => {
              if (!probeRef.current) {
                return { ok: true };
              }
              return probeRef.current.probeScene(probeReq);
            },
            onStageChange: (stage) => {
              if (controller.signal.aborted) return;
              workingVideo = {
                ...workingVideo,
                scenes: workingVideo.scenes.map((s) =>
                  s.sceneId === planScene.id ? { ...s, status: stage } : s
                ),
              };
              if (activeProjectIdRef.current === projectId) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === workingVideo.id ? workingVideo : m
                  )
                );
              }
            },
            onStatus: (ev) => {
              if (!controller.signal.aborted) {
                setActiveVideoStatusDetail(ev ? ev.message : null);
              }
            },
            onUsage: (delta) => {
              setActiveVideoWaitStartedAt(Date.now());
              setSessionUsage((prev) => ({
                requestsMade: prev.requestsMade + delta.requestsMade,
                promptTokens: prev.promptTokens + delta.promptTokens,
                outputTokens: prev.outputTokens + delta.outputTokens,
                thoughtTokens: (prev.thoughtTokens ?? 0) + delta.thoughtTokens,
              }));
            },
          });

          setActiveVideoStatusDetail(null);

          if (result.ok) {
            setCompiledByVideoId((prev) => ({
              ...prev,
              [workingVideo.id]: {
                ...(prev[workingVideo.id] ?? {}),
                [planScene.id]: result.component,
              },
            }));

            await commitVideoState(
              {
                ...workingVideo,
                scenes: workingVideo.scenes.map((s) =>
                  s.sceneId === planScene.id
                    ? {
                        ...s,
                        name: planScene.name,
                        specHash: computeSceneSpecHash(planScene),
                        status: 'ok',
                        statusNote: undefined,
                        modelName: result.modelName,
                        code: result.code,
                        rawOutputs: result.rawOutputs,
                        attempts: result.attempts,
                        tokens: result.tokens,
                        promptTokens: result.promptTokens,
                        outputTokens: result.outputTokens,
                        thoughtTokens: result.thoughtTokens,
                        elapsedMs: result.elapsedMs,
                        error: undefined,
                        errorKind: undefined,
                      }
                    : s
                ),
              },
              true
            );
          } else if (result.transientBusy) {
            await applyBusyPause(
              planScene.id,
              planScene.name,
              computeSceneSpecHash(planScene),
              result,
              sceneIdsToBuild
            );
            break;
          } else {
            const fullSceneError = result.userAction
              ? `${result.error} ${result.userAction}`
              : result.error;
            if (isEndOfBuildRetryEligible(result.errorKind)) {
              endOfBuildRetryIds.push(planScene.id);
            }
            await commitVideoState(
              {
                ...workingVideo,
                scenes: workingVideo.scenes.map((s) =>
                  s.sceneId === planScene.id
                    ? {
                        ...s,
                        name: planScene.name,
                        specHash: computeSceneSpecHash(planScene),
                        status: 'failed',
                        statusNote: undefined,
                        modelName: result.modelName,
                        code: result.code,
                        rawOutputs: result.rawOutputs,
                        attempts: result.attempts,
                        tokens: result.tokens,
                        promptTokens: result.promptTokens,
                        outputTokens: result.outputTokens,
                        thoughtTokens: result.thoughtTokens,
                        elapsedMs: result.elapsedMs,
                        error: fullSceneError,
                        errorKind: result.errorKind,
                      }
                    : s
                ),
              },
              true
            );
          }
        }

        // End-of-build single automatic retry for scenes that failed for a
        // transient or model reason (overloaded, timeout, quota, model_not_found).
        if (
          !controller.signal.aborted &&
          !pausedByBusy &&
          endOfBuildRetryIds.length > 0
        ) {
          const retryScopeIds = new Set(endOfBuildRetryIds);
          const retryPrimaryModel = effectiveBackupModel || effectiveModel;
          const retryStatusNote = effectiveBackupModel
            ? RETRYING_ON_BACKUP_MODEL_NOTE
            : 'retrying failed scene';

          for (const retrySceneId of endOfBuildRetryIds) {
            const idx = plan.scenes.findIndex((s) => s.id === retrySceneId);
            if (idx < 0) continue;
            const planScene = plan.scenes[idx];

            if (controller.signal.aborted) {
              throw new DOMException('Aborted', 'AbortError');
            }

            setActiveVideoWaitStartedAt(Date.now());
            const existingRecord = workingVideo.scenes.find(
              (s) => s.sceneId === planScene.id
            );
            const retryStage = initialRepairContextBySceneId?.[planScene.id]
              ? 'repairing'
              : 'writing';

            await commitVideoState(
              {
                ...workingVideo,
                scenes: workingVideo.scenes.map((s) =>
                  s.sceneId === planScene.id
                    ? {
                        ...s,
                        status: retryStage,
                        statusNote: retryStatusNote,
                        error: undefined,
                        errorKind: undefined,
                      }
                    : s
                ),
              },
              false
            );

            const retryResult = await buildSingleScene({
              apiKey: effectiveApiKey,
              modelName: retryPrimaryModel,
              backupModelName: undefined,
              format: workingVideo.format,
              width: workingVideo.width,
              height: workingVideo.height,
              fps: workingVideo.fps,
              style: plan.style,
              scene: planScene,
              sceneIndex: idx,
              totalScenes: plan.scenes.length,
              otherScenes: otherScenesSummary,
              initialRepairContext: initialRepairContextBySceneId?.[planScene.id],
              signal: controller.signal,
              probeScene: async (probeReq) => {
                if (!probeRef.current) {
                  return { ok: true };
                }
                return probeRef.current.probeScene(probeReq);
              },
              onStageChange: (stage) => {
                if (controller.signal.aborted) return;
                workingVideo = {
                  ...workingVideo,
                  scenes: workingVideo.scenes.map((s) =>
                    s.sceneId === planScene.id ? { ...s, status: stage } : s
                  ),
                };
                if (activeProjectIdRef.current === projectId) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === workingVideo.id ? workingVideo : m
                    )
                  );
                }
              },
              onStatus: (ev) => {
                if (!controller.signal.aborted) {
                  setActiveVideoStatusDetail(ev ? ev.message : null);
                }
              },
              onUsage: (delta) => {
                setActiveVideoWaitStartedAt(Date.now());
                setSessionUsage((prev) => ({
                  requestsMade: prev.requestsMade + delta.requestsMade,
                  promptTokens: prev.promptTokens + delta.promptTokens,
                  outputTokens: prev.outputTokens + delta.outputTokens,
                  thoughtTokens: (prev.thoughtTokens ?? 0) + delta.thoughtTokens,
                }));
              },
            });

            setActiveVideoStatusDetail(null);

            const prevRawOutputs = existingRecord?.rawOutputs ?? [];
            const prevAttempts = existingRecord?.attempts ?? [];
            const prevTokens = existingRecord?.tokens ?? 0;
            const prevPromptTokens = existingRecord?.promptTokens ?? 0;
            const prevOutputTokens = existingRecord?.outputTokens ?? 0;
            const prevThoughtTokens = existingRecord?.thoughtTokens ?? 0;
            const prevElapsedMs = existingRecord?.elapsedMs ?? 0;

            if (retryResult.ok) {
              setCompiledByVideoId((prev) => ({
                ...prev,
                [workingVideo.id]: {
                  ...(prev[workingVideo.id] ?? {}),
                  [planScene.id]: retryResult.component,
                },
              }));

              await commitVideoState(
                {
                  ...workingVideo,
                  scenes: workingVideo.scenes.map((s) =>
                    s.sceneId === planScene.id
                      ? {
                          ...s,
                          name: planScene.name,
                          specHash: computeSceneSpecHash(planScene),
                          status: 'ok',
                          statusNote: undefined,
                          modelName: retryResult.modelName,
                          code: retryResult.code,
                          rawOutputs: [...prevRawOutputs, ...retryResult.rawOutputs],
                          attempts: [...prevAttempts, ...retryResult.attempts],
                          tokens: prevTokens + retryResult.tokens,
                          promptTokens: prevPromptTokens + retryResult.promptTokens,
                          outputTokens: prevOutputTokens + retryResult.outputTokens,
                          thoughtTokens:
                            prevThoughtTokens + retryResult.thoughtTokens,
                          elapsedMs: prevElapsedMs + retryResult.elapsedMs,
                          error: undefined,
                          errorKind: undefined,
                        }
                      : s
                  ),
                },
                true
              );
            } else if (retryResult.transientBusy) {
              await applyBusyPause(
                planScene.id,
                planScene.name,
                computeSceneSpecHash(planScene),
                retryResult,
                retryScopeIds
              );
              break;
            } else {
              const fullRetryError = retryResult.userAction
                ? `${retryResult.error} ${retryResult.userAction}`
                : retryResult.error;
              await commitVideoState(
                {
                  ...workingVideo,
                  scenes: workingVideo.scenes.map((s) =>
                    s.sceneId === planScene.id
                      ? {
                          ...s,
                          name: planScene.name,
                          specHash: computeSceneSpecHash(planScene),
                          status: 'failed',
                          statusNote: undefined,
                          modelName: retryResult.modelName,
                          code: retryResult.code || existingRecord?.code || '',
                          rawOutputs: [...prevRawOutputs, ...retryResult.rawOutputs],
                          attempts: [...prevAttempts, ...retryResult.attempts],
                          tokens: prevTokens + retryResult.tokens,
                          promptTokens: prevPromptTokens + retryResult.promptTokens,
                          outputTokens: prevOutputTokens + retryResult.outputTokens,
                          thoughtTokens:
                            prevThoughtTokens + retryResult.thoughtTokens,
                          elapsedMs: prevElapsedMs + retryResult.elapsedMs,
                          error: fullRetryError,
                          errorKind: retryResult.errorKind,
                        }
                      : s
                  ),
                },
                true
              );
            }
          }
        }
      } catch (err: unknown) {
        if (!isAbortError(err) && !controller.signal.aborted) {
          const fallbackMsg = err instanceof Error ? err.message : String(err);
          showToast(fallbackMsg, 'danger');
        }
      } finally {
        const wasAborted = controller.signal.aborted;
        const finalizedScenes: VideoSceneRecord[] = workingVideo.scenes.map(
          (scene) => {
            if (scene.status === 'ok' || scene.status === 'failed') {
              return scene;
            }
            if (wasAborted) {
              return {
                ...scene,
                status: 'pending',
                statusNote: 'Stopped',
                error: undefined,
              };
            }
            if (pausedByBusy) {
              return {
                ...scene,
                status: 'pending',
                statusNote: scene.statusNote ?? 'Paused',
                error: undefined,
              };
            }
            return {
              ...scene,
              status: 'failed',
              error: 'Scene build did not complete.',
            };
          }
        );

        let finalStatus: VideoStatus;
        let pauseReason: VideoMessage['pauseReason'] = undefined;

        if (wasAborted) {
          finalStatus = 'paused';
          pauseReason = 'stopped';
        } else if (pausedByBusy) {
          finalStatus = 'paused';
          pauseReason = 'google_busy';
        } else {
          const okCount = finalizedScenes.filter((s) => s.status === 'ok').length;
          finalStatus =
            okCount === finalizedScenes.length
              ? 'ready'
              : okCount > 0
                ? 'partial'
                : 'failed';
        }

        await commitVideoState(
          {
            ...workingVideo,
            status: finalStatus,
            pauseReason,
            pauseMessage:
              finalStatus === 'paused' && pausedByBusy
                ? pausedBusyMessage
                : undefined,
            scenes: finalizedScenes,
            finishedAt: Date.now(),
          },
          true
        );

        const refreshed = await listProjects();
        setProjects(refreshed);

        if (videoAbortControllerRef.current === controller) {
          videoAbortControllerRef.current = null;
          setBuildingVideoMessageId(null);
          setActiveVideoStatusDetail(null);
          setActiveVideoWaitStartedAt(null);
        }
      }
    },
    [effectiveApiKey, effectiveBackupModel, effectiveModel, showToast]
  );

  const handleBuildVideo = useCallback(
    async (planMessageId: string) => {
      if (!effectiveApiKey) return;
      if (!effectiveModel) {
        setSettingsOpen(true);
        showToast('Select a Gemini model in Settings first.', 'info');
        return;
      }
      if (buildingVideoMessageId !== null || thinkingStartedAt !== null) {
        return;
      }

      const planMsg = messages.find(
        (m): m is PlanMessage => m.id === planMessageId && m.type === 'plan'
      );
      if (!planMsg) return;

      const project =
        projects.find((p) => p.id === planMsg.projectId) ?? activeProject;
      if (!project) return;

      const passedSelfTest = await runPreflightSelfTest(project);
      if (!passedSelfTest) {
        return;
      }

      let workingPlanMsg = planMsg;
      if (planMsg.status !== 'approved') {
        workingPlanMsg = { ...planMsg, status: 'approved' };
        await updateMessage(workingPlanMsg);
        setMessages((prev) =>
          prev.map((m) => (m.id === planMsg.id ? workingPlanMsg : m))
        );
      }

      const previousVideo = [...messages]
        .reverse()
        .find(
          (m): m is VideoMessage =>
            m.type === 'video' &&
            m.planMessageId === workingPlanMsg.id &&
            m.status !== 'superseded'
        );

      const reusedCompiled: Record<string, CompiledComponentType> = {};
      const sceneIdsToBuild = new Set<string>();

      const initialSceneRecords: VideoSceneRecord[] =
        workingPlanMsg.plan.scenes.map((planScene) => {
          const specHash = computeSceneSpecHash(planScene);
          const prevRecord = previousVideo?.scenes.find(
            (s) => s.sceneId === planScene.id
          );
          const canReuse =
            prevRecord &&
            prevRecord.status === 'ok' &&
            prevRecord.specHash === specHash &&
            prevRecord.code.trim().length > 0;

          if (canReuse && previousVideo) {
            const compiled =
              compiledByVideoId[previousVideo.id]?.[planScene.id] ??
              (() => {
                const res = compileComponent(prevRecord.code);
                return res.ok ? res.component : undefined;
              })();

            if (compiled) {
              reusedCompiled[planScene.id] = compiled;
              return {
                ...prevRecord,
                name: planScene.name,
                specHash,
                status: 'ok',
                statusNote: undefined,
              };
            }
          }

          sceneIdsToBuild.add(planScene.id);
          return {
            sceneId: planScene.id,
            name: planScene.name,
            specHash,
            status: 'pending',
            code: '',
            attempts: [],
            tokens: 0,
            promptTokens: 0,
            outputTokens: 0,
            thoughtTokens: 0,
            elapsedMs: 0,
          };
        });

      const { width, height } = getDimensionsForFormat(project.format);

      const { createdVideoMessage, allMessages } = await saveNewVideoBuildTurn({
        projectId: project.id,
        planMessageId: workingPlanMsg.id,
        planVersion: workingPlanMsg.version,
        scenes: initialSceneRecords,
        width,
        height,
        fps: VIDEO_FPS,
        modelName: effectiveModel,
        format: project.format,
      });

      setMessages(allMessages);
      if (Object.keys(reusedCompiled).length > 0) {
        setCompiledByVideoId((prev) => ({
          ...prev,
          [createdVideoMessage.id]: reusedCompiled,
        }));
      }

      await executeVideoSceneQueue({
        projectId: project.id,
        planMessage: workingPlanMsg,
        initialVideoMessage: createdVideoMessage,
        sceneIdsToBuild,
      });
    },
    [
      activeProject,
      buildingVideoMessageId,
      compiledByVideoId,
      effectiveApiKey,
      effectiveModel,
      executeVideoSceneQueue,
      messages,
      projects,
      runPreflightSelfTest,
      showToast,
      thinkingStartedAt,
    ]
  );

  const handleResumeVideoBuild = useCallback(
    async (videoMessageId: string) => {
      if (!effectiveApiKey) return;
      if (!effectiveModel) {
        setSettingsOpen(true);
        showToast('Select a Gemini model in Settings first.', 'info');
        return;
      }
      if (buildingVideoMessageId !== null || thinkingStartedAt !== null) {
        return;
      }

      const videoMsg = messages.find(
        (m): m is VideoMessage => m.id === videoMessageId && m.type === 'video'
      );
      if (!videoMsg) return;

      const planMsg = messages.find(
        (m): m is PlanMessage =>
          m.id === videoMsg.planMessageId && m.type === 'plan'
      );
      if (!planMsg) return;

      const project =
        projects.find((p) => p.id === videoMsg.projectId) ?? activeProject;
      if (!project) return;

      const passedSelfTest = await runPreflightSelfTest(project);
      if (!passedSelfTest) {
        return;
      }

      const remainingIds = new Set(
        videoMsg.scenes
          .filter((s) => s.status !== 'ok')
          .map((s) => s.sceneId)
      );
      if (remainingIds.size === 0) return;

      const planScenesById = new Map<string, PlanScene>(
        planMsg.plan.scenes.map((s) => [s.id, s])
      );

      const resumedVideo: VideoMessage = {
        ...videoMsg,
        status: 'building',
        pauseReason: undefined,
        modelName: effectiveModel,
        startedAt: Date.now(),
        finishedAt: undefined,
        scenes: videoMsg.scenes.map((s) => {
          if (!remainingIds.has(s.sceneId)) return s;
          const live = planScenesById.get(s.sceneId);
          return {
            ...s,
            name: live ? live.name : s.name,
            specHash: live ? computeSceneSpecHash(live) : s.specHash,
            status: 'pending',
            statusNote: undefined,
            error: undefined,
          };
        }),
      };

      await updateMessage(resumedVideo);
      setMessages((prev) =>
        prev.map((m) => (m.id === resumedVideo.id ? resumedVideo : m))
      );

      await executeVideoSceneQueue({
        projectId: videoMsg.projectId,
        planMessage: planMsg,
        initialVideoMessage: resumedVideo,
        sceneIdsToBuild: remainingIds,
      });
    },
    [
      activeProject,
      buildingVideoMessageId,
      effectiveApiKey,
      effectiveModel,
      executeVideoSceneQueue,
      messages,
      projects,
      runPreflightSelfTest,
      showToast,
      thinkingStartedAt,
    ]
  );

  const handleRebuildScene = useCallback(
    async (videoMessageId: string, sceneId: string) => {
      if (!effectiveApiKey) return;
      if (!effectiveModel) {
        setSettingsOpen(true);
        showToast('Select a Gemini model in Settings first.', 'info');
        return;
      }
      if (buildingVideoMessageId !== null || thinkingStartedAt !== null) {
        return;
      }

      const videoMsg = messages.find(
        (m): m is VideoMessage => m.id === videoMessageId && m.type === 'video'
      );
      if (!videoMsg) return;

      const planMsg = messages.find(
        (m): m is PlanMessage =>
          m.id === videoMsg.planMessageId && m.type === 'plan'
      );
      if (!planMsg) return;

      const planScene = planMsg.plan.scenes.find((s) => s.id === sceneId);
      if (!planScene) return;

      const project =
        projects.find((p) => p.id === videoMsg.projectId) ?? activeProject;
      if (!project) return;

      const passedSelfTest = await runPreflightSelfTest(project);
      if (!passedSelfTest) {
        return;
      }

      const resetVideo: VideoMessage = {
        ...videoMsg,
        status: 'building',
        pauseReason: undefined,
        modelName: effectiveModel,
        startedAt: Date.now(),
        finishedAt: undefined,
        scenes: videoMsg.scenes.map((s) =>
          s.sceneId === sceneId
            ? {
                ...s,
                name: planScene.name,
                specHash: computeSceneSpecHash(planScene),
                status: 'pending',
                statusNote: undefined,
                error: undefined,
              }
            : s
        ),
      };

      await updateMessage(resetVideo);
      setMessages((prev) =>
        prev.map((m) => (m.id === resetVideo.id ? resetVideo : m))
      );

      await executeVideoSceneQueue({
        projectId: videoMsg.projectId,
        planMessage: planMsg,
        initialVideoMessage: resetVideo,
        sceneIdsToBuild: new Set([sceneId]),
      });
    },
    [
      activeProject,
      buildingVideoMessageId,
      effectiveApiKey,
      effectiveModel,
      executeVideoSceneQueue,
      messages,
      projects,
      runPreflightSelfTest,
      showToast,
      thinkingStartedAt,
    ]
  );

  const handleRetryFailedScenes = useCallback(
    async (videoMessageId: string) => {
      if (!effectiveApiKey) return;
      if (!effectiveModel) {
        setSettingsOpen(true);
        showToast('Select a Gemini model in Settings first.', 'info');
        return;
      }
      if (buildingVideoMessageId !== null || thinkingStartedAt !== null) {
        return;
      }

      const videoMsg = messages.find(
        (m): m is VideoMessage => m.id === videoMessageId && m.type === 'video'
      );
      if (!videoMsg) return;

      const planMsg = messages.find(
        (m): m is PlanMessage =>
          m.id === videoMsg.planMessageId && m.type === 'plan'
      );
      if (!planMsg) return;

      const failedIds = new Set(
        videoMsg.scenes
          .filter((s) => s.status !== 'ok')
          .map((s) => s.sceneId)
      );
      if (failedIds.size === 0) return;

      const project =
        projects.find((p) => p.id === videoMsg.projectId) ?? activeProject;
      if (!project) return;

      const passedSelfTest = await runPreflightSelfTest(project);
      if (!passedSelfTest) {
        return;
      }

      const planScenesById = new Map<string, PlanScene>(
        planMsg.plan.scenes.map((s) => [s.id, s])
      );

      const resetVideo: VideoMessage = {
        ...videoMsg,
        status: 'building',
        pauseReason: undefined,
        modelName: effectiveModel,
        startedAt: Date.now(),
        finishedAt: undefined,
        scenes: videoMsg.scenes.map((s) => {
          if (!failedIds.has(s.sceneId)) return s;
          const live = planScenesById.get(s.sceneId);
          return {
            ...s,
            name: live ? live.name : s.name,
            specHash: live ? computeSceneSpecHash(live) : s.specHash,
            status: 'pending',
            statusNote: undefined,
            error: undefined,
          };
        }),
      };

      await updateMessage(resetVideo);
      setMessages((prev) =>
        prev.map((m) => (m.id === resetVideo.id ? resetVideo : m))
      );

      await executeVideoSceneQueue({
        projectId: videoMsg.projectId,
        planMessage: planMsg,
        initialVideoMessage: resetVideo,
        sceneIdsToBuild: failedIds,
      });
    },
    [
      activeProject,
      buildingVideoMessageId,
      effectiveApiKey,
      effectiveModel,
      executeVideoSceneQueue,
      messages,
      projects,
      runPreflightSelfTest,
      showToast,
      thinkingStartedAt,
    ]
  );

  const handleRuntimeErrorDetected = useCallback(
    async (videoMessageId: string, errorMessage: string) => {
      if (buildingVideoMessageId !== null || !effectiveModel || !effectiveApiKey) {
        return;
      }

      const dedupeKey = `${videoMessageId}:${errorMessage}`;
      if (handledRuntimeErrorsRef.current.has(dedupeKey)) {
        return;
      }
      handledRuntimeErrorsRef.current.add(dedupeKey);

      const videoMsg = messages.find(
        (m): m is VideoMessage => m.id === videoMessageId && m.type === 'video'
      );
      if (!videoMsg || videoMsg.status === 'superseded') return;

      const planMsg = messages.find(
        (m): m is PlanMessage =>
          m.id === videoMsg.planMessageId && m.type === 'plan'
      );
      if (!planMsg) return;

      const compiledMap = compiledByVideoId[videoMsg.id] ?? {};
      const theme = buildSceneTheme(planMsg.plan.style);

      let targetSceneId: string | null = null;
      let targetSceneError = errorMessage;

      if (probeRef.current) {
        for (const record of videoMsg.scenes) {
          if (record.status !== 'ok') continue;
          const compiled = compiledMap[record.sceneId];
          const planScene = planMsg.plan.scenes.find(
            (s) => s.id === record.sceneId
          );
          if (!compiled || !planScene) continue;

          const probeOutcome = await probeRef.current.probeScene({
            component: compiled,
            props: {
              texts: planScene.onScreenText,
              theme,
              durationInFrames: secondsToFrames(
                planScene.durationSeconds,
                videoMsg.fps
              ),
            },
            width: videoMsg.width,
            height: videoMsg.height,
            fps: videoMsg.fps,
          });

          if (!probeOutcome.ok) {
            targetSceneId = record.sceneId;
            targetSceneError = probeOutcome.error;
            break;
          }
        }
      }

      if (!targetSceneId) {
        const firstOk = videoMsg.scenes.find((s) => s.status === 'ok');
        targetSceneId = firstOk?.sceneId ?? null;
      }
      if (!targetSceneId) return;

      const previousCode =
        videoMsg.scenes.find((s) => s.sceneId === targetSceneId)?.code ?? '';

      showToast(
        'Playback runtime error detected — repairing scene...',
        'info'
      );

      const resetVideo: VideoMessage = {
        ...videoMsg,
        status: 'building',
        pauseReason: undefined,
        startedAt: Date.now(),
        finishedAt: undefined,
        scenes: videoMsg.scenes.map((s) =>
          s.sceneId === targetSceneId
            ? {
                ...s,
                status: 'repairing',
                statusNote: undefined,
                error: undefined,
              }
            : s
        ),
      };

      await updateMessage(resetVideo);
      setMessages((prev) =>
        prev.map((m) => (m.id === resetVideo.id ? resetVideo : m))
      );

      await executeVideoSceneQueue({
        projectId: videoMsg.projectId,
        planMessage: planMsg,
        initialVideoMessage: resetVideo,
        sceneIdsToBuild: new Set([targetSceneId]),
        initialRepairContextBySceneId: {
          [targetSceneId]: {
            previousCode,
            errorMessage: targetSceneError,
          },
        },
      });
    },
    [
      buildingVideoMessageId,
      compiledByVideoId,
      effectiveApiKey,
      effectiveModel,
      executeVideoSceneQueue,
      messages,
      showToast,
    ]
  );

  const stageContext = useMemo(() => {
    const latestVideo =
      [...messages]
        .reverse()
        .find(
          (m): m is VideoMessage =>
            m.type === 'video' && m.status !== 'superseded'
        ) ?? null;

    if (!latestVideo) {
      return {
        latestVideo: null,
        linkedPlan: null,
        compiledBySceneId: {} as Record<string, CompiledComponentType>,
      };
    }

    const planMsg = messages.find(
      (m): m is PlanMessage =>
        m.id === latestVideo.planMessageId && m.type === 'plan'
    );

    return {
      latestVideo,
      linkedPlan: planMsg ? planMsg.plan : null,
      compiledBySceneId: compiledByVideoId[latestVideo.id] ?? {},
    };
  }, [compiledByVideoId, messages]);

  if (!hydrated) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-pulse rounded-full bg-surface-2" />
      </div>
    );
  }

  if (!effectiveApiKey) {
    return (
      <Onboarding
        onComplete={(result) => {
          setApiKey(result.apiKey);
          setSelectedModel(result.selectedModel);
          setModels(result.models);
        }}
      />
    );
  }

  return (
    <div
      style={vvHeight !== null ? { height: `${vvHeight}px` } : undefined}
      className="flex h-dvh w-full flex-col overflow-hidden bg-bg text-text"
    >
      {!isOnline && (
        <div
          role="status"
          className="flex shrink-0 items-center justify-center gap-2 border-b border-warning/30 bg-warning/12 px-4 py-2 text-xs text-text"
        >
          <WifiOff className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            You are offline. Local projects and saved messages continue to work.
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 w-full min-w-0 flex-col md:w-[clamp(340px,36vw,440px)] md:shrink-0 md:border-r md:border-border">
          <TopBar
            project={activeProject}
            onOpenProjects={() => setProjectsOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onRenameProject={async (newTitle) => {
              if (!activeProject) return;
              await handleRenameProject(activeProject.id, newTitle);
            }}
          />

          {loadingProjects ? (
            <div className="flex-1 space-y-3 p-4">
              <div className="h-12 animate-pulse rounded-[12px] bg-surface-2" />
              <div className="h-12 w-3/4 animate-pulse rounded-[12px] bg-surface-2" />
            </div>
          ) : (
            <ChatPanel
              project={activeProject}
              messages={messages}
              loadingMessages={loadingMessages}
              draftType={draftType}
              thinkingStartedAt={thinkingStartedAt}
              thinkingStatusText={thinkingStatusText}
              compiledByVideoId={compiledByVideoId}
              buildingVideoMessageId={buildingVideoMessageId}
              activeVideoStatusDetail={activeVideoStatusDetail}
              activeVideoWaitStartedAt={activeVideoWaitStartedAt}
              onSelectType={(type) => void handleSelectType(type)}
              onSendMessage={handleSendMessage}
              onStopThinking={abortInFlight}
              onRetryError={handleRetryError}
              onUpdatePlan={handleUpdatePlan}
              onBuildVideo={handleBuildVideo}
              onReopenPlan={handleReopenPlan}
              onStopVideoBuild={abortInFlight}
              onResumeVideoBuild={(videoId) =>
                void handleResumeVideoBuild(videoId)
              }
              onRebuildScene={(videoId, sceneId) =>
                void handleRebuildScene(videoId, sceneId)
              }
              onRetryFailedScenes={(videoId) =>
                void handleRetryFailedScenes(videoId)
              }
              onRuntimeErrorDetected={(videoId, errMsg) =>
                void handleRuntimeErrorDetected(videoId, errMsg)
              }
              hasBackupModel={Boolean(effectiveBackupModel)}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenNewVideo={() => setNewVideoOpen(true)}
            />
          )}
        </div>

        <div className="hidden min-w-0 flex-1 md:flex">
          <StagePanel
            project={activeProject}
            latestVideo={stageContext.latestVideo}
            linkedPlan={stageContext.linkedPlan}
            compiledBySceneId={stageContext.compiledBySceneId}
            activeVideoStatusDetail={activeVideoStatusDetail}
            activeVideoWaitStartedAt={activeVideoWaitStartedAt}
            onStopBuild={abortInFlight}
            onRuntimeErrorDetected={(videoId, errMsg) =>
              void handleRuntimeErrorDetected(videoId, errMsg)
            }
          />
        </div>
      </div>

      <SceneRuntimeProbe ref={probeRef} />

      <ProjectsSheet
        open={projectsOpen}
        onClose={() => setProjectsOpen(false)}
        projects={projects}
        activeProjectId={activeProjectId}
        loading={loadingProjects}
        onSelectProject={(id) => void handleSelectProject(id)}
        onOpenNewVideo={() => setNewVideoOpen(true)}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
      />

      <NewVideoSheet
        open={newVideoOpen}
        onClose={() => setNewVideoOpen(false)}
        onCreate={handleCreateProject}
      />

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        apiKey={effectiveApiKey}
        selectedModel={effectiveModel}
        backupModel={effectiveBackupModel}
        models={models}
        sessionUsage={sessionUsage}
        onResetSessionUsage={() => setSessionUsage(EMPTY_SESSION_USAGE)}
        onApiKeyUpdated={(newKey) => setApiKey(newKey)}
        onApiKeyRemoved={() => {
          abortInFlight();
          clearStoredModel();
          clearStoredBackupModel();
          setApiKey('');
          setSelectedModel('');
          setBackupModel('');
          setModels([]);
        }}
        onModelsUpdated={(nextModels, nextSelected) => {
          setModels(nextModels);
          setSelectedModel(nextSelected);
        }}
        onModelSelected={(modelName) => setSelectedModel(modelName)}
        onBackupModelSelected={(modelName) => setBackupModel(modelName)}
        onLocalDataDeleted={loadWorkspaceProjects}
      />
    </div>
  );
}

export function AppShell() {
  return (
    <ToastProvider>
      <ErrorBoundary
        resetKey="motionai-shell"
        fallback={(error, reset) => (
          <div className="flex min-h-dvh flex-col items-center justify-center bg-bg p-6 text-center text-text">
            <div className="max-w-md rounded-[16px] border border-border bg-surface-1 p-6 space-y-4">
              <h1 className="text-lg font-semibold">Something went wrong</h1>
              <p className="font-mono text-xs text-text-secondary break-words">
                {error.message}
              </p>
              <Button variant="primary" onClick={reset}>
                Reload workspace
              </Button>
            </div>
          </div>
        )}
      >
        <WorkspaceShell />
      </ErrorBoundary>
    </ToastProvider>
  );
}
