import {
  isAbortError,
  type GeminiContent,
  type GeminiRetryInfo,
  type GeminiStatusEvent,
} from '@/lib/ai/gemini-client';
import {
  GeminiRequestError,
  type GeminiErrorKind,
} from '@/lib/ai/gemini-errors';
import { callGeminiWithPolicy } from '@/lib/ai/gemini-policy';
import {
  DirectorOutputSchema,
  DURATION_LIMITS,
  extractJsonFromText,
  formatSeconds,
  formatZodErrors,
  GEMINI_DIRECTOR_RESPONSE_SCHEMA,
  getTotalDuration,
  normalizeDirectorPayload,
  roundDuration,
  validatePlanTotalDuration,
  type DirectorOutput,
} from '@/lib/ai/plan-schema';
import {
  buildDirectorContextMessage,
  buildDirectorRepairPrompt,
  buildDirectorSystemPrompt,
} from '@/lib/ai/prompts/director';
import type {
  ChatMessage,
  DebugInfo,
  GeminiUsageMetadata,
  Plan,
  PlanScene,
  VideoFormat,
  VideoType,
} from '@/lib/types';

export interface DirectorTurnInput {
  apiKey: string;
  modelName: string;
  backupModelName?: string;
  format: VideoFormat;
  projectType: VideoType;
  recentMessages: ChatMessage[];
  currentPlan: Plan | null;
  userPrompt: string;
  signal?: AbortSignal;
  onStatus?: (event: GeminiStatusEvent | null) => void;
  onRetry?: (info: GeminiRetryInfo | null) => void;
  onUsage?: (usage: {
    modelName: string;
    requestsMade: number;
    promptTokens: number;
    outputTokens: number;
    thoughtTokens: number;
  }) => void;
}

export type DirectorTurnResult =
  | {
      ok: true;
      output: DirectorOutput;
      debugInfo: DebugInfo;
    }
  | {
      ok: false;
      summary: string;
      userAction?: string;
      errorKind?: GeminiErrorKind;
      details: string;
      retryable: boolean;
      debugInfo: DebugInfo;
    };

function generateSceneId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `scene_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `scene_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function reconcileSceneIds(
  scenes: PlanScene[],
  previousPlan: Plan | null
): PlanScene[] {
  const validExistingIds = new Set(
    (previousPlan?.scenes ?? []).map((scene) => scene.id)
  );
  const seen = new Set<string>();

  return scenes.map((scene) => {
    const trimmedId = scene.id.trim();
    const shouldKeep =
      trimmedId.length > 0 &&
      trimmedId.toLowerCase() !== 'new' &&
      validExistingIds.has(trimmedId) &&
      !seen.has(trimmedId);

    let nextId = shouldKeep ? trimmedId : generateSceneId();
    while (seen.has(nextId)) {
      nextId = generateSceneId();
    }
    seen.add(nextId);

    return {
      ...scene,
      id: nextId,
      durationSeconds: roundDuration(scene.durationSeconds),
    };
  });
}

const BENGALI_DIGITS = '০১২৩৪৫৬৭৮৯';

function normalizeDigits(text: string): string {
  return text.replace(/[০-৯]/g, (d) => String(BENGALI_DIGITS.indexOf(d)));
}

function extractTargetDurationFromText(text: string): number | null {
  const normalized = normalizeDigits(text)
    // Ignore relative delta phrases like "by 2 seconds"
    .replace(
      /\b(?:by|plus|minus)\s+\d+(?:\.\d+)?\s*(?:seconds?|secs?|s(?![a-zA-Z]))/gi,
      ' '
    )
    // Ignore single-scene duration edits like "scene 2 to 3s"
    .replace(
      /(?:scene|সিন)\s*\d+\s*(?:to|at|for|=|:)?\s*\d+(?:\.\d+)?\s*(?:seconds?|secs?|s(?![a-zA-Z])|সেকেন্ড(?:ের)?)/gi,
      ' '
    );

  const regex =
    /(\d+(?:\.\d+)?)\s*(?:-|\s)*(?:seconds?|secs?|s(?![a-zA-Z])|সেকেন্ড(?:ের)?)/gi;

  let lastMatch: number | null = null;
  for (const match of normalized.matchAll(regex)) {
    const num = Number(match[1]);
    if (Number.isFinite(num) && num > 0) {
      lastMatch = roundDuration(num);
    }
  }
  return lastMatch;
}

function detectTargetDurationSeconds(
  userPrompt: string,
  recentMessages: ChatMessage[]
): number | null {
  const fromCurrent = extractTargetDurationFromText(userPrompt);
  if (fromCurrent !== null) {
    return fromCurrent;
  }

  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (msg.type === 'user_text') {
      const fromHistory = extractTargetDurationFromText(msg.content);
      if (fromHistory !== null) {
        return fromHistory;
      }
    }
  }

  return null;
}

