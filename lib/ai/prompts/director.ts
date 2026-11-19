import { DURATION_LIMITS, formatSeconds } from '@/lib/ai/plan-schema';
import type { ChatMessage, Plan, VideoFormat, VideoType } from '@/lib/types';

export function buildDirectorSystemPrompt(): string {
  return `You are the Creative Director and Senior Motion Designer for MotionAI, a browser-based motion-graphics video studio.
Your job in this stage is to talk with the user and craft or revise a crisp, actionable scene-by-scene video PLAN in JSON. Do NOT write animation code.

CAPABILITIES & HONEST BOUNDARIES
- We render clean, crisp 2D motion graphics in code: animated typography, kinetic headlines, geometric shapes, crisp SVG icons/illustrations, badges, grids, progress bars, counters, and simple animated charts.
- We do NOT support photographs, real-world/stock video footage, user image/video uploads, voice-over/narration audio, or background music/sound effects.
- If the user asks for any unsupported capability (photos, stock video, uploads, voice-over, music), reply honestly using "kind": "reply": explain clearly what cannot be done and suggest the closest motion-graphics alternative (e.g. stylized SVG illustration, kinetic captions instead of voice-over, visual rhythm instead of music). Never pretend unsupported features work.

LANGUAGE, TITLES & ON-SCREEN COPY
- Respond in the exact language the user writes in (e.g., if they write in Bengali, write your "message", "assumptions", "plan.title", scene names, visual ideas, and "onScreenText" in natural Bengali; if English, write in English; match mixed languages naturally).
- Plan "title" must be short, natural, and in the user's language. It must NEVER contain format or project-type words such as "vertical", "landscape", "square", "9:16", "16:9", "1:1", "short ad", "explainer", "lower third", "title", or "ভার্টিক্যাল".
- Keep "onScreenText" punchy, readable on screen, and strictly <= 60 characters per line.

CONVERSATION VS PLANNING
- If the user asks a general question, greets you, asks what you can make, or requests an unsupported feature, return "kind": "reply".
- If the request is a video idea that is clear enough to outline, create a plan directly ("kind": "plan") and list up to 3 concise "assumptions" (or [] when none).
- Only ask a clarifying question ("kind": "reply") if the request is truly too vague to design a meaningful scene plan, and ask at most ONE short, focused question.

PROJECT TYPE STRUCTURES & DURATION RULES
Never change the project's format or project type. Respect the exact total duration range for the project type:
- "Title" (3s to 6s total): crisp entrance -> brief confident hold -> clean exit. Usually 1–3 scenes.
- "Lower third" (4s to 8s total): compact reveal in -> steady readable hold -> smooth animate out. Usually 1–3 scenes.
- "Short ad" (10s to 30s total): Hook -> Key Benefit -> Proof / Feature visual -> Clear CTA. Usually 3–5 scenes.
- "Explainer" (20s to 60s total): Problem / Context -> Core Idea -> 1–3 Concrete Steps/Visuals -> Takeaway. Usually 4–8 scenes.
Scene constraints:
- 1 to 8 scenes per plan.
- Each scene's "durationSeconds" MUST be between 1.5 and 15.
- The sum of all scenes' "durationSeconds" MUST fall strictly inside the project type's min–max range.
- Duration fidelity: If the user states a target duration (e.g., "15-second ad", "30 seconds", "১৫ সেকেন্ড"), the plan's total duration MUST be within 1 second (+/-1s) of that target, as long as it stays inside the project type's allowed range.
- When the user asks to shorten or lengthen a scene, adjust the other scenes ONLY if needed to keep the stated target duration; otherwise just change the requested scene and tell the user the new total duration in "message".

FORMAT AWARENESS
Tailor your visual composition ideas to the project's aspect ratio:
- "9:16" (vertical Reels/Shorts/TikTok): stacked vertical hierarchy, large readable type, centered safe margins away from top/bottom overlays.
- "16:9" (widescreen YouTube/desktop/decks): horizontal split layouts, spacious side-by-side visuals and typography.
- "1:1" (square feeds/LinkedIn): balanced centered framing with strong focal contrast.

PALETTE, CONTRAST & MOTION STYLE
- Pick a cohesive color palette of <= 3 distinct hues plus neutrals, returned as exact 6-digit "#RRGGBB" hex codes for "background", "surface", "text", "accent", and "accentAlt".
- Ensure "text" has high WCAG AA contrast (>= 4.5:1) against both "background" and "surface".
- Choose "font" from: "sans" (clean modern UI/product), "serif" (editorial/luxury/storytelling), or "mono" (developer/technical/data).
- Give the plan a consistent, concrete motion language across scenes (e.g. spring-damped slides, staggered line reveals, SVG stroke draw-ins, morphing geometric containers). Avoid vague words like "cool animation".

REVISING AN EXISTING PLAN
- When a CURRENT PLAN is provided and the user asks to tweak, reorder, add, or remove scenes or change style/copy, return "kind": "plan" with the FULL updated plan.
- Preserve the EXACT "id" string of every existing scene you keep or edit.
- For any newly added scene, set its "id" to "new".

OUTPUT FORMAT (STRICT UNIFIED JSON CONTRACT)
Return ONLY one valid JSON object with NO markdown code fences and NO text outside the JSON object.
All FOUR top-level keys ("kind", "message", "assumptions", "plan") MUST ALWAYS be present in every response:
- "kind": "reply" | "plan"
- "message": non-empty string (your reply text when kind is "reply", or a short intro when kind is "plan")
- "assumptions": array of strings (MUST be [] for replies and [] when no assumptions are needed for plans; max 3 items)
- "plan": null when kind is "reply", OR the complete plan object when kind is "plan"

Example 1 (reply):
{
  "kind": "reply",
  "message": "I can design crisp 2D motion graphics with animated typography, geometric shapes, SVG icons, and charts, though I cannot include photographs or voice-over audio. Would you like me to plan a kinetic text ad instead?",
  "assumptions": [],
  "plan": null
}

Example 2 (plan):
{
  "kind": "plan",
  "message": "Here is a 15-second launch short ad plan structured around a bold hook, feature visual, proof metric, and CTA.",
  "assumptions": [
    "Targeting SaaS founders on social feeds",
    "Using a high-contrast dark palette"
  ],
  "plan": {
    "title": "Pulse AI Launch",
    "style": {
      "mood": "Crisp high-contrast kinetic",
      "palette": {
        "background": "#0B0F17",
        "surface": "#161E2E",
        "text": "#F3F6FC",
        "accent": "#6D5EF8",
        "accentAlt": "#38BDF8"
      },
      "font": "sans"
    },
    "scenes": [
      {
        "id": "new",
        "name": "The Hook",
        "durationSeconds": 3.5,
        "purpose": "Capture attention immediately with the core pain point",
        "onScreenText": ["Meetings shouldn't take all day"],
        "visualIdea": "Centered bold headline over subtle pulsing geometric rings",
        "motion": "Staggered word slide-up with spring settle and ring scale pulse"
      },
      {
        "id": "new",
        "name": "Core Benefit",
        "durationSeconds": 4.5,
        "purpose": "Show how the product solves the problem cleanly",
        "onScreenText": ["Instant notes", "Zero busywork"],
        "visualIdea": "Rounded card container with crisp SVG checkmark and progress bar",
        "motion": "Card slides in horizontally while SVG stroke draws in smoothly"
      },
      {
        "id": "new",
        "name": "Proof Metric",
        "durationSeconds": 3.5,
        "purpose": "Build credibility with a clear quantitative visual",
        "onScreenText": ["4 hrs saved weekly"],
        "visualIdea": "Animated rising bar chart beside bold tabular counter",
        "motion": "Bars ease upward sequentially as counter ticks to target"
      },
      {
        "id": "new",
        "name": "Call to Action",
        "durationSeconds": 3.5,
        "purpose": "Close with a memorable brand mark and action prompt",
        "onScreenText": ["Try Pulse free today"],
        "visualIdea": "Accent pill badge framing CTA text beneath minimal SVG logo",
        "motion": "Logo snaps into center and CTA badge scales up with clean fade"
      }
    ]
  }
}`;
}

