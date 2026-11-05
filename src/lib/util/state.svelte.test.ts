import type { State } from '$lib/types';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as mermaidUtil from './mermaid';
import { deserializeState } from './serde';
import {
  clearDefaultThemeConfig,
  defaultState,
  getCodeRevision,
  inputState,
  loadState,
  replaceInputState,
  toggleDarkTheme,
  updateCode,
  updateCodeStore,
  updateConfig,
  validatedState,
  verifyState
} from './state.svelte';

// Runs `body` inside an effect and reports how often the effect (re-)runs.
const countEffectRuns = (body: () => void): { runs: () => number; stop: () => void } => {
  let runs = 0;
  const stop = $effect.root(() => {
    $effect(() => {
      runs++;
      body();
    });
  });
  flushSync();
  return { runs: () => runs, stop };
};

const readStoredState = (): State =>
  JSON.parse(window.localStorage.getItem('codeStore') ?? '{}') as State;

describe('update functions called from effects', () => {
  // Effects that call an update function must not subscribe to the input
  // state the function reads, or unrelated state changes re-fire the effect
  // (and self-reads loop, e.g. the dark-theme effect in +layout.svelte).
  const cases: [string, () => void][] = [
    ['updateCodeStore', () => updateCodeStore({})],
    ['updateCode', () => updateCode('graph TD\n inside-effect')],
    ['updateConfig', () => updateConfig('{"theme":"default"}')],
    ['toggleDarkTheme', () => toggleDarkTheme(false)],
    ['replaceInputState', () => replaceInputState({ ...defaultState })],
    ['verifyState', () => verifyState()],
    ['loadState', () => loadState('')]
  ];

  it.each(cases)('%s does not make the calling effect track input state', (_name, call) => {
    const counter = countEffectRuns(call);
    try {
      expect(counter.runs()).toBe(1);
      updateCode('graph TD\n external-change');
      updateConfig('{"theme":"forest"}');
      updateCodeStore({ pan: { x: 1, y: 2 } });
      flushSync();
      expect(counter.runs()).toBe(1);
    } finally {
      counter.stop();
    }
  });
});

describe('update functions persist input state', () => {
  it('updateCode writes the new code to localStorage', () => {
    updateCode('graph TD\n persisted-by-test');
    expect(readStoredState().code).toBe('graph TD\n persisted-by-test');
  });

  it('updateCodeStore merges partial state and persists it', () => {
    updateCodeStore({ rough: true });
    expect(inputState.rough).toBe(true);
    expect(readStoredState().rough).toBe(true);
  });

  it('replaceInputState drops keys absent from the next state and persists', () => {
    updateCodeStore({ pan: { x: 1, y: 2 } });
    expect(inputState.pan).toEqual({ x: 1, y: 2 });
    replaceInputState({ ...defaultState });
    expect(inputState.pan).toBeUndefined();
    expect(readStoredState().pan).toBeUndefined();
    expect(readStoredState().code).toBe(defaultState.code);
  });

  it('verifyState forces panZoom back on', () => {
    updateCodeStore({ panZoom: false });
    verifyState();
    expect(inputState.panZoom).toBe(true);
    expect(readStoredState().panZoom).toBe(true);
  });
});

it('notifies viewport invalidation even for same-code replacement, but not pan updates', () => {
  const counter = countEffectRuns(() => getCodeRevision());
  try {
    updateCodeStore({ pan: { x: 1, y: 2 }, zoom: 2 });
    flushSync();
    expect(counter.runs()).toBe(1);
    replaceInputState({ ...inputState });
    flushSync();
    expect(counter.runs()).toBe(2);
  } finally {
    counter.stop();
  }
});

describe('default config', () => {
  it('ships an empty mermaid config so mermaid picks its own theme, look and layout', () => {
    expect(defaultState.mermaid).toBe('{}');
  });
});

// Validation (mermaid.parse) is asynchronous; these helpers wait for it.
const themeOf = () => (JSON.parse(inputState.mermaid) as { theme?: string }).theme;
const waitForTheme = (theme: string | undefined) =>
  vi.waitFor(() => expect(themeOf()).toBe(theme), { timeout: 10_000 });
const settled = () =>
  vi.waitFor(
    () => {
      expect(validatedState.current.code).toBe(inputState.code);
      expect(validatedState.current.mermaid).toBe(inputState.mermaid);
    },
    { timeout: 10_000 }
  );

const flowchart = 'graph TD\n  A[Managed] --> B[Theme]';
const pie = 'pie\n  "A": 1\n  "B": 2';
const slow = { timeout: 15_000 };

