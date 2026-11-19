import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  ChatMessage,
  DebugInfo,
  NewChatMessage,
  Plan,
  PlanMessage,
  Project,
  VideoFormat,
  VideoMessage,
  VideoSceneRecord,
  VideoType,
} from './types';

export interface UsageLedgerRecord {
  id?: number;
  timestamp: number;
  model: string;
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  ok: boolean;
}

interface MotionAIDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { 'by-updatedAt': number };
  };
  messages: {
    key: string;
    value: ChatMessage;
    indexes: { 'by-projectId': string };
  };
  usage_ledger: {
    key: number;
    value: UsageLedgerRecord;
    indexes: { 'by-timestamp': number };
  };
}

const DB_NAME = 'motionai_db';
const DB_VERSION = 5;

let dbPromise: Promise<IDBPDatabase<MotionAIDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<MotionAIDB>> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is only available in the browser.'));
  }
  if (!dbPromise) {
    dbPromise = openDB<MotionAIDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('projects')) {
            const projectStore = db.createObjectStore('projects', {
              keyPath: 'id',
            });
            projectStore.createIndex('by-updatedAt', 'updatedAt');
          }
          if (!db.objectStoreNames.contains('messages')) {
            const messageStore = db.createObjectStore('messages', {
              keyPath: 'id',
            });
            messageStore.createIndex('by-projectId', 'projectId');
          }
        }
        // Version 2 extends the ChatMessage discriminated union with plan and error
        // variants stored inside the existing 'messages' store; existing Phase 1
        // projects and messages remain intact without destructive migration.
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('projects')) {
            const projectStore = db.createObjectStore('projects', {
              keyPath: 'id',
            });
            projectStore.createIndex('by-updatedAt', 'updatedAt');
          }
          if (!db.objectStoreNames.contains('messages')) {
            const messageStore = db.createObjectStore('messages', {
              keyPath: 'id',
            });
            messageStore.createIndex('by-projectId', 'projectId');
          }
        }
        // Version 3 extends ChatMessage with 'video' build state records in the
        // existing 'messages' store; existing Phase 1 & 2-A data survives intact.
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('projects')) {
            const projectStore = db.createObjectStore('projects', {
              keyPath: 'id',
            });
            projectStore.createIndex('by-updatedAt', 'updatedAt');
          }
          if (!db.objectStoreNames.contains('messages')) {
            const messageStore = db.createObjectStore('messages', {
              keyPath: 'id',
            });
            messageStore.createIndex('by-projectId', 'projectId');
          }
        }
        // Version 4 adds 'paused' status, pauseReason, statusNote, and detailed token
        // breakdowns inside existing 'video' records without touching existing data.
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains('projects')) {
            const projectStore = db.createObjectStore('projects', {
              keyPath: 'id',
            });
            projectStore.createIndex('by-updatedAt', 'updatedAt');
          }
          if (!db.objectStoreNames.contains('messages')) {
            const messageStore = db.createObjectStore('messages', {
              keyPath: 'id',
            });
            messageStore.createIndex('by-projectId', 'projectId');
          }
        }
        // Version 5 adds the 'usage_ledger' object store for per-HTTP-request
        // daily quota tracking while keeping all existing projects and messages intact.
        if (oldVersion < 5) {
          if (!db.objectStoreNames.contains('usage_ledger')) {
            const ledgerStore = db.createObjectStore('usage_ledger', {
              keyPath: 'id',
              autoIncrement: true,
            });
            ledgerStore.createIndex('by-timestamp', 'timestamp');
          }
        }
      },
    });
  }
  return dbPromise;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function deriveTitleFromMessage(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'Untitled video';
  const words = cleaned.split(' ').slice(0, 6);
  const candidate = words.join(' ');
  if (candidate.length <= 42) {
    return candidate;
  }
  return `${candidate.slice(0, 39).trimEnd()}...`;
}

export async function listProjects(): Promise<Project[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('projects', 'by-updatedAt');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getDb();
  return db.get('projects', id);
}

export async function createProject(input: {
  format: VideoFormat;
  type: VideoType;
  title?: string;
}): Promise<Project> {
  const db = await getDb();
  const now = Date.now();
  const project: Project = {
    id: createId(),
    title: input.title?.trim() || 'Untitled video',
    format: input.format,
    type: input.type,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('projects', project);
  return project;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<Project, 'title' | 'format' | 'type' | 'updatedAt'>>
): Promise<Project> {
  const db = await getDb();
  const existing = await db.get('projects', id);
  if (!existing) {
    throw new Error('Project not found.');
  }
  const updated: Project = {
    ...existing,
    ...patch,
    title: patch.title !== undefined ? patch.title.trim() || 'Untitled video' : existing.title,
    updatedAt: patch.updatedAt ?? Date.now(),
  };
  await db.put('projects', updated);
  return updated;
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['projects', 'messages'], 'readwrite');
  const msgIndex = tx.objectStore('messages').index('by-projectId');
  const msgKeys = await msgIndex.getAllKeys(id);
  for (const key of msgKeys) {
    await tx.objectStore('messages').delete(key);
  }
  await tx.objectStore('projects').delete(id);
  await tx.done;
}

