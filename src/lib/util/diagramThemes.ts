import type { MermaidConfig } from 'mermaid';
import { darkVariantOf, getDefaultTheme } from './mermaid';

export type DiagramThemeId = 'default' | 'soft';
export type DiagramMode = 'light' | 'dark';
export interface ThemePreferences {
  light: DiagramThemeId;
  dark: DiagramThemeId;
  enabled: boolean;
}

export const diagramThemes = [
  { id: 'default', name: '默认', description: '图表原生配色' },
  { id: 'soft', name: '柔和彩色', description: '低饱和底色，流程图自动分色' }
] as const;

export const normalizeThemePreferences = (value: unknown): ThemePreferences => {
  const saved = value && typeof value === 'object' ? (value as Partial<ThemePreferences>) : {};
  return {
    light: saved.light === 'soft' ? 'soft' : 'default',
    dark: saved.dark === 'soft' ? 'soft' : 'default',
    enabled: saved.enabled === true
  };
};

export const diagramColors = {
  light: { background: '#F4F6F8', text: '#202936', label: '#F8FAFC' },
  dark: { background: '#11171B', text: '#E6EDF1', label: '#1D2931' }
} as const;

export const softNodeColor = (index: number, mode: DiagramMode): string =>
  mode === 'dark'
    ? `hsl(${index * 137.508} 20% ${34 + (index % 3)}%)`
    : `hsl(${index * 137.508} 45% ${94 - (index % 3) * 0.7}%)`;

/** Replace appearance only; layout, look and diagram-specific options stay intact. */
export const resolveDiagramTheme = (
  config: MermaidConfig,
  id: DiagramThemeId,
  mode: DiagramMode,
  diagramType: string
): MermaidConfig => {
  const next = JSON.parse(JSON.stringify(config)) as MermaidConfig;
  const clear = (object: Record<string, unknown>) => {
    delete object.theme;
    delete object.themeVariables;
    delete object.themeCSS;
    delete object.darkMode;
  };
  clear(next as Record<string, unknown>);
  for (const section of Object.values(next)) {
    if (section && typeof section === 'object' && !Array.isArray(section)) clear(section);
  }
  const dark = mode === 'dark';
  const baseTheme = getDefaultTheme(diagramType);
  const colors = diagramColors[mode];
  next.theme = (dark ? darkVariantOf(baseTheme) : baseTheme) as MermaidConfig['theme'];
  next.darkMode = dark;
  next.themeVariables = { background: colors.background };
  if (id === 'soft') {
    next.themeVariables = {
      ...next.themeVariables,
      edgeLabelBackground: colors.label,
      nodeTextColor: colors.text,
      primaryTextColor: colors.text,
      textColor: colors.text
    };
    if (['flowchart', 'flowchart-v2', 'flowchart-elk'].includes(diagramType)) {
      const fill = dark
        ? 'hsl(calc(sibling-index() * 137.508) 20% calc(34% + mod(sibling-index(), 3) * 1%))'
        : 'hsl(calc(sibling-index() * 137.508) 45% calc(94% - mod(sibling-index(), 3) * 0.7%))';
      // Keep native colors when the browser cannot calculate per-node hues.
      next.themeCSS = `@supports (fill: ${fill}) {
        .node { fill: ${fill} !important; }
        .node .label-container, .node .label-container path { fill: inherit !important; }
      }`;
    }
  }
  return next;
};
