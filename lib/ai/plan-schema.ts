import { z } from 'zod';
import type { Plan, PlanScene, VideoType } from '@/lib/types';

export const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

export const DURATION_LIMITS: Record<VideoType, { min: number; max: number }> = {
  Title: { min: 3, max: 6 },
  'Lower third': { min: 4, max: 8 },
  'Short ad': { min: 10, max: 30 },
  Explainer: { min: 20, max: 60 },
};

export const PlanPaletteSchema = z.object({
  background: z
    .string()
    .trim()
    .regex(HEX_COLOR_REGEX, 'background must be a #RRGGBB hex color'),
  surface: z
    .string()
    .trim()
    .regex(HEX_COLOR_REGEX, 'surface must be a #RRGGBB hex color'),
  text: z
    .string()
    .trim()
    .regex(HEX_COLOR_REGEX, 'text must be a #RRGGBB hex color'),
  accent: z
    .string()
    .trim()
    .regex(HEX_COLOR_REGEX, 'accent must be a #RRGGBB hex color'),
  accentAlt: z
    .string()
    .trim()
    .regex(HEX_COLOR_REGEX, 'accentAlt must be a #RRGGBB hex color'),
});

export const PlanStyleSchema = z.object({
  mood: z.string().trim().min(1, 'style.mood is required').max(100),
  palette: PlanPaletteSchema,
  font: z.enum(['sans', 'serif', 'mono']),
});

export const PlanSceneSchema = z.object({
  id: z.string().trim().min(1, 'scene.id is required').max(64),
  name: z.string().trim().min(1, 'scene.name is required').max(80),
  durationSeconds: z
    .number()
    .finite()
    .min(1.5, 'scene duration must be at least 1.5s')
    .max(15, 'scene duration must be at most 15s'),
  purpose: z.string().trim().min(1, 'scene.purpose is required').max(200),
  onScreenText: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'onScreenText lines cannot be empty')
        .max(60, 'each onScreenText line must be 60 characters or fewer')
    )
    .max(6, 'onScreenText can have at most 6 lines'),
  visualIdea: z.string().trim().min(1, 'scene.visualIdea is required').max(280),
  motion: z.string().trim().min(1, 'scene.motion is required').max(220),
});

export const PlanSchema = z.object({
  title: z.string().trim().min(1, 'plan.title is required').max(100),
  style: PlanStyleSchema,
  scenes: z
    .array(PlanSceneSchema)
    .min(1, 'plan must have at least 1 scene')
    .max(8, 'plan can have at most 8 scenes'),
});

export type DirectorOutput =
  | { kind: 'reply'; text: string }
  | { kind: 'plan'; message: string; assumptions: string[]; plan: Plan };

export const UnifiedDirectorPayloadSchema = z
  .object({
    kind: z.enum(['reply', 'plan']),
    message: z.string().trim().min(1, 'message must not be empty'),
    assumptions: z
      .array(z.string().trim().min(1))
      .max(3, 'assumptions can have at most 3 items'),
    plan: PlanSchema.nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === 'plan' && val.plan === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['plan'],
        message: 'plan is required (must not be null) when kind is "plan"',
      });
    }
    if (val.kind === 'reply' && val.message.trim().length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['message'],
        message: 'message must not be empty when kind is "reply"',
      });
    }
  })
  .transform<DirectorOutput>((val) => {
    if (val.kind === 'reply') {
      return {
        kind: 'reply',
        text: val.message,
      };
    }
    return {
      kind: 'plan',
      message: val.message,
      assumptions: val.assumptions,
      plan: val.plan as Plan,
    };
  });

export const DirectorOutputSchema = UnifiedDirectorPayloadSchema;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Small defensive normalizer applied to parsed JSON BEFORE Zod validation.
 * Covers only the four expected edge cases while keeping everything else strict:
 * 1. Top-level object that looks like a Plan (title, style, scenes) -> wrapped as kind: "plan".
 * 2. Missing "assumptions" -> [].
 * 3. A "reply" with "text" and no "message" -> uses "text" as "message".
 * 4. A missing "plan" key on a "reply" -> null.
 */
export function normalizeDirectorPayload(raw: unknown): unknown {
  if (!isPlainRecord(raw)) {
    return raw;
  }

  if (
    !('kind' in raw) &&
    'title' in raw &&
    'style' in raw &&
    'scenes' in raw
  ) {
    return {
      kind: 'plan',
      message: 'Here is a scene plan.',
      assumptions: [],
      plan: raw,
    };
  }

  const copy: Record<string, unknown> = { ...raw };

  if (copy.assumptions === undefined) {
    copy.assumptions = [];
  }

  if (copy.kind === 'reply') {
    const hasMessage =
      typeof copy.message === 'string' && copy.message.trim().length > 0;
    if (
      !hasMessage &&
      typeof copy.text === 'string' &&
      copy.text.trim().length > 0
    ) {
      copy.message = copy.text;
    }
    if (!('plan' in copy) || copy.plan === undefined) {
      copy.plan = null;
    }
  }

  return copy;
}