export async function listMessages(projectId: string): Promise<ChatMessage[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('messages', 'by-projectId', projectId);
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function addMessage(input: NewChatMessage): Promise<ChatMessage> {
  const db = await getDb();
  const message = {
    ...input,
    id: input.id ?? createId(),
    createdAt: input.createdAt ?? Date.now(),
  } as ChatMessage;

  const tx = db.transaction(['messages', 'projects'], 'readwrite');
  await tx.objectStore('messages').put(message);

  const project = await tx.objectStore('projects').get(message.projectId);
  if (project) {
    await tx.objectStore('projects').put({
      ...project,
      updatedAt: message.createdAt,
    });
  }
  await tx.done;
  return message;
}

export async function updateMessage(message: ChatMessage): Promise<ChatMessage> {
  const db = await getDb();
  const now = Date.now();
  const tx = db.transaction(['messages', 'projects'], 'readwrite');
  await tx.objectStore('messages').put(message);

  const project = await tx.objectStore('projects').get(message.projectId);
  if (project) {
    await tx.objectStore('projects').put({
      ...project,
      updatedAt: now,
    });
  }
  await tx.done;
  return message;
}

export async function savePlanTurn(input: {
  projectId: string;
  format: VideoFormat;
  projectType: VideoType;
  message: string;
  assumptions: string[];
  plan: Plan;
  debugInfo?: DebugInfo;
}): Promise<{
  createdPlanMessage: PlanMessage;
  allMessages: ChatMessage[];
}> {
  const db = await getDb();
  const now = Date.now();
  const tx = db.transaction(['messages', 'projects'], 'readwrite');
  const msgStore = tx.objectStore('messages');
  const existing = await msgStore.index('by-projectId').getAll(input.projectId);

  let maxVersion = 0;
  for (const msg of existing) {
    if (msg.type === 'plan') {
      if (msg.version > maxVersion) {
        maxVersion = msg.version;
      }
      if (msg.status !== 'superseded') {
        const superseded: PlanMessage = {
          ...msg,
          status: 'superseded',
        };
        await msgStore.put(superseded);
      }
    }
  }

  const createdPlanMessage: PlanMessage = {
    id: createId(),
    projectId: input.projectId,
    createdAt: now,
    type: 'plan',
    version: maxVersion + 1,
    status: 'draft',
    message: input.message,
    assumptions: input.assumptions,
    plan: input.plan,
    format: input.format,
    projectType: input.projectType,
    debugInfo: input.debugInfo,
  };

  await msgStore.put(createdPlanMessage);

  const project = await tx.objectStore('projects').get(input.projectId);
  if (project) {
    await tx.objectStore('projects').put({
      ...project,
      updatedAt: now,
    });
  }

  const updatedRows = await msgStore.index('by-projectId').getAll(input.projectId);
  await tx.done;

  return {
    createdPlanMessage,
    allMessages: updatedRows.sort((a, b) => a.createdAt - b.createdAt),
  };
}

export async function saveNewVideoBuildTurn(input: {
  projectId: string;
  planMessageId: string;
  planVersion: number;
  scenes: VideoSceneRecord[];
  width: number;
  height: number;
  fps: number;
  modelName: string;
  format: VideoFormat;
}): Promise<{
  createdVideoMessage: VideoMessage;
  allMessages: ChatMessage[];
}> {
  const db = await getDb();
  const now = Date.now();
  const tx = db.transaction(['messages', 'projects'], 'readwrite');
  const msgStore = tx.objectStore('messages');
  const existing = await msgStore.index('by-projectId').getAll(input.projectId);

  let maxVersion = 0;
  for (const msg of existing) {
    if (msg.type === 'video') {
      if (msg.version > maxVersion) {
        maxVersion = msg.version;
      }
      if (msg.status !== 'superseded') {
        const superseded: VideoMessage = {
          ...msg,
          status: 'superseded',
        };
        await msgStore.put(superseded);
      }
    }
  }

  const createdVideoMessage: VideoMessage = {
    id: createId(),
    projectId: input.projectId,
    createdAt: now,
    type: 'video',
    version: maxVersion + 1,
    planMessageId: input.planMessageId,
    planVersion: input.planVersion,
    status: 'building',
    scenes: input.scenes,
    width: input.width,
    height: input.height,
    fps: input.fps,
    modelName: input.modelName,
    format: input.format,
    startedAt: now,
  };

  await msgStore.put(createdVideoMessage);

  const project = await tx.objectStore('projects').get(input.projectId);
  if (project) {
    await tx.objectStore('projects').put({
      ...project,
      updatedAt: now,
    });
  }

  const updatedRows = await msgStore.index('by-projectId').getAll(input.projectId);
  await tx.done;

  return {
    createdVideoMessage,
    allMessages: updatedRows.sort((a, b) => a.createdAt - b.createdAt),
  };
}

export async function getDataCounts(): Promise<{
  projectCount: number;
  messageCount: number;
}> {
  const db = await getDb();
  const [projectCount, messageCount] = await Promise.all([
    db.count('projects'),
    db.count('messages'),
  ]);
  return { projectCount, messageCount };
}

export async function deleteAllLocalData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['projects', 'messages'], 'readwrite');
  await tx.objectStore('messages').clear();
  await tx.objectStore('projects').clear();
  await tx.done;
}

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diffSeconds = Math.round((timestamp - now) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (absSeconds < 45) {
    return rtf.format(0, 'second');
  }
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, 'minute');
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour');
  }
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return rtf.format(diffDays, 'day');
  }
  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return rtf.format(diffMonths, 'month');
  }
  const diffYears = Math.round(diffDays / 365);
  return rtf.format(diffYears, 'year');
}
