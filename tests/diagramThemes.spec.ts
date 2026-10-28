import { expect, test, type Page } from '@playwright/test';
import { defaultState, TID } from '$/constants';
import { deserializeState, serializeState } from '$/util/serde';
import { readFile } from 'node:fs/promises';

const choose = (page: Page, mode: '亮色' | '暗色', name = '柔和彩色') =>
  page.getByRole('button', { name: `${mode}主题：${name}`, exact: true }).click();

const colors = (page: Page, selector = '#view') =>
  page.locator(selector).evaluate((root) => {
    const nodes = [...root.querySelectorAll('.node')];
    const label = root.querySelector('.edgeLabel p');
    return {
      fills: nodes.map((node) => {
        const shape = node.querySelector('.label-container path, .label-container');
        if (!shape) throw new Error('Node shape is missing');
        return getComputedStyle(shape).fill;
      }),
      label: label ? getComputedStyle(label).backgroundColor : '',
      text: label ? getComputedStyle(label).color : ''
    };
  });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
});

for (const layout of ['dagre', 'elk']) {
  test(`${layout}: 100 nodes adapt to both modes and retain authored colors`, async ({ page }) => {
    const code =
      'graph TD\n' +
      Array.from({ length: 100 }, (_, i) => `N${i}[Node ${i}]`).join('\n') +
      '\nN0 -->|关系| N1\n Error[错误]:::error\n Success[成功]\nclassDef error fill:#b91c1c,color:#ffffff\nstyle Success fill:#166534,color:#ffffff';
    await page.goto(
      `/edit#${serializeState({ ...defaultState, code, mermaid: JSON.stringify({ layout, themeCSS: '.node {fill:red}' }) })}`
    );
    await expect(page.locator('#view .node')).toHaveCount(102, { timeout: 15_000 });
    await page.getByRole('button', { name: '图表主题', exact: true }).click();
    for (const mode of ['亮色', '暗色'] as const) {
      await choose(page, mode);
      await expect
        .poll(async () => (await colors(page)).label)
        .toBe(mode === '亮色' ? 'rgb(248, 250, 252)' : 'rgb(29, 41, 49)');
      const actual = await colors(page);
      expect(new Set(actual.fills.slice(0, 100)).size).toBe(100);
      expect(actual.fills.slice(100)).toEqual(['rgb(185, 28, 28)', 'rgb(22, 101, 52)']);
      expect(actual.text).toBe(mode === '亮色' ? 'rgb(32, 41, 54)' : 'rgb(230, 237, 241)');
    }
    expect(
      await page.evaluate(
        () =>
          JSON.parse(JSON.parse(localStorage.getItem('codeStore') ?? '{}').mermaid ?? '{}').layout
      )
    ).toBe(layout);
    const backup = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('autoHistoryStore') ?? '[]')
    );
    expect(
      backup.some((entry: { state: { mermaid: string } }) =>
        entry.state.mermaid.includes('fill:red')
      )
    ).toBe(true);
  });
}

