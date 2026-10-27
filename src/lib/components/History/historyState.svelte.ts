import type { HistoryEntry, HistoryType, State } from '$lib/types';
import { persisted, readJSON, type Persisted } from '$lib/util/persist.svelte';
import { inputState } from '$lib/util/state.svelte';

import { v4 as uuidV4 } from 'uuid';

const MAX_AUTO_HISTORY_LENGTH = 30;
const AUTO_SAVE_INTERVAL = 60_000;

const auto = persisted<HistoryEntry[]>('autoHistoryStore', []);
const manual = persisted<HistoryEntry[]>('manualHistoryStore', []);
const mode = persisted<HistoryType>('autoHistoryMode', 'manual');

// Loader entries are in-memory, so a persisted 'loader' mode is empty after reload.
if (!['auto', 'manual'].includes(mode.value)) {
  mode.value = 'manual';
}

const slotFor = (m: HistoryType): Persisted<HistoryEntry[]> => (m === 'auto' ? auto : manual);

export const historyState = {
  get entries(): HistoryEntry[] {
    return slotFor(mode.value).value;
  },
  get mode(): HistoryType {
    return mode.value;
  }
};

export const setMode = (next: HistoryType): void => {
  mode.value = next;
};

// Dedup key: only the fields that define the diagram, so volatile/view-only
// fields (renderCount, pan/zoom, …) don't count as a change.
export const stateKey = (state: State): string =>
  JSON.stringify({ code: state.code, mermaid: state.mermaid });

const createEntry = (state: State, type: 'auto' | 'manual'): HistoryEntry => ({
  id: uuidV4(),
  name: `图表 ${new Date().toLocaleString('zh-CN')}`,
  state,
  time: Date.now(),
  type
});

// Returns true if added, false if it duplicated the most recent entry.
const addEntry = (
  slot: Persisted<HistoryEntry[]>,
  state: State,
  type: 'auto' | 'manual',
  maxLength?: number
): boolean => {
  const entries = slot.value;
  if (entries.length > 0 && stateKey(entries[0].state) === stateKey(state)) {
    return false;
  }
  const trimmed =
    maxLength && entries.length >= maxLength ? entries.slice(0, maxLength - 1) : entries;
  slot.value = [createEntry(state, type), ...trimmed];

  return true;
};

export const addManualEntry = (state: State): boolean => addEntry(manual, state, 'manual');

export const addAutoEntry = (state: State): boolean =>
  addEntry(auto, state, 'auto', MAX_AUTO_HISTORY_LENGTH);

export const removeEntry = (id: string): void => {
  const slot = slotFor(mode.value);
  slot.value = slot.value.filter((entry) => entry.id !== id);
};

export const renameEntry = (id: string, name: string): void => {
  const trimmed = name.trim();
  const slot = slotFor(mode.value);
  if (!trimmed) {
    return;
  }
  slot.value = slot.value.map((entry) => (entry.id === id ? { ...entry, name: trimmed } : entry));
};

export const clearActive = (): void => {
  const slot = slotFor(mode.value);
  slot.value = [];
};

const validateEntry = (entry: unknown): entry is HistoryEntry => {
  if (!entry || typeof entry !== 'object') return false;
  const value = entry as Partial<HistoryEntry>;
  return (
    (value.type === 'auto' || value.type === 'manual') &&
    typeof value.time === 'number' &&
    Number.isFinite(value.time) &&
    typeof value.state?.code === 'string' &&
    typeof value.state.mermaid === 'string' &&
    (value.id === undefined || typeof value.id === 'string')
  );
};

export interface RestoreResult {
  restored: number;
  invalid: number;
  duplicates: number;
}

// Routes each uploaded entry to the store matching its own type, skipping ids
// that already exist.
export const restoreEntries = (data: unknown): RestoreResult => {
  if (!Array.isArray(data)) throw new Error('历史备份必须是列表');
  const valid = data.filter(validateEntry);
  const invalid = data.length - valid.length;
  let restored = 0;

  const slots: [HistoryType, Persisted<HistoryEntry[]>][] = [
    ['auto', auto],
    ['manual', manual]
  ];
  for (const [type, slot] of slots) {
    const incoming = valid.filter((entry) => entry.type === type);
    if (incoming.length === 0) {
      continue;
    }
    const existingIDs = slot.value.map(({ id }) => id);
    const fresh = incoming
      .map((entry) => ({ ...entry, id: entry.id || uuidV4() }))
      .filter(({ id }) => {
        if (existingIDs.includes(id)) return false;
        existingIDs.push(id);
        return true;
      });
    restored += fresh.length;
    slot.value = [...slot.value, ...fresh].sort((a, b) => b.time - a.time);
  }

  const duplicates = valid.length - restored;

  return { restored, invalid, duplicates };
};

const setIDs = (entries: HistoryEntry[]): HistoryEntry[] =>
  entries.map((entry) => (entry.id ? entry : { ...entry, id: uuidV4() }));

// One-time migration: re-reads localStorage so entries written by an older
// version get ids, then persists and updates the reactive state.
export const injectHistoryIDs = (): void => {
  auto.value = setIDs(readJSON<HistoryEntry[]>('autoHistoryStore', []));
  manual.value = setIDs(readJSON<HistoryEntry[]>('manualHistoryStore', []));
};

let autoSaveTimer: ReturnType<typeof setInterval> | undefined;

// Idempotent; returns the stop function for use as a lifecycle cleanup.
export const startAutoSave = (): (() => void) => {
  if (autoSaveTimer === undefined) {
    autoSaveTimer = setInterval(
      () => addAutoEntry($state.snapshot(inputState)),
      AUTO_SAVE_INTERVAL
    );
  }
  return stopAutoSave;
};

export const stopAutoSave = (): void => {
  if (autoSaveTimer !== undefined) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = undefined;
  }
};
