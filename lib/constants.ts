import type { VideoFormat, VideoType } from './types';

export const APP_NAME = 'MotionAI';
export const APP_VERSION = '0.1.0';

export const GEMINI_API_KEY_STORAGE = 'phase0_gemini_api_key';
export const GEMINI_MODEL_STORAGE = 'motionai_selected_model';
export const GEMINI_BACKUP_MODEL_STORAGE = 'motionai_backup_model';
export const DAILY_REQUEST_LIMITS_STORAGE = 'motionai_daily_request_limits';
export const THEME_STORAGE = 'motionai_theme';
export const EXPORT_MODE_STORAGE = 'motionai_export_mode';
export const ACTIVE_PROJECT_STORAGE = 'motionai_active_project_id';

export const GOOGLE_AI_STUDIO_KEY_URL = 'https://aistudio.google.com/apikey';
export const GOOGLE_AI_STUDIO_RATE_LIMIT_URL = 'https://aistudio.google.com/rate-limit';

export const VIDEO_FORMATS: ReadonlyArray<{
  value: VideoFormat;
  label: string;
  description: string;
  aspectWidth: number;
  aspectHeight: number;
}> = [
  {
    value: '9:16',
    label: 'Portrait',
    description: 'Reels, Shorts, TikTok',
    aspectWidth: 9,
    aspectHeight: 16,
  },
  {
    value: '16:9',
    label: 'Landscape',
    description: 'YouTube, Desktop, Decks',
    aspectWidth: 16,
    aspectHeight: 9,
  },
  {
    value: '1:1',
    label: 'Square',
    description: 'Feeds, LinkedIn, Embeds',
    aspectWidth: 1,
    aspectHeight: 1,
  },
];

export const VIDEO_TYPES: ReadonlyArray<VideoType> = [
  'Explainer',
  'Title',
  'Lower third',
  'Short ad',
];

export const SYSTEM_NOTICE_PHASE1 =
  'Video building arrives in the next update. Your messages are saved.';
