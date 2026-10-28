import { describe, expect, it, vi } from 'vitest';
import {
  defaultState,
  inputState,
  replaceInputState,
  selectDiagramTheme,
  themePreferences,
  toggleDarkTheme,
  updateCode,
  updateConfig,
  validatedState
} from './state.svelte';

const settled = () =>
  vi.waitFor(
    () => {
      expect(validatedState.current.code).toBe(inputState.code);
      expect(validatedState.current.mermaid).toBe(inputState.mermaid);
    },
    { timeout: 10_000 }
  );
const config = () => JSON.parse(inputState.mermaid);

describe('theme panel state', () => {
  it('keeps legacy CSS until selected, remembers both modes and preserves layout', async () => {
    toggleDarkTheme(false);
    replaceInputState({
      ...defaultState,
      mermaid: JSON.stringify({ layout: 'elk', themeCSS: '.node { fill: red; }' })
    });
    await settled();
    expect(config().themeCSS).toContain('red');
    selectDiagramTheme('light', 'soft');
    await settled();
    expect(config()).toMatchObject({ layout: 'elk', theme: 'redux-color' });
    expect(config().themeCSS).toContain('sibling-index()');
    selectDiagramTheme('dark', 'default');
    await settled();
    expect(config().themeCSS).toBeUndefined();
    expect(config().theme).toBe('redux-dark-color');
    expect(themePreferences.current).toEqual({ light: 'soft', dark: 'default', enabled: true });
    toggleDarkTheme(false);
    await settled();
    expect(config().themeCSS).toContain('sibling-index()');
    expect(JSON.parse(localStorage.getItem('diagramThemePreferences') ?? '{}').light).toBe('soft');
  });

  it('follows the last choice and applies preferences to replacement diagrams', async () => {
    selectDiagramTheme('light', 'default');
    selectDiagramTheme('dark', 'soft');
    selectDiagramTheme('light', 'soft');
    await settled();
    expect(config().darkMode).toBe(false);
    replaceInputState({ ...defaultState });
    await settled();
    expect(config().themeCSS).toContain('sibling-index()');
    updateCode('pie\n "A": 1');
    await settled();
    expect(config().theme).toBe('default');
    expect(config().themeCSS).toBeUndefined();
  });

  it('does not overwrite snapshot appearances on the readonly route', async () => {
    toggleDarkTheme(false, false);
    updateConfig('{"theme":"redux-dark-color","themeCSS":"snapshot"}');
    await settled();
    expect(config().themeCSS).toBe('snapshot');
    toggleDarkTheme(false);
    await settled();
    expect(config().themeCSS).not.toBe('snapshot');
  });

  it('rejects invalid JSON without changing preferences or the draft', async () => {
    updateConfig('{ broken');
    await settled();
    const before = themePreferences.current;
    expect(() => selectDiagramTheme('dark', 'default')).toThrow('请先修复渲染配置');
    expect(inputState.mermaid).toBe('{ broken');
    expect(themePreferences.current).toEqual(before);
  });
});
