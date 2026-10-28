import { defaultState, TID } from '$/constants';
import { serializeState } from '$/util/serde';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const code = `graph TD
  A["QueueConfig.getInstance(env, consul) 单例初始化并注册配置监听器"]
  B["ConsulConfigProperties.fromEnvironment()<br/>读取环境配置并验证应用标识是否匹配"]
  C["\`**ApplicationConfig.builder()** distribute configuration to every Flink operator\`"]
  A --> B --> C`;

const expectManualLineBreaks = async (page: Page, root = '#view') => {
  const labels = page.locator(`${root} .node .label foreignObject`);
  await expect(labels).toHaveCount(3, { timeout: 15_000 });
  await expect
    .poll(() =>
      labels.evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          const rows = new Set<number>();
          let fits = true;
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            if (!walker.currentNode.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(walker.currentNode);
            for (const rect of range.getClientRects()) {
              rows.add(Math.round(rect.top));
              fits &&= rect.left >= box.left - 1 && rect.right <= box.right + 1;
            }
          }
          return { rows: rows.size, fits };
        })
      )
    )
    .toEqual([
      { rows: 1, fits: true },
      { rows: 2, fits: true },
      { rows: 1, fits: true }
    ]);
};

for (const layout of ['dagre', 'elk']) {
  test(`${layout}: labels only break explicitly before and after selecting any theme`, async ({
    page
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(
      `/edit#${serializeState({ ...defaultState, code, mermaid: JSON.stringify({ layout }), panZoom: false })}`
    );
    await expectManualLineBreaks(page);
    await page.getByRole('button', { name: '图表主题', exact: true }).click();
    for (const mode of ['亮色', '暗色']) {
      for (const name of ['柔和彩色', '默认']) {
        const previous = await page.locator('#view svg').getAttribute('id');
        await page.getByRole('button', { name: `${mode}主题：${name}`, exact: true }).click();
        await expect(page.locator('#view svg')).not.toHaveAttribute('id', previous ?? '');
        await expectManualLineBreaks(page);
      }
    }
  });
}

test('readonly, embed and downloaded SVG retain manual line breaks without custom theme CSS', async ({
  page,
  context
}) => {
  const state = serializeState({ ...defaultState, code, panZoom: false });
  for (const route of ['view', 'embed', 'edit']) {
    await page.goto(`/${route}#${state}`);
    await expectManualLineBreaks(page, route === 'embed' ? '#embed-view' : '#view');
  }
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByTestId(TID.downloadSVG).click();
  const path = await (await pending).path();
  if (!path) throw new Error('SVG download is missing');
  const exported = await context.newPage();
  await exported.setContent(await readFile(path, 'utf8'));
  await expectManualLineBreaks(exported, 'body');
  await exported.close();
});
