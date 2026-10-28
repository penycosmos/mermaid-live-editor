import { describe, expect, it } from 'vitest';
import { normalizeThemePreferences, resolveDiagramTheme } from './diagramThemes';

describe('diagram themes', () => {
  it('normalizes missing, corrupt and unknown saved preferences', () => {
    for (const value of [null, 'broken', { light: 'missing', dark: 3, enabled: 'yes' }])
      expect(normalizeThemePreferences(value)).toEqual({
        light: 'default',
        dark: 'default',
        enabled: false
      });
    expect(normalizeThemePreferences({ light: 'soft', dark: 'default', enabled: true })).toEqual({
      light: 'soft',
      dark: 'default',
      enabled: true
    });
  });

  it('replaces old appearance without mutating layout or the original config', () => {
    const config = {
      flowchart: { nodeSpacing: 80, theme: 'forest' },
      htmlLabels: true,
      layout: 'elk',
      look: 'classic',
      theme: 'forest',
      themeCSS: '.node { fill: red; }',
      themeVariables: { fontSize: '20px' }
    } as const;
    const next = resolveDiagramTheme(config, 'soft', 'dark', 'flowchart-v2');
    expect(next).toMatchObject({
      darkMode: true,
      flowchart: { nodeSpacing: 80 },
      htmlLabels: true,
      layout: 'elk',
      look: 'classic',
      theme: 'redux-dark-color',
      themeVariables: { edgeLabelBackground: '#1D2931', nodeTextColor: '#E6EDF1' }
    });
    expect(next.flowchart).not.toHaveProperty('theme');
    expect(next.themeVariables).not.toHaveProperty('fontSize');
    expect(next.themeCSS).toContain('@supports');
    expect(config.flowchart.theme).toBe('forest');
    expect(resolveDiagramTheme(next, 'soft', 'dark', 'flowchart-v2')).toEqual(next);
  });

  it('uses native themes for other diagram types and removes flowchart CSS on type changes', () => {
    const flow = resolveDiagramTheme({}, 'soft', 'light', 'flowchart-v2');
    const pie = resolveDiagramTheme(flow, 'soft', 'dark', 'pie');
    expect(pie.theme).toBe('dark');
    expect(pie.themeCSS).toBeUndefined();
    expect(resolveDiagramTheme(flow, 'default', 'light', 'flowchart-v2').themeCSS).toBeUndefined();
  });
});