describe('viewport updates reuse content validation', () => {
  beforeEach(async () => {
    toggleDarkTheme(false, false);
    replaceInputState({ ...defaultState, code: flowchart, mermaid: '{"theme":"forest"}' });
    await settled();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    toggleDarkTheme(false);
  });

  it('keeps the latest viewport in storage and links without parsing again', async () => {
    const parse = vi.spyOn(mermaidUtil, 'parse');
    for (let i = 1; i <= 10; i++) {
      updateCodeStore({ pan: { x: i * 10, y: -i }, zoom: i / 2 });
    }
    await vi.waitFor(() => expect(validatedState.current.zoom).toBe(5));
    expect(parse).not.toHaveBeenCalled();
    expect(validatedState.current).toMatchObject({
      diagramType: 'flowchart-v2',
      pan: { x: 100, y: -10 },
      zoom: 5
    });
    expect(deserializeState(validatedState.current.serialized)).toEqual(readStoredState());

    replaceInputState({ ...defaultState, code: flowchart, mermaid: inputState.mermaid });
    await vi.waitFor(() => expect(validatedState.current.pan).toBeUndefined());
    expect(validatedState.current.zoom).toBeUndefined();
    expect(deserializeState(validatedState.current.serialized)).toEqual(readStoredState());
    expect(parse).not.toHaveBeenCalled();
  });

  it('shares pending validation and publishes the latest view state', async () => {
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof mermaidUtil.parse>>>();
    const parse = vi.spyOn(mermaidUtil, 'parse').mockReturnValue(pending.promise);
    const code = 'flowchart TD\n Pending --> Validation';
    updateCode(code);
    updateCodeStore({ pan: { x: 30, y: 40 }, zoom: 2, editorMode: 'config', grid: false });
    pending.resolve({ diagramType: 'flowchart-v2', config: {} });
    await settled();
    expect(parse).toHaveBeenCalledExactlyOnceWith(code);
    expect(validatedState.current).toMatchObject({
      code,
      editorMode: 'config',
      grid: false,
      pan: { x: 30, y: 40 },
      zoom: 2
    });
    expect(deserializeState(validatedState.current.serialized)).toEqual(readStoredState());
  });

  it('validates again when either code or configuration changes', async () => {
    const parse = vi.spyOn(mermaidUtil, 'parse');
    updateCode(pie);
    await settled();
    expect(parse).toHaveBeenCalledExactlyOnceWith(pie);
    expect(validatedState.current.diagramType).toBe('pie');
    updateConfig('{"theme":"forest","look":"classic"}');
    await settled();
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['syntax', 'flowchart TD\n A -->[', '{"theme":"forest"}'],
    ['JSON', flowchart, '{ invalid'],
    ['config shape', flowchart, '[]']
  ])('preserves %s errors when the viewport changes', async (kind, code, mermaid) => {
    replaceInputState({ ...defaultState, code, mermaid });
    await settled();
    const { error, errorMarkers } = validatedState.current;
    expect(error).toBeInstanceOf(Error);
    if (kind === 'syntax') expect(errorMarkers.length).toBeGreaterThan(0);
    const parse = vi.spyOn(mermaidUtil, 'parse');
    updateCodeStore({ pan: { x: 50, y: 60 }, zoom: 3 });
    await vi.waitFor(() => expect(validatedState.current.zoom).toBe(3));
    expect(parse).not.toHaveBeenCalled();
    expect(validatedState.current.error).toBe(error);
    expect(validatedState.current.errorMarkers).toEqual(errorMarkers);
    expect(deserializeState(validatedState.current.serialized)).toEqual(readStoredState());

    replaceInputState({ ...defaultState, code: flowchart, mermaid: '{"theme":"forest"}' });
    await settled();
    expect(parse).toHaveBeenCalledOnce();
    expect(validatedState.current.error).toBeUndefined();
    expect(validatedState.current.errorMarkers).toEqual([]);
  });

  it('ignores obsolete validation without losing the latest content or viewport', async () => {
    type Result = Awaited<ReturnType<typeof mermaidUtil.parse>>;
    const older = Promise.withResolvers<Result>();
    const latest = Promise.withResolvers<Result>();
    const parse = vi
      .spyOn(mermaidUtil, 'parse')
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(latest.promise);
    updateCode('flowchart TD\n Older --> Diagram');
    updateCode(pie);
    updateCodeStore({ pan: { x: 20, y: 30 }, zoom: 4 });
    latest.resolve({ diagramType: 'pie', config: {} });
    await settled();
    older.resolve({ diagramType: 'flowchart-v2', config: {} });
    await older.promise;
    await Promise.resolve();
    updateCodeStore({ pan: { x: 40, y: 50 }, zoom: 5 });
    await vi.waitFor(() => expect(validatedState.current.zoom).toBe(5));
    expect(parse).toHaveBeenCalledTimes(2);
    expect(validatedState.current).toMatchObject({
      code: pie,
      diagramType: 'pie',
      pan: { x: 40, y: 50 },
      zoom: 5
    });
    expect(deserializeState(validatedState.current.serialized)).toEqual(readStoredState());
  });
});

