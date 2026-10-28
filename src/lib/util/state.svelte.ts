import { defaultState } from '$/constants';
import type { ErrorHash, MarkerData, State, ValidatedState } from '$/types';
import { resolve } from '$app/paths';
import { debounce } from 'lodash-es';
import type { MermaidConfig } from 'mermaid';
import { untrack } from 'svelte';
import {
  extractErrorLineText,
  findMostRelevantLineNumber,
  replaceLineNumberInErrorMessage
} from './errorHandling';
import { darkVariantOf, getDefaultTheme, isManagedTheme, parse } from './mermaid';
import { persisted, readJSON, writeJSON } from './persist.svelte';
import {
  normalizeThemePreferences,
  resolveDiagramTheme,
  type DiagramMode,
  type DiagramThemeId
} from './diagramThemes';
import { deserializeState, serializeState } from './serde';
import { formatJSON } from './util';

export { defaultState };

const urlParseFailedState = `flowchart TD
    A[无法读取图表链接] --> B[请检查链接是否完整]
    B --> C[也可以打开历史记录恢复本机图表]`;

const CODE_STORE_KEY = 'codeStore';
const themePreferenceStore = persisted<unknown>('diagramThemePreferences', {});
export const themePreferences = {
  get current() {
    return normalizeThemePreferences(themePreferenceStore.value);
  }
};

// The single mutable input state; only update() below may write to it.
// The fallback is cloned so mutations never write through to defaultState.
const input = $state<State>(readJSON(CODE_STORE_KEY, { ...defaultState }));

// inputState is shared externally when exporting via URL, History, etc.
// It is reactive for reads; the read-only type keeps writes inside this
// module, where update() persists and re-validates every change.
export const inputState: Readonly<State> = input;

// Pending file reads must not overwrite a later edit or document replacement.
let codeRevision = 0;
export const getCodeRevision = (): number => codeRevision;

const validatedStateOf = (state: State, serialized: string): ValidatedState => ({
  ...state,
  editorMode: state.editorMode ?? 'code',
  error: undefined,
  errorMarkers: [],
  serialized
});

const initialState = $state.snapshot(input) as State;
// Only ever replaced wholesale, so raw (shallow) reactivity is enough.
let validatedCurrent = $state.raw<ValidatedState>(
  validatedStateOf(initialState, serializeState(initialState))
);

let lastDiagramType = '';

const processState = async (state: State) => {
  const processed = validatedStateOf(state, '');
  // No changes should be done to fields part of `state`.
  try {
    processed.serialized = serializeState(state);
    const { diagramType } = await parse(state.code);
    processed.diagramType = diagramType;
    if (lastDiagramType === 'zenuml' && diagramType !== lastDiagramType) {
      // Temp Hack to refresh page after displaying ZenUML.
      setTimeout(() => window.location.reload(), 500);
    }
    lastDiagramType = diagramType;
    const config: unknown = JSON.parse(state.mermaid);
    if (!config || typeof config !== 'object' || Array.isArray(config))
      throw new Error('渲染配置必须是 JSON 对象');
  } catch (error) {
    processed.error = error as Error;
    console.error(error);
    if (error && typeof error === 'object' && 'hash' in error) {
      try {
        let errorString = processed.error.toString();
        const errorLineText = extractErrorLineText(errorString);
        const realLineNumber = findMostRelevantLineNumber(errorLineText, state.code);

        let first_line: number, last_line: number, first_column: number, last_column: number;
        try {
          ({ first_line, last_line, first_column, last_column } = (error.hash as ErrorHash).loc);
        } catch {
          const lineNo = findMostRelevantLineNumber(errorString, state.code);
          first_line = lineNo;
          last_line = lineNo + 1;
          first_column = 0;
          last_column = 0;
        }

        if (realLineNumber !== -1) {
          errorString = replaceLineNumberInErrorMessage(errorString, realLineNumber);
        }

        processed.error = new Error(errorString);
        const marker: MarkerData = {
          endColumn: last_column + (first_column === last_column ? 0 : 5),
          endLineNumber: last_line + (realLineNumber - first_line),
          message: errorString || 'Syntax error',
          severity: 8, // Error
          startColumn: first_column,
          startLineNumber: realLineNumber
        };
        processed.errorMarkers = [marker];
      } catch (error) {
        console.error('Error without line helper', error);
      }
    }
  }
  return processed;
};

// Replaces the old URL-hash store subscription; assigned by initURLSubscription.
let updateHash: ((serialized: string) => void) | undefined;
let processingRevision = 0;

// Persist the current input state and asynchronously re-validate it,
// publishing the result to `validatedState` (and the URL hash, once
// initURLSubscription has run). Only called from update(), which suppresses
// dependency tracking.
const persistAndProcess = (): void => {
  const revision = ++processingRevision;
  const snapshot = $state.snapshot(input) as State;
  writeJSON(CODE_STORE_KEY, snapshot);
  void processState(snapshot).then((processed) => {
    if (revision !== processingRevision) return;
    validatedCurrent = processed;
    updateHash?.(processed.serialized);
    syncManagedTheme(processed.diagramType);
  });
};

// The single mutation gateway: every update function funnels its writes
// through here. The mutator runs untracked so effects that call an update
// function never subscribe to the input state it reads, and the trailing
// persist + re-validate cannot be forgotten by a new update function.
const update = (mutate: (state: State) => void): void => {
  untrack(() => {
    mutate(input);
    persistAndProcess();
  });
};

