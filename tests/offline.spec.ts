import { defaultState, TID } from '$/constants';
import { serializeState } from '$/util/serde';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const appOrigin = `http://localhost:${process.env.PLAYWRIGHT_PORT ?? '3000'}`;

const code = 'flowchart LR\n  A[本地图表] --> B[离线使用]';

// Block and record attempted network access, including popups and worker traffic.
const auditNetwork = async (page: Page) => {
  const external: string[] = [];
  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== appOrigin) {
      external.push(url.href);
      await route.abort();
    } else await route.continue();
  });
  return external;
};

test('canvas-first workspace keeps all panels usable and local', async ({ page }) => {
  const external = await auditNetwork(page);
  await page.goto('/edit?gist=https://outside.invalid/gist&code=https://outside.invalid/source');
  await expect(page.locator('#view svg')).toBeVisible();
  await expect(page.locator('.monaco-editor')).toHaveCount(0);
  await page.getByRole('button', { name: '代码编辑', exact: true }).click();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  const editor = await page.locator('.monaco-editor').boundingBox();
  expect(editor?.height).toBeGreaterThan(400);
  await expect
    .poll(async () => {
      const nodes = await page.locator('#view .nodes').boundingBox();
      const viewport = await page.locator('#view').boundingBox();
      return (
        !!nodes &&
        !!viewport &&
        nodes.x >= viewport.x &&
        nodes.x + nodes.width <= viewport.x + viewport.width
      );
    })
    .toBe(true);
  await page.getByRole('button', { name: '图表模板', exact: true }).click();
  await page.getByRole('button', { name: '流程图', exact: true }).click();
  await expect(page.locator('#view svg')).toBeVisible();
  await page.getByRole('button', { name: '本地历史', exact: true }).click();
  await expect(page.getByRole('tab', { name: '时间线' })).toBeVisible();
  await page.getByRole('button', { name: '收起侧栏' }).click();
  await page.getByRole('button', { name: '本地链接与嵌入' }).click();
  await expect(page.getByTestId(TID.embedSnippet)).toHaveValue(new RegExp(`${appOrigin}/embed`));
  await page.keyboard.press('Escape');
  const hrefs = await page
    .locator('a[href]')
    .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href));
  expect(hrefs.every((href) => href.startsWith(`${appOrigin}/`))).toBe(true);
  expect(external).toEqual([]);
});

test('opens and saves mmd source, preserves config and backs up the previous diagram', async ({
  page
}) => {
  await page.addInitScript((state) => localStorage.setItem('codeStore', JSON.stringify(state)), {
    ...defaultState,
    mermaid: '{"theme":"forest"}'
  });
  const external = await auditNetwork(page);
  await page.goto('/edit');
  await expect(page.locator('#view svg')).toBeVisible();
  await page
    .getByTestId('source-file-input')
    .setInputFiles({ name: '本地图表.mmd', mimeType: 'text/plain', buffer: Buffer.from(code) });
  await expect(page.locator('#view')).toContainText('本地图表');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('codeStore') ?? '{}'));
  expect(state.code).toBe(code);
  expect(JSON.parse(state.mermaid).theme).toBe('forest');
  const previous = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('autoHistoryStore') ?? '[]')
  );
  expect(
    previous.some((entry: { state: { code: string } }) => entry.state.code === defaultState.code)
  ).toBe(true);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存源码', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('本地图表.mmd');
  const path = await download.path();
  expect(await readFile(path ?? '', 'utf8')).toBe(code);
  await page.getByTestId('source-file-input').setInputFiles({
    name: 'wrong.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not imported')
  });
  await expect(page.getByText('请选择 .mmd 源码文件')).toBeVisible();
  await expect(page.locator('#view')).toContainText('本地图表');
  await page.getByRole('button', { name: '新建图表' }).click();
  const backups = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('autoHistoryStore') ?? '[]')
  );
  expect(backups[0].state.code).toBe(code);
  expect(external).toEqual([]);
});