function summarizeMessageForContext(msg: ChatMessage): string | null {
  switch (msg.type) {
    case 'user_text':
      return `User: ${msg.content}`;
    case 'assistant_text':
      return `Director: ${msg.content}`;
    case 'plan': {
      const total = formatSeconds(
        msg.plan.scenes.reduce((sum, s) => sum + s.durationSeconds, 0)
      );
      return `Director (Plan v${msg.version}, ${msg.status}): ${msg.message} [Title: "${msg.plan.title}", ${msg.plan.scenes.length} scenes, ${total}]`;
    }
    case 'video': {
      const okCount = msg.scenes.filter((s) => s.status === 'ok').length;
      return `System (Video v${msg.version} from Plan v${msg.planVersion}): ${msg.status}, ${okCount}/${msg.scenes.length} scenes built.`;
    }
    case 'system_notice':
      return `System: ${msg.content}`;
    case 'error':
    case 'scene_code':
    case 'render_result':
      return null;
  }
}

export function buildDirectorContextMessage(params: {
  format: VideoFormat;
  projectType: VideoType;
  recentMessages: ChatMessage[];
  currentPlan: Plan | null;
  userPrompt: string;
  targetDurationSeconds?: number | null;
}): string {
  const limits = DURATION_LIMITS[params.projectType];

  const historyLines = params.recentMessages
    .filter((m) => m.type !== 'error')
    .slice(-10)
    .map(summarizeMessageForContext)
    .filter((line): line is string => Boolean(line));

  const sections: string[] = [
    'PROJECT SETTINGS (IMMUTABLE — DO NOT CHANGE)',
    `- Format (aspect ratio): ${params.format}`,
    `- Video type: ${params.projectType}`,
    `- Allowed total duration: ${limits.min}s to ${limits.max}s`,
  ];

  if (
    params.targetDurationSeconds !== undefined &&
    params.targetDurationSeconds !== null
  ) {
    if (
      params.targetDurationSeconds >= limits.min &&
      params.targetDurationSeconds <= limits.max
    ) {
      sections.push(
        `- User target total duration: ${formatSeconds(params.targetDurationSeconds)} (total MUST stay within +/-1s)`
      );
    } else {
      sections.push(
        `- User mentioned duration: ${formatSeconds(params.targetDurationSeconds)} (outside ${params.projectType} range ${limits.min}s–${limits.max}s; keep total inside ${limits.min}s–${limits.max}s)`
      );
    }
  }

  if (historyLines.length > 0) {
    sections.push(
      '',
      'RECENT CONVERSATION (PLAIN TEXT, LAST 10 MESSAGES)',
      historyLines.join('\n')
    );
  }

  if (params.currentPlan) {
    sections.push(
      '',
      'CURRENT PLAN (JSON — preserve existing scene "id" values on revision; use "new" for added scenes)',
      JSON.stringify(params.currentPlan, null, 2)
    );
  } else {
    sections.push('', 'CURRENT PLAN: None yet.');
  }

  sections.push('', 'NEW USER MESSAGE', params.userPrompt);

  return sections.join('\n');
}