// All internal reads should be done via validatedState, but it should not be
// persisted/shared externally.
export const validatedState = {
  get current(): ValidatedState {
    return validatedCurrent;
  }
};

const urlsCurrent = $derived({
  new: `${resolve('/edit', {})}#${serializeState(defaultState)}`,
  view: `${resolve('/view', {})}#${validatedCurrent.serialized}`
});

export const urls = {
  get current() {
    return urlsCurrent;
  }
};

export const loadState = (data: string): void => {
  console.log(`Loading '${data}'`);
  update((state) => {
    let next: State;
    try {
      next = deserializeState(data);
      next.mermaid ||= defaultState.mermaid;
    } catch (error) {
      next = $state.snapshot(state) as State;
      if (data) {
        console.error('Init error', error);
        next.code = urlParseFailedState;
        next.mermaid = defaultState.mermaid;
      }
    }
    applyPartial(state, next);
  });
};

let renderCount = 0;
const applyPartial = (state: State, newState: Partial<State>): void => {
  if (newState.code !== undefined) codeRevision++;
  renderCount++;
  Object.assign(state, newState, { renderCount });
};

export const updateCodeStore = (newState: Partial<State>): void => {
  update((state) => applyPartial(state, newState));
};

export const updateCode = (
  code: string,
  {
    updateDiagram = false,
    resetPanZoom = false
  }: { updateDiagram?: boolean; resetPanZoom?: boolean } = {}
): void => {
  update((state) => {
    codeRevision++;
    if (resetPanZoom) {
      state.pan = undefined;
      state.zoom = undefined;
    }
    state.code = code;
    state.updateDiagram = updateDiagram;
  });
};

export const updateConfig = (config: string): void => {
  updateCodeStore({ mermaid: config });
};

let siteDark = false;
let manageAppearance = true;

// The editor manages the diagram theme unless the user picked one of their
// own. A missing theme, mermaid's global default, a config section's default
// or any of their dark variants (see isManagedTheme) is replaced by the
// current diagram type's default, or its dark counterpart while the site is
// dark. Runs after every validation, since the diagram type may have changed,
// and whenever the site mode changes. Converges after one update: the next
// validation finds the theme already in place. Reads are untracked so an
// effect calling toggleDarkTheme does not subscribe to the input state.
const syncManagedTheme = (diagramType: string | undefined): void => {
  if (!diagramType || !manageAppearance) {
    return;
  }
  untrack(() => {
    let config: MermaidConfig;
    try {
      config = JSON.parse(input.mermaid) as MermaidConfig;
    } catch {
      return;
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) return;
    const preferences = themePreferences.current;
    if (preferences.enabled) {
      const mode = siteDark ? 'dark' : 'light';
      const next = resolveDiagramTheme(config, preferences[mode], mode, diagramType);
      if (JSON.stringify(config) !== JSON.stringify(next)) updateConfig(formatJSON(next));
      return;
    }
    if (!isManagedTheme(config.theme)) {
      return;
    }
    const defaultTheme = getDefaultTheme(diagramType);
    const theme = siteDark ? darkVariantOf(defaultTheme) : defaultTheme;
    if (config.theme === theme) {
      return;
    }
    update((state) => {
      state.mermaid = formatJSON({ ...config, theme });
    });
  });
};

export const toggleDarkTheme = (dark: boolean, manage = true): void => {
  siteDark = dark;
  manageAppearance = manage;
  syncManagedTheme(untrack(() => validatedCurrent.diagramType));
};

export const selectDiagramTheme = (mode: DiagramMode, id: DiagramThemeId): void => {
  let config: MermaidConfig;
  try {
    config = JSON.parse(input.mermaid) as MermaidConfig;
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error();
  } catch {
    throw new Error('请先修复渲染配置，再选择主题');
  }
  siteDark = mode === 'dark';
  themePreferenceStore.value = { ...themePreferences.current, enabled: true, [mode]: id };
  updateConfig(
    formatJSON(
      resolveDiagramTheme(config, id, mode, validatedCurrent.diagramType ?? 'flowchart-v2')
    )
  );
};

const isOnlyDefaultTheme = (config: string): boolean => {
  try {
    const parsed: unknown = JSON.parse(config);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      Object.keys(parsed).length === 1 &&
      (parsed as MermaidConfig).theme === 'default'
    );
  } catch {
    return false;
  }
};

// One-time migration (registered in migrations.svelte.ts): before mermaid 12
// every install was seeded with `{ "theme": "default" }`. A config that still
// only pins that value is cleared so mermaid's own defaults apply. Any other
// config is the user's and is left alone. Goes through updateConfig because
// the input state was already read from localStorage when this runs.
export const clearDefaultThemeConfig = (): void => {
  if (isOnlyDefaultTheme(inputState.mermaid)) {
    updateConfig(formatJSON({}));
  }
};

// Replaces the whole input state (e.g. when restoring a history entry),
// dropping keys the next state does not define.
export const replaceInputState = (next: State): void => {
  update((state) => {
    codeRevision++;
    for (const key of Object.keys(state)) {
      if (!(key in next)) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- full-replace semantics
        delete (state as unknown as Record<string, unknown>)[key];
      }
    }
    Object.assign(state, next);
  });
};

export const initURLSubscription = (): void => {
  updateHash = debounce((serialized: string) => {
    history.replaceState(undefined, '', `#${serialized}`);
  }, 250);
  updateHash(validatedCurrent.serialized);
};

export const verifyState = (): void => {
  update((state) => applyPartial(state, state.panZoom ? {} : { panZoom: true }));
};