function validateDirectorOutput(
  rawText: string,
  projectType: VideoType,
  targetDurationSeconds: number | null
):
  | { valid: true; output: DirectorOutput }
  | { valid: false; errors: string[] } {
  let parsedJson: unknown;
  try {
    parsedJson = extractJsonFromText(rawText);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid JSON output.';
    return { valid: false, errors: [`JSON parse error: ${msg}`] };
  }

  const normalizedJson = normalizeDirectorPayload(parsedJson);
  const zodResult = DirectorOutputSchema.safeParse(normalizedJson);
  if (!zodResult.success) {
    return {
      valid: false,
      errors: formatZodErrors(zodResult.error.issues),
    };
  }

  const output = zodResult.data;
  if (output.kind === 'plan') {
    const durationCheck = validatePlanTotalDuration(output.plan, projectType);
    if (!durationCheck.valid && durationCheck.error) {
      return {
        valid: false,
        errors: [durationCheck.error],
      };
    }

    if (targetDurationSeconds !== null) {
      const limits = DURATION_LIMITS[projectType];
      if (
        targetDurationSeconds >= limits.min &&
        targetDurationSeconds <= limits.max
      ) {
        const total = getTotalDuration(output.plan.scenes);
        if (Math.abs(total - targetDurationSeconds) > 1) {
          return {
            valid: false,
            errors: [
              `Total is ${formatSeconds(total)} but the user asked for ${formatSeconds(targetDurationSeconds)} (+/-1s)`,
            ],
          };
        }
      }
    }
  }

  return { valid: true, output };
}

function addUsage(
  a: GeminiUsageMetadata | undefined,
  b: GeminiUsageMetadata | undefined
): GeminiUsageMetadata | undefined {
  if (!a && !b) return undefined;
  const thoughtsTokenCount =
    (a?.thoughtsTokenCount ?? 0) + (b?.thoughtsTokenCount ?? 0);
  return {
    promptTokenCount: (a?.promptTokenCount ?? 0) + (b?.promptTokenCount ?? 0),
    candidatesTokenCount:
      (a?.candidatesTokenCount ?? 0) + (b?.candidatesTokenCount ?? 0),
    ...(thoughtsTokenCount > 0 ? { thoughtsTokenCount } : {}),
    totalTokenCount: (a?.totalTokenCount ?? 0) + (b?.totalTokenCount ?? 0),
  };
}

