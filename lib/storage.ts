import {
  ACTIVE_PROJECT_STORAGE,
  DAILY_REQUEST_LIMITS_STORAGE,
  EXPORT_MODE_STORAGE,
  GEMINI_API_KEY_STORAGE,
  GEMINI_BACKUP_MODEL_STORAGE,
  GEMINI_MODEL_STORAGE,
  THEME_STORAGE,
} from './constants';
import type { ExportMode, ThemePreference } from './types';

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function removeStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

export function normalizeModelStorageKey(modelName: string): string {
  return modelName.trim().replace(/^models\//i, '').toLowerCase();
}

export function getStoredApiKey(): string {
  return readStorage(GEMINI_API_KEY_STORAGE)?.trim() ?? '';
}

export function setStoredApiKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) {
    removeStorage(GEMINI_API_KEY_STORAGE);
    return;
  }
  writeStorage(GEMINI_API_KEY_STORAGE, trimmed);
}

export function clearStoredApiKey(): void {
  removeStorage(GEMINI_API_KEY_STORAGE);
}

export function getStoredModel(): string {
  return readStorage(GEMINI_MODEL_STORAGE)?.trim() ?? '';
}

export function setStoredModel(modelName: string): void {
  const trimmed = modelName.trim();
  if (!trimmed) {
    removeStorage(GEMINI_MODEL_STORAGE);
    return;
  }
  writeStorage(GEMINI_MODEL_STORAGE, trimmed);
}

export function clearStoredModel(): void {
  removeStorage(GEMINI_MODEL_STORAGE);
}

export function getStoredBackupModel(): string {
  return readStorage(GEMINI_BACKUP_MODEL_STORAGE)?.trim() ?? '';
}

export function setStoredBackupModel(modelName: string): void {
  const trimmed = modelName.trim();
  if (!trimmed) {
    removeStorage(GEMINI_BACKUP_MODEL_STORAGE);
    return;
  }
  writeStorage(GEMINI_BACKUP_MODEL_STORAGE, trimmed);
}

export function clearStoredBackupModel(): void {
  removeStorage(GEMINI_BACKUP_MODEL_STORAGE);
}

export function getStoredDailyRequestLimits(): Record<string, number> {
  const raw = readStorage(DAILY_REQUEST_LIMITS_STORAGE);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        result[normalizeModelStorageKey(k)] = Math.floor(v);
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function getStoredDailyRequestLimit(modelName: string): number | undefined {
  const key = normalizeModelStorageKey(modelName);
  if (!key) return undefined;
  const limits = getStoredDailyRequestLimits();
  return limits[key];
}

export function setStoredDailyRequestLimit(
  modelName: string,
  limit: number | null
): Record<string, number> {
  const key = normalizeModelStorageKey(modelName);
  const current = getStoredDailyRequestLimits();
  if (!key) return current;

  if (limit === null || !Number.isFinite(limit) || limit <= 0) {
    delete current[key];
  } else {
    current[key] = Math.floor(limit);
  }

  if (Object.keys(current).length === 0) {
    removeStorage(DAILY_REQUEST_LIMITS_STORAGE);
  } else {
    writeStorage(DAILY_REQUEST_LIMITS_STORAGE, JSON.stringify(current));
  }
  return current;
}

export function getStoredTheme(): ThemePreference {
  const raw = readStorage(THEME_STORAGE);
  if (raw === 'system' || raw === 'dark' || raw === 'light') {
    return raw;
  }
  return 'dark';
}

export function setStoredTheme(theme: ThemePreference): void {
  writeStorage(THEME_STORAGE, theme);
}

export function getStoredExportMode(): ExportMode {
  const raw = readStorage(EXPORT_MODE_STORAGE);
  if (raw === 'standard' || raw === 'compatibility') {
    return raw;
  }
  return 'standard';
}

export function setStoredExportMode(mode: ExportMode): void {
  writeStorage(EXPORT_MODE_STORAGE, mode);
}

export function getStoredActiveProjectId(): string | null {
  return readStorage(ACTIVE_PROJECT_STORAGE);
}

export function setStoredActiveProjectId(id: string | null): void {
  if (!id) {
    removeStorage(ACTIVE_PROJECT_STORAGE);
    return;
  }
  writeStorage(ACTIVE_PROJECT_STORAGE, id);
}