export function roundDuration(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}

export function getTotalDuration(
  scenes: ReadonlyArray<Pick<PlanScene, 'durationSeconds'>>
): number {
  const sum = scenes.reduce((acc, s) => acc + s.durationSeconds, 0);
  return roundDuration(sum);
}

export function formatSeconds(seconds: number): string {
  const rounded = roundDuration(seconds);
  return Number.isInteger(rounded) ? `${rounded}s` : `${rounded.toFixed(1)}s`;
}

export function validatePlanTotalDuration(
  plan: Pick<Plan, 'scenes'>,
  projectType: VideoType
): {
  valid: boolean;
  totalDuration: number;
  min: number;
  max: number;
  error?: string;
} {
  const limits = DURATION_LIMITS[projectType];
  const totalDuration = getTotalDuration(plan.scenes);
  if (totalDuration < limits.min || totalDuration > limits.max) {
    return {
      valid: false,
      totalDuration,
      min: limits.min,
      max: limits.max,
      error: `Total duration is ${formatSeconds(totalDuration)}, but ${projectType} plans must be between ${limits.min}s and ${limits.max}s.`,
    };
  }
  return {
    valid: true,
    totalDuration,
    min: limits.min,
    max: limits.max,
  };
}

export function formatZodErrors(issues: z.ZodError['issues']): string[] {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
    return `${path}: ${issue.message}`;
  });
}

export function extractJsonFromText(rawText: string): unknown {
  let candidate = rawText.trim();

  // Strip fenced markdown blocks if a model emitted them despite instructions
  const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    candidate = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(candidate);
  } catch {
    // Attempt to locate the first balanced JSON object inside the text
    const start = candidate.indexOf('{');
    if (start === -1) {
      throw new SyntaxError('No JSON object found in model output.');
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < candidate.length; i++) {
      const ch = candidate[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const slice = candidate.slice(start, i + 1);
          return JSON.parse(slice);
        }
      }
    }

    throw new SyntaxError('Incomplete or malformed JSON object in model output.');
  }
}

// Unified Gemini OpenAPI 3.0 responseSchema.
// All four top-level keys are required; "plan" uses nullable: true per the
// Gemini REST generateContent OpenAPI subset specification.
export const GEMINI_DIRECTOR_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  required: ['kind', 'message', 'assumptions', 'plan'],
  properties: {
    kind: {
      type: 'STRING',
      enum: ['reply', 'plan'],
      nullable: false,
    },
    message: {
      type: 'STRING',
      nullable: false,
    },
    assumptions: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      nullable: false,
    },
    plan: {
      type: 'OBJECT',
      nullable: true,
      required: ['title', 'style', 'scenes'],
      properties: {
        title: { type: 'STRING', nullable: false },
        style: {
          type: 'OBJECT',
          nullable: false,
          required: ['mood', 'palette', 'font'],
          properties: {
            mood: { type: 'STRING', nullable: false },
            font: {
              type: 'STRING',
              enum: ['sans', 'serif', 'mono'],
              nullable: false,
            },
            palette: {
              type: 'OBJECT',
              nullable: false,
              required: ['background', 'surface', 'text', 'accent', 'accentAlt'],
              properties: {
                background: { type: 'STRING', nullable: false },
                surface: { type: 'STRING', nullable: false },
                text: { type: 'STRING', nullable: false },
                accent: { type: 'STRING', nullable: false },
                accentAlt: { type: 'STRING', nullable: false },
              },
            },
          },
        },
        scenes: {
          type: 'ARRAY',
          nullable: false,
          items: {
            type: 'OBJECT',
            required: [
              'id',
              'name',
              'durationSeconds',
              'purpose',
              'onScreenText',
              'visualIdea',
              'motion',
            ],
            properties: {
              id: { type: 'STRING', nullable: false },
              name: { type: 'STRING', nullable: false },
              durationSeconds: { type: 'NUMBER', nullable: false },
              purpose: { type: 'STRING', nullable: false },
              onScreenText: {
                type: 'ARRAY',
                nullable: false,
                items: { type: 'STRING' },
              },
              visualIdea: { type: 'STRING', nullable: false },
              motion: { type: 'STRING', nullable: false },
            },
          },
        },
      },
    },
  },
};