function truncateOutputPreview(raw: string, maxChars = 1500): string {
  const trimmed = raw.trim();
  if (!trimmed) return '(empty)';
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n... [truncated, ${trimmed.length} chars total]`;
}

export async function runDirectorTurn(
  input: DirectorTurnInput
): Promise<DirectorTurnResult> {
  const targetDurationSeconds = detectTargetDurationSeconds(
    input.userPrompt,
    input.recentMessages
  );
  const systemInstruction = buildDirectorSystemPrompt();
  const contextText = buildDirectorContextMessage({
    format: input.format,
    projectType: input.projectType,
    recentMessages: input.recentMessages,
    currentPlan: input.currentPlan,
    userPrompt: input.userPrompt,
    targetDurationSeconds,
  });

  const baseDebugContext: DebugInfo['requestContext'] = {
    format: input.format,
    type: input.projectType,
    recentMessageCount: input.recentMessages
      .filter((m) => m.type !== 'error')
      .slice(-10).length,
    hasCurrentPlan: Boolean(input.currentPlan),
    userPromptChars: input.userPrompt.length,
  };

  let totalUsage: GeminiUsageMetadata | undefined;
  let usedStructuredSchema = false;
  let rawModelOutput = '';
  let answeringModel = input.modelName;
  let usedBackupModel = false;

  const reportAttempt = (info: {
    modelName: string;
    usage?: GeminiUsageMetadata;
  }) => {
    answeringModel = info.modelName;
    input.onUsage?.({
      modelName: info.modelName,
      requestsMade: 1,
      promptTokens: info.usage?.promptTokenCount ?? 0,
      outputTokens: info.usage?.candidatesTokenCount ?? 0,
      thoughtTokens: info.usage?.thoughtsTokenCount ?? 0,
    });
  };

  const contents: GeminiContent[] = [
    {
      role: 'user',
      parts: [{ text: contextText }],
    },
  ];

  try {
    const firstCall = await callGeminiWithPolicy({
      apiKey: input.apiKey,
      modelName: input.modelName,
      backupModelName: input.backupModelName,
      systemInstruction,
      contents,
      temperature: 0.4,
      responseMimeType: 'application/json',
      responseSchema: GEMINI_DIRECTOR_RESPONSE_SCHEMA,
      signal: input.signal,
      onStatus: (ev) => input.onStatus?.(ev),
      onRetry: input.onRetry,
      onAttempt: reportAttempt,
    });

    usedStructuredSchema = firstCall.usedStructuredSchema;
    rawModelOutput = firstCall.text;
    answeringModel = firstCall.answeringModel;
    usedBackupModel = firstCall.usedBackup;
    totalUsage = addUsage(totalUsage, firstCall.usageMetadata);

    const firstValidation = validateDirectorOutput(
      firstCall.text,
      input.projectType,
      targetDurationSeconds
    );

    if (firstValidation.valid) {
      const normalizedOutput: DirectorOutput =
        firstValidation.output.kind === 'plan'
          ? {
              ...firstValidation.output,
              plan: {
                ...firstValidation.output.plan,
                scenes: reconcileSceneIds(
                  firstValidation.output.plan.scenes,
                  input.currentPlan
                ),
              },
            }
          : firstValidation.output;

      return {
        ok: true,
        output: normalizedOutput,
        debugInfo: {
          modelName: answeringModel,
          requestedModelName: input.modelName,
          usedBackupModel,
          usedStructuredSchema,
          repaired: false,
          timestamp: new Date().toISOString(),
          requestContext: baseDebugContext,
          rawModelOutput,
          usageMetadata: totalUsage,
        },
      };
    }

    // One automatic repair call if JSON or schema/duration validation failed
    if (input.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    input.onRetry?.(null);
    input.onStatus?.(null);

    const repairPrompt = buildDirectorRepairPrompt({
      projectType: input.projectType,
      invalidOutput: firstCall.text,
      validationErrors: firstValidation.errors,
    });

    const repairCall = await callGeminiWithPolicy({
      apiKey: input.apiKey,
      modelName: input.modelName,
      backupModelName: input.backupModelName,
      systemInstruction,
      contents: [
        ...contents,
        { role: 'model', parts: [{ text: firstCall.text }] },
        { role: 'user', parts: [{ text: repairPrompt }] },
      ],
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: GEMINI_DIRECTOR_RESPONSE_SCHEMA,
      signal: input.signal,
      onStatus: (ev) => input.onStatus?.(ev),
      onRetry: input.onRetry,
      onAttempt: reportAttempt,
    });

    usedStructuredSchema =
      usedStructuredSchema && repairCall.usedStructuredSchema;
    answeringModel = repairCall.answeringModel;
    usedBackupModel = usedBackupModel || repairCall.usedBackup;
    totalUsage = addUsage(totalUsage, repairCall.usageMetadata);

    const repairValidation = validateDirectorOutput(
      repairCall.text,
      input.projectType,
      targetDurationSeconds
    );

    if (repairValidation.valid) {
      const normalizedOutput: DirectorOutput =
        repairValidation.output.kind === 'plan'
          ? {
              ...repairValidation.output,
              plan: {
                ...repairValidation.output.plan,
                scenes: reconcileSceneIds(
                  repairValidation.output.plan.scenes,
                  input.currentPlan
                ),
              },
            }
          : repairValidation.output;

      return {
        ok: true,
        output: normalizedOutput,
        debugInfo: {
          modelName: answeringModel,
          requestedModelName: input.modelName,
          usedBackupModel,
          usedStructuredSchema,
          repaired: true,
          timestamp: new Date().toISOString(),
          requestContext: baseDebugContext,
          rawModelOutput,
          repairModelOutput: repairCall.text,
          validationErrors: firstValidation.errors,
          usageMetadata: totalUsage,
        },
      };
    }

    return {
      ok: false,
      summary: 'The AI returned an invalid plan format after a repair attempt.',
      userAction: 'Try rephrasing your request or click Retry.',
      details: [
        'Initial validation errors:',
        ...firstValidation.errors.map((e) => `• ${e}`),
        '',
        'Repair validation errors:',
        ...repairValidation.errors.map((e) => `• ${e}`),
        '',
        'Raw model output (first 1500 chars):',
        truncateOutputPreview(firstCall.text, 1500),
        '',
        'Repair model output (first 1500 chars):',
        truncateOutputPreview(repairCall.text, 1500),
      ].join('\n'),
      retryable: true,
      debugInfo: {
        modelName: answeringModel,
        requestedModelName: input.modelName,
        usedBackupModel,
        usedStructuredSchema,
        repaired: true,
        timestamp: new Date().toISOString(),
        requestContext: baseDebugContext,
        rawModelOutput,
        repairModelOutput: repairCall.text,
        validationErrors: [
          ...firstValidation.errors,
          ...repairValidation.errors,
        ],
        usageMetadata: totalUsage,
      },
    };
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw err;
    }

    if (err instanceof GeminiRequestError) {
      return {
        ok: false,
        summary: err.message,
        userAction: err.userAction,
        errorKind: err.kind,
        details: `${err.explanation}\n\n${err.rawDetails}`,
        retryable: err.retryable || err.kind === 'timeout_budget',
        debugInfo: {
          modelName: answeringModel,
          requestedModelName: input.modelName,
          usedBackupModel,
          usedStructuredSchema,
          repaired: false,
          timestamp: new Date().toISOString(),
          requestContext: baseDebugContext,
          rawModelOutput: rawModelOutput || undefined,
          validationErrors: [err.explanation],
          usageMetadata: totalUsage,
        },
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      summary: 'Unexpected error while calling Gemini.',
      userAction: 'Try again or check Details for more information.',
      errorKind: 'unknown',
      details: message,
      retryable: true,
      debugInfo: {
        modelName: answeringModel,
        requestedModelName: input.modelName,
        usedBackupModel,
        usedStructuredSchema,
        repaired: false,
        timestamp: new Date().toISOString(),
        requestContext: baseDebugContext,
        rawModelOutput: rawModelOutput || undefined,
        validationErrors: [message],
        usageMetadata: totalUsage,
      },
    };
  }
}
