# 项目约定

## 运行与验证

Node ≥ 24.16.0，pnpm 10.34.7。

- `pnpm dev`：本地开发，端口 3000。
- `pnpm check`：Svelte/TypeScript 检查。
- `pnpm lint`：Prettier 与 ESLint 检查。
- `pnpm vitest run --dir src`：执行一次单元测试。
- `pnpm build`：构建静态站点到 `docs/`，该目录不是源码。
- `pnpm test:e2e`：Playwright；生产回归先构建，再用 `CI=true pnpm test:e2e`。
- 开发热更新刻意采用整页刷新，避免编辑器与状态不一致。

## 应用边界

这是中文、本地运行、画布优先的离线编辑器。不要重新加入外部服务、统计、推广、在线 Schema 或网络字体。运行时网络资源只能来自当前应用同源；不要删除 SVG 的 XML 命名空间或依赖许可证。

- `/edit` 是画布工作台；代码、模板、历史使用互斥的可收起侧栏。
- `/view` 使用主编辑器状态；`/embed` 是独立的 props 驱动渲染，不得导入编辑器状态单例或读写编辑器 localStorage。
- `state.svelte.ts` 是状态边界，写入必须使用已有更新函数，流程为持久化 → 校验 → 发布 `validatedState` → 渲染与 URL hash 同步。
- `State` 用于保存和分享，`ValidatedState` 只用于应用内部。旧 localStorage 与 pako/Base64 链接必须继续可读。
- `mermaid.ts` 固定渲染安全配置，`offline.ts` 清理渲染副本；不得改写用户源码来消除外联。
- `exportSvg.ts` 负责自包含 SVG 和手绘标签裁切修复。导出改动必须验证实际图片，包括中文、多行、图标及尺寸模式，不能只检查下载成功。
- `.mmd` 只保存源码，完整配置保存在历史备份中。替换图表前使用现有历史保存功能。

## 实现习惯

复用 `src/lib/components/ui/` 的现有组件，不增加无必要的依赖或架构层。单元测试与源码放在一起；页面测试在 `tests/`。图标按钮必须有中文可访问名称，侧栏与画布都要保留可用的独立滚动区域。