test('remembers separate choices after reload, new diagram and mobile selection', async ({
  page
}) => {
  await page.goto('/edit');
  await page.getByRole('button', { name: '图表主题', exact: true }).click();
  await choose(page, '亮色');
  await choose(page, '暗色', '默认');
  await page.getByTestId(TID.themeToggleButton).click();
  await expect.poll(async () => (await colors(page)).label).toBe('rgb(248, 250, 252)');
  await page.reload();
  await expect.poll(async () => (await colors(page)).label).toBe('rgb(248, 250, 252)');
  await page.getByRole('button', { name: '新建图表', exact: true }).click();
  await expect.poll(async () => (await colors(page)).label).toBe('rgb(248, 250, 252)');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '图表主题', exact: true }).click();
  await choose(page, '暗色');
  await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  await expect.poll(async () => (await colors(page)).label).toBe('rgb(29, 41, 49)');
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('readonly link, exports and both embed formats retain the selected appearance', async ({
  page,
  context
}, testInfo) => {
  await page.goto('/edit');
  await page.getByRole('button', { name: '图表主题', exact: true }).click();
  await choose(page, '暗色');
  await expect.poll(async () => (await colors(page)).label).toBe('rgb(29, 41, 49)');
  const expected = await colors(page);
  const viewUrl = await page.getByRole('link', { name: '全屏查看' }).getAttribute('href');
  if (!viewUrl) throw new Error('View URL is missing');
  const viewer = await context.newPage();
  await viewer.goto(viewUrl);
  await expect.poll(async () => (await colors(viewer)).fills).toEqual(expected.fills);
  await viewer.close();

  await page.getByRole('button', { name: '本地链接与嵌入', exact: true }).click();
  const shared = new URL(await page.getByRole('dialog').locator('input[type="url"]').inputValue());
  expect(JSON.parse(deserializeState(shared.hash.slice(1)).mermaid).theme).toBe('redux-dark-color');
  await expect(page.getByRole('combobox', { name: '图表主题', exact: true })).toHaveValue(
    'redux-dark-color'
  );
  for (const format of ['iframe', '网页组件']) {
    await page.getByRole('radio', { name: format, exact: true }).click();
    const snippet = await page.getByTestId(TID.embedSnippet).inputValue();
    const src = snippet.match(
      format === 'iframe' ? /<iframe src="([^"]+)"/ : /<mermaid-embed src="([^"]+)"/
    )?.[1];
    if (!src) throw new Error('Embed URL is missing');
    const target = new URL(src);
    if (format === '网页组件') target.hash = `code:${encodeURIComponent(defaultState.code)}`;
    const embed = await context.newPage();
    await embed.goto(target.toString());
    await expect
      .poll(async () => (await colors(embed, '#embed-view')).fills)
      .toEqual(expected.fills);
    await embed.close();
  }
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '导出', exact: true }).click();
  for (const [format, id] of [
    ['svg', TID.downloadSVG],
    ['png', TID.downloadPNG]
  ]) {
    const pending = page.waitForEvent('download');
    await page.getByTestId(id).click();
    const download = await pending;
    const path = testInfo.outputPath(`theme.${format}`);
    await download.saveAs(path);
    const bytes = await readFile(path);
    expect(bytes.length).toBeGreaterThan(1000);
    if (format === 'svg') {
      expect(bytes.toString()).toContain('sibling-index()');
      expect(bytes.toString().includes('rgb(29, 41, 49)')).toBe(true);
    } else {
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      const found = await page.evaluate(
        async ({ png, fills }) => {
          const image = new Image();
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('PNG could not be loaded'));
            image.src = `data:image/png;base64,${png}`;
          });
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas is missing');
          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, image.width, image.height).data;
          const present = new Set<number>();
          for (let offset = 0; offset < pixels.length; offset += 4)
            present.add((pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2]);
          // Native SVG shadow filters round painted channels slightly in both preview and export.
          return fills.filter((fill) => {
            const [r, g, b] = (fill.match(/\d+/g) ?? []).map(Number);
            for (let red = r - 2; red <= r + 2; red++)
              for (let green = g - 2; green <= g + 2; green++)
                for (let blue = b - 2; blue <= b + 2; blue++)
                  if (present.has((red << 16) | (green << 8) | blue)) return false;
            return true;
          });
        },
        { png: bytes.toString('base64'), fills: expected.fills }
      );
      expect(found).toEqual([]);
    }
  }
});

for (const [name, code, marker] of [
  ['sequence', 'sequenceDiagram\n Alice->>Bob: ThemeMessage', 'ThemeMessage'],
  ['class', 'classDiagram\n class ThemeClass {\n +String name\n }', 'ThemeClass'],
  ['pie', 'pie title ThemePie\n "A": 1\n "B": 2', 'ThemePie']
]) {
  test(`${name}: uses native diagram colors with matching light and dark text`, async ({
    page
  }) => {
    await page.goto(`/edit#${serializeState({ ...defaultState, code })}`);
    await expect(page.locator('#view')).toContainText(marker, { timeout: 15_000 });
    await page.getByRole('button', { name: '图表主题', exact: true }).click();
    for (const mode of ['亮色', '暗色'] as const) {
      await choose(page, mode);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              JSON.parse(JSON.parse(localStorage.getItem('codeStore') ?? '{}').mermaid ?? '{}')
                .darkMode
          )
        )
        .toBe(mode === '暗色');
      await expect(page.locator('#view')).toContainText(marker);
      expect(
        await page.evaluate(
          () =>
            JSON.parse(JSON.parse(localStorage.getItem('codeStore') ?? '{}').mermaid ?? '{}')
              .themeCSS
        )
      ).toBeUndefined();
    }
  });
}
