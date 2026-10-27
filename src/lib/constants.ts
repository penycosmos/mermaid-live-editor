import type { State } from './types';

export const TID = {
  downloadPNG: 'download-PNG',
  downloadSVG: 'download-SVG',
  embedEditLink: 'embed-edit-link',
  embedErrorCard: 'embed-error-card',
  embedFooter: 'embed-footer',
  embedModeToggle: 'embed-mode-toggle',
  embedPreview: 'embed-preview',
  embedRenderError: 'embed-render-error',
  embedSnippet: 'embed-snippet',
  embedToolbar: 'embed-toolbar',
  errorContainer: 'error-container',
  themeToggleButton: 'theme-toggle-button'
} as const;

export const MERMAID_THEMES = [
  'default',
  'neutral',
  'forest',
  'dark',
  'neo',
  'neo-dark',
  'redux',
  'redux-dark',
  'redux-color',
  'redux-dark-color'
] as const;

export const MERMAID_LOOKS = ['classic', 'handDrawn', 'neo'] as const;

export const defaultState: State = {
  code: `flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]
    C -->|Three| F[fa:fa-car Car]
  `,
  grid: true,
  // Empty on purpose: mermaid picks its own theme, look and layout per diagram type.
  mermaid: '{}',
  panZoom: true,
  rough: false,
  updateDiagram: true
};

export const DIAGRAM_LABELS: Record<string, string> = {
  architecture: '架构图',
  block: '块图',
  c4: 'C4 架构',
  classDiagram: '类图',
  cynefin: 'Cynefin 框架',
  er: '实体关系图',
  eventmodeling: '事件建模',
  flowchart: '流程图',
  'flowchart-elk': '流程图',
  'flowchart-v2': '流程图',
  gantt: '甘特图',
  gitGraph: 'Git 分支图',
  ishikawa: '鱼骨图',
  journey: '用户旅程',
  kanban: '看板',
  mindmap: '思维导图',
  packet: '数据包',
  pie: '饼图',
  quadrantChart: '象限图',
  radar: '雷达图',
  railroad: '语法图 · IR',
  railroadAbnf: '语法图 · ABNF',
  railroadEbnf: '语法图 · EBNF',
  railroadPeg: '语法图 · PEG',
  requirement: '需求图',
  sankey: '桑基图',
  sequence: '时序图',
  stateDiagram: '状态图',
  timeline: '时间线',
  treeView: '树形图',
  treemap: '矩形树图',
  usecase: '用例图',
  venn: '韦恩图',
  wardley: 'Wardley 地图',
  xychart: 'XY 图表',
  zenuml: 'ZenUML'
};
