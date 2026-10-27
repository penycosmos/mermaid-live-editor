# Mermaid 离线编辑器

一个在本机运行的 Mermaid 图表工作台。以画布为中心，按需展开代码、模板和历史，支持中文界面及明暗主题。

- 桌面使用 Monaco，移动端使用 CodeMirror，支持实时预览与 JSON 配置编辑。
- 打开、保存 `.mmd` 源码，导出 PNG/SVG，复制图片。
- 本地收藏、每分钟自动历史、JSON 历史备份与恢复。
- 当前本地服务内的查看链接、iframe 和网页组件嵌入。
- 无广告、统计、账号、外部渲染器或远程文件加载。脚本、字体及图标由本地构建提供。

## 启动

需要 Node.js ≥ 24.16.0 和 pnpm 10.34.7。

```sh
pnpm install
pnpm dev
```

访问 `http://localhost:3000`。安装依赖需要软件包缓存或网络；应用运行不需要互联网，但本地服务必须保持运行。

## 生产构建

```sh
pnpm build
pnpm preview
```

`docs/` 是生成的静态站点，可由本机静态服务器或 Nginx 提供。不要手工修改构建产物。

```sh
docker build -t mermaid-offline .
docker run --rm -p 8080:8080 mermaid-offline
```

如需部署到子路径，在构建时设置 `MERMAID_BASE_PATH`，例如 `/diagrams`。环境变量仅在构建时生效。

## 本地数据

浏览器 localStorage 保留图表及历史。新建、打开文件和替换模板前会保存当前图表到时间线，时间线最多保留 30 条；重要内容请收藏并导出历史备份。

`.mmd` 文件只包含图表源码。独立的渲染配置随历史 JSON 备份保存。链接中包含图表内容，仅适用于能够访问该本地服务的浏览器。

用户源码保持原样；预览和导出禁止外部图片、样式及外站跳转。需要图片时使用同源本地资源或内嵌图片。此版本不提供 PWA 离线缓存或桌面安装包。

## 检查

```sh
pnpm check
pnpm lint
pnpm vitest run --dir src
pnpm test:e2e
```

Playwright 默认使用已有开发服务，或自行启动开发服务。生产回归先运行 `pnpm build`，再执行 `CI=true pnpm test:e2e`。

项目与依赖的许可证继续有效，详见 [LICENSE](LICENSE)。