test('blocks external content and navigation while keeping the original source', async ({
  page
}) => {
  const external = await auditNetwork(page);
  const source =
    'flowchart TD\n  A["<img src=\'https://outside.invalid/image.png\'/>保留文字"] --> B[本地]\n  click B "https://outside.invalid/link"';
  const state = {
    ...defaultState,
    code: source,
    mermaid: JSON.stringify({
      securityLevel: 'loose',
      secure: [],
      themeCSS:
        '@import "https://outside.invalid/style.css"; .node {fill:url(https://outside.invalid/paint)}'
    })
  };
  await page.goto(`/edit#${serializeState(state)}`);
  await expect(page.locator('#view svg')).toBeVisible();
  await expect(page.locator('#view')).toContainText('保留文字');
  await expect(
    page.locator(
      '#view a[href*="outside.invalid"], #view [src*="outside.invalid"], #view [href*="outside.invalid"]'
    )
  ).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('codeStore') ?? '{}'));
  expect(stored.code).toBe(source);
  expect(JSON.parse(stored.mermaid).securityLevel).toBe('loose');
  await page.locator('#view').getByText('本地', { exact: true }).click();
  expect(page.context().pages()).toHaveLength(1);
  expect(external).toEqual([]);
});

test('exports a self-contained SVG with local icon fonts', async ({ page }, testInfo) => {
  const external = await auditNetwork(page);
  await page.goto('/edit');
  await expect(page.locator('#view svg')).toBeVisible();
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByTestId(TID.downloadSVG).click();
  const exported = await pending;
  await exported.saveAs(testInfo.outputPath('offline-icons.svg'));
  const path = await exported.path();
  const svg = await readFile(path ?? '', 'utf8');
  expect(svg).toContain('data:font/woff2;base64,');
  expect(svg).not.toContain('<?xml-stylesheet');
  expect(svg).not.toContain('cdnjs.cloudflare.com');
  expect(svg).not.toMatch(/url\(["']?(?:https?:)?\/\//);
  const png = page.waitForEvent('download');
  await page.getByTestId(TID.downloadPNG).click();
  await (await png).saveAs(testInfo.outputPath('offline-icons.png'));
  expect(external).toEqual([]);
});

for (const [name, source] of [
  ['flowchart', code],
  ['sequence', 'sequenceDiagram\n  Alice->>Bob: 离线消息'],
  ['er', 'erDiagram\n  USER ||--o{ ORDER : owns'],
  ['mindmap', 'mindmap\n  root((离线))\n    编辑\n    导出'],
  ['zenuml', 'zenuml\n  Client.call() { Service.work() }']
]) {
  test(`renders ${name} offline in the standalone embed`, async ({ page }) => {
    const external = await auditNetwork(page);
    await page.goto(`/embed#${serializeState({ ...defaultState, code: source })}`);
    await expect(page.locator('#embed-container > svg')).toBeVisible();
    await expect(page.getByTestId(TID.embedRenderError)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('codeStore'))).toBeNull();
    expect(external).toEqual([]);
  });
}

test('fits narrow screens, supports dark mode and independently scrolling code', async ({
  page
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/edit');
  await expect(page.locator('#view svg')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const brand = await page.locator('.brand-mark').boundingBox();
  const firstAction = await page.getByRole('button', { name: '新建图表' }).boundingBox();
  expect(firstAction?.x).toBeGreaterThan((brand?.x ?? 0) + (brand?.width ?? 0));
  const fill = () =>
    page
      .locator('#view .node rect')
      .first()
      .evaluate((element) => getComputedStyle(element).fill);
  const lightFill = await fill();
  await page.getByTestId(TID.themeToggleButton).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect.poll(fill).not.toBe(lightFill);
  await page.screenshot({ path: testInfo.outputPath('mobile-dark.png') });
  await page.getByRole('button', { name: '代码编辑', exact: true }).click();
  await expect(page.locator('.cm-editor')).toBeVisible();
  expect((await page.locator('.cm-editor').boundingBox())?.height).toBeGreaterThan(500);
  await page.getByRole('button', { name: '收起侧栏' }).click();
  await expect(page.locator('.cm-editor')).toHaveCount(0);
});