describe('managed theme', () => {
  it('derives the diagram type default once the code validates', slow, async () => {
    toggleDarkTheme(false);
    updateConfig('{}');
    updateCode(flowchart);
    await waitForTheme('redux-color');
    expect(readStoredState().mermaid).toBe('{\n  "theme": "redux-color"\n}');
  });

  it('follows the diagram type when the code changes', slow, async () => {
    toggleDarkTheme(false);
    updateConfig('{}');
    updateCode(flowchart);
    await waitForTheme('redux-color');
    updateCode(pie);
    await waitForTheme('default');
  });

  it('uses the redux dark variant in dark mode and switches back', slow, async () => {
    updateConfig('{}');
    updateCode(flowchart);
    toggleDarkTheme(true);
    await waitForTheme('redux-dark-color');
    toggleDarkTheme(false);
    await waitForTheme('redux-color');
  });

  it('falls back to the dark theme for diagrams without a redux default', slow, async () => {
    updateConfig('{}');
    updateCode(pie);
    toggleDarkTheme(true);
    await waitForTheme('dark');
    toggleDarkTheme(false);
    await waitForTheme('default');
  });

  it('replaces the legacy pinned "default" theme', slow, async () => {
    toggleDarkTheme(false);
    updateCode(flowchart);
    updateConfig('{\n  "theme": "default"\n}');
    await waitForTheme('redux-color');
  });

  it('leaves a user-chosen theme alone', slow, async () => {
    updateCode(flowchart);
    updateConfig('{\n  "theme": "forest"\n}');
    toggleDarkTheme(true);
    await settled();
    expect(themeOf()).toBe('forest');
    updateCode(pie);
    await settled();
    expect(themeOf()).toBe('forest');
    toggleDarkTheme(false);
    await settled();
    expect(themeOf()).toBe('forest');
  });

  it('keeps the other config keys', slow, async () => {
    toggleDarkTheme(false);
    updateCode(flowchart);
    updateConfig('{\n  "look": "classic"\n}');
    await waitForTheme('redux-color');
    expect(JSON.parse(inputState.mermaid)).toEqual({ look: 'classic', theme: 'redux-color' });
  });

  it('does nothing while the config is not valid JSON', slow, async () => {
    updateCode(flowchart);
    updateConfig('{ "theme": ');
    expect(() => toggleDarkTheme(true)).not.toThrow();
    await settled();
    expect(inputState.mermaid).toBe('{ "theme": ');
    toggleDarkTheme(false);
  });
});

describe('clearDefaultThemeConfig migration', () => {
  // Code that does not parse has no diagram type, which keeps the managed
  // theme sync out of the way so the migration is observed on its own.
  beforeEach(async () => {
    toggleDarkTheme(false);
    updateCode('not a diagram');
    await settled();
  });

  it('clears a config that only pins the "default" theme', () => {
    updateConfig('{\n  "theme": "default"\n}');
    clearDefaultThemeConfig();
    expect(inputState.mermaid).toBe('{}');
    expect(readStoredState().mermaid).toBe('{}');
  });

  it('keeps a config that pins another theme', () => {
    updateConfig('{\n  "theme": "dark"\n}');
    clearDefaultThemeConfig();
    expect(JSON.parse(inputState.mermaid)).toEqual({ theme: 'dark' });
  });

  it('keeps a config that sets more than the default theme', () => {
    updateConfig('{\n  "theme": "default",\n  "look": "neo"\n}');
    clearDefaultThemeConfig();
    expect(JSON.parse(inputState.mermaid)).toEqual({ look: 'neo', theme: 'default' });
  });

  it('ignores a config that is not valid JSON', () => {
    updateConfig('{ "theme": ');
    expect(() => clearDefaultThemeConfig()).not.toThrow();
    expect(inputState.mermaid).toBe('{ "theme": ');
  });
});