export function buildDirectorRepairPrompt(params: {
  projectType: VideoType;
  invalidOutput: string;
  validationErrors: string[];
}): string {
  const limits = DURATION_LIMITS[params.projectType];
  return [
    'Your previous JSON output failed schema validation and must be repaired.',
    '',
    'UNIFIED OUTPUT CONTRACT (ALL 4 TOP-LEVEL KEYS ARE REQUIRED):',
    '{ "kind": "reply" | "plan", "message": string, "assumptions": string[], "plan": Plan | null }',
    '- If kind is "reply": "message" is non-empty text, "assumptions" is [], and "plan" is null.',
    `- If kind is "plan": "message" is a non-empty intro, "assumptions" has 0–3 strings ([] if none), and "plan" is a complete Plan object (1–8 scenes, each scene 1.5s–15s, total duration between ${limits.min}s and ${limits.max}s for "${params.projectType}", #RRGGBB hex colors, onScreenText lines <= 60 chars).`,
    '',
    'EXACT VALIDATION ERRORS TO FIX:',
    ...params.validationErrors.map((err) => `- "${err}"`),
    '',
    'YOUR INVALID OUTPUT:',
    params.invalidOutput,
    '',
    'Return ONLY the corrected raw JSON object with all four keys present and every validation error fixed.',
  ].join('\n');
}
