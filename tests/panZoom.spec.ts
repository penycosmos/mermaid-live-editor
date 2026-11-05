import { defaultState, TID } from '$/constants';
import type { State } from '$/types';
import { deserializeState, serializeState } from '$/util/serde';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const providedDiagram = readFileSync(
  new URL('./fixtures/largeFlowchart.mmd', import.meta.url),
  'utf8'
);
const generatedDiagram = (count: number) =>
  'flowchart TB\n' +
  Array.from(
    { length: count },
    (_, i) =>
      `N${i}["Operator ${i}<br/>处理步骤 ${i}<br/>stage-${i}"]` +
      (i ? `\nN${Math.floor((i - 1) / 3)} --> N${i}` : '')
  ).join('\n');

const storedState = (page: Page): Promise<State> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('codeStore') ?? '{}'));

test('smooth preview hands its visible viewport to a mouse drag on the fixed canvas', async ({
  page
}) => {
  await page.goto(`/edit#${serializeState({ ...defaultState, code: generatedDiagram(100) })}`);
  await expect(page.locator('#view .node')).toHaveCount(100, { timeout: 15_000 });
  await page.getByRole('button', { name: '缩放显示模式', exact: true }).click();
  const container = page.locator('#container');
  const box = await container.boundingBox();
  if (!box) throw new Error('Canvas is missing');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await container.evaluate(
    async (element, point) => {
      element.addEventListener(
        'pointerdown',
        () => {
          element.setAttribute('data-before-drag', localStorage.getItem('codeStore') ?? '{}');
        },
        { capture: true, once: true }
      );
      element.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 500, clientX: point.x, clientY: point.y })
      );
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    },
    { x, y }
  );
  await page.mouse.down();
  await page.mouse.move(x + 100, y + 80, { steps: 5 });
  await page.mouse.up();
  const before: State = JSON.parse((await container.getAttribute('data-before-drag')) ?? '{}');
  const { pan, zoom } = before;
  if (!pan || zoom === undefined) throw new Error('Visible viewport is missing');
  await expect.poll(async () => (await storedState(page)).zoom).toBeCloseTo(zoom, 6);
  await expect
    .poll(async () => (await storedState(page)).pan)
    .toEqual({
      x: expect.closeTo(pan.x + 100, 3),
      y: expect.closeTo(pan.y + 80, 3)
    });
  await expect
    .poll(() =>
      page.locator('#container > svg').evaluate((svg) => (svg as SVGSVGElement).style.transform)
    )
    .toBe('');
});

test('switching rendering modes during zoom preserves the visible viewport', async ({ page }) => {
  await page.goto(`/edit#${serializeState({ ...defaultState, code: generatedDiagram(100) })}`);
  await expect(page.locator('#view .node')).toHaveCount(100, { timeout: 15_000 });
  const mode = page.getByRole('button', { name: '缩放显示模式', exact: true });
  await mode.click();
  const visible = await mode.evaluate(async (button) => {
    const svg = document.querySelector('#container > svg');
    if (!svg) throw new Error('SVG is missing');
    const box = svg.getBoundingClientRect();
    svg.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        deltaY: -500,
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2
      })
    );
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const visible = JSON.parse(localStorage.getItem('codeStore') ?? '{}') as State;
    if (!(svg as SVGSVGElement).style.transform) throw new Error('Preview is not active');
    (button as HTMLButtonElement).click();
    return visible;
  });
  await expect(mode).toHaveText('清晰优先');
  await expect
    .poll(() =>
      page.locator('#container > svg').evaluate((svg) => (svg as SVGSVGElement).style.transform)
    )
    .toBe('');
  expect((await storedState(page)).zoom).toBe(visible.zoom);
  expect((await storedState(page)).pan).toEqual(visible.pan);
  if (visible.zoom === undefined) throw new Error('Visible zoom is missing');
  await page.getByTitle('放大', { exact: true }).click();
  await expect.poll(async () => (await storedState(page)).zoom).toBeCloseTo(visible.zoom * 1.1, 6);
});

for (const renderMode of ['crisp', 'smooth']) {
  for (const [name, code, count] of [
    ['provided diagram', providedDiagram, 164],
    ['100 nodes', generatedDiagram(100), 100],
    ['200 nodes', generatedDiagram(200), 200]
  ] as const) {
    test(`${renderMode}, ${name}: pan and zoom preserve the SVG and saved viewport`, async ({
      page
    }) => {
      await page.goto(`/edit#${serializeState({ ...defaultState, code })}`);
      const nodes = page.locator('#view .node');
      await expect(nodes).toHaveCount(count, { timeout: 15_000 });
      const modeButton = page.getByRole('button', { name: '缩放显示模式', exact: true });
      await expect(modeButton).toHaveText('清晰优先');
      if (renderMode === 'smooth') await modeButton.click();
      await page.getByRole('button', { name: '代码编辑', exact: true }).click();
      await page.getByTitle('适应画布', { exact: true }).click();
      await expect.poll(async () => (await storedState(page)).zoom).toBeCloseTo(0.875);
      const originalSvg = await page.locator('#view svg').elementHandle();
      if (!originalSvg) throw new Error('SVG is missing');
      const before = await storedState(page);
      const canvas = await page.locator('#view').boundingBox();
      if (!canvas) throw new Error('Canvas is missing');
      const x = canvas.x + canvas.width / 2;
      const y = canvas.y + canvas.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 120, y + 80, { steps: 20 });
      await page.mouse.up();
      await expect.poll(async () => (await storedState(page)).pan).not.toEqual(before.pan);
      await page.mouse.wheel(0, -120);
      await expect
        .poll(async () => (await storedState(page)).zoom ?? 0)
        .toBeCloseTo(0.875 * 1.2 ** 1.2, 6);

      const wheelZoom = (await storedState(page)).zoom ?? 0;
      await page.getByTitle('放大', { exact: true }).click();
      await expect.poll(async () => (await storedState(page)).zoom ?? 0).toBeGreaterThan(wheelZoom);
      await page.getByTitle('缩小', { exact: true }).click();
      await expect.poll(async () => (await storedState(page)).zoom ?? 0).toBeCloseTo(wheelZoom);
      const saved = await storedState(page);
      if (!saved.pan || !saved.zoom) throw new Error('Saved viewport is missing');
      const savedPan = {
        x: expect.closeTo(saved.pan.x, 2),
        y: expect.closeTo(saved.pan.y, 2)
      };
      expect(saved.code).toBe(code);
      expect(saved.mermaid).toBe(before.mermaid);
      expect(await originalSvg.evaluate((svg) => svg.isConnected)).toBe(true);

      await expect.poll(() => deserializeState(new URL(page.url()).hash.slice(1))).toEqual(saved);
      await page.getByRole('button', { name: '本地链接与嵌入', exact: true }).click();
      const shared = new URL(
        await page.getByRole('dialog').locator('input[type="url"]').inputValue()
      );
      expect(deserializeState(shared.hash.slice(1))).toEqual(saved);
      await page.reload();
      await expect(nodes).toHaveCount(count, { timeout: 15_000 });
      await expect(modeButton).toHaveText('清晰优先');
      await expect.poll(async () => (await storedState(page)).zoom).toBeCloseTo(saved.zoom);
      await expect.poll(async () => (await storedState(page)).pan).toEqual(savedPan);
      await expect
        .poll(() =>
          page.locator('.svg-pan-zoom_viewport').evaluate((viewport) => {
            const matrix = (viewport as SVGGElement).transform.baseVal.consolidate()?.matrix;
            return matrix ? { x: matrix.e, y: matrix.f } : undefined;
          })
        )
        .toEqual(savedPan);
      await page.getByTitle('适应画布', { exact: true }).click();
      await expect.poll(async () => (await storedState(page)).zoom).toBeCloseTo(0.875);
    });
  }
}

test.describe('high DPI wheel zoom', () => {
  test.use({ viewport: { width: 2304, height: 1296 }, deviceScaleFactor: 2 });

  for (const [route, renderMode] of [
    ['view', 'crisp'],
    ['embed', 'crisp'],
    ['edit', 'smooth'],
    ['embed', 'smooth']
  ]) {
    test(`${route}, ${renderMode}: smoothly zooms around the pointer without moving its anchor`, async ({
      page
    }) => {
      await page.goto(
        `/${route}#${serializeState({ ...defaultState, code: generatedDiagram(100) })}`
      );
      const viewport = page.locator('.svg-pan-zoom_viewport');
      await expect(viewport).toBeVisible({ timeout: 15_000 });
      if (renderMode === 'smooth')
        await page.getByRole('button', { name: '缩放显示模式', exact: true }).click();
      await page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
      });
      const before = await viewport.evaluate((element) => {
        const group = element as SVGGElement;
        const svg = group.ownerSVGElement;
        const matrix = group.getScreenCTM();
        if (!svg || !matrix) throw new Error('SVG coordinates are missing');
        const box = svg.getBoundingClientRect();
        const screen = new DOMPoint(
          Math.round(box.x + box.width * 0.7),
          Math.round(box.y + box.height * 0.6)
        );
        const anchor = screen.matrixTransform(matrix.inverse());
        const samples: number[] = [];
        const observer = new MutationObserver(() => {
          samples.push(group.getScreenCTM()?.a ?? 0);
          group.dataset.zoomSamples = JSON.stringify(samples);
        });
        observer.observe(svg, {
          attributes: true,
          subtree: true,
          attributeFilter: ['transform', 'style']
        });
        return {
          anchor: { x: anchor.x, y: anchor.y },
          scale: matrix.a,
          x: screen.x,
          y: screen.y
        };
      });
      const scale = () =>
        viewport.evaluate((element) => (element as SVGGElement).getScreenCTM()?.a ?? 0);
      await page.mouse.move(before.x, before.y);
      // Chromium's emulated high-DPI wheel input is converted to CSS pixels.
      const wheelDelta = 100 * (await page.evaluate(() => devicePixelRatio));
      await page.mouse.wheel(0, -wheelDelta);
      await expect.poll(async () => (await scale()) / before.scale).toBeCloseTo(1.2, 6);
      await expect
        .poll(() =>
          viewport.evaluate((element) => (element as SVGGElement).ownerSVGElement?.style.transform)
        )
        .toBe('');
      const after = await viewport.evaluate((element, anchor) => {
        const group = element as SVGGElement;
        const matrix = group.getScreenCTM();
        if (!matrix) throw new Error('SVG coordinates are missing');
        const point = new DOMPoint(anchor.x, anchor.y).matrixTransform(matrix);
        return {
          x: point.x,
          y: point.y,
          samples: JSON.parse(group.dataset.zoomSamples ?? '[]') as number[]
        };
      }, before.anchor);
      expect(after.x).toBeCloseTo(before.x, 2);
      expect(after.y).toBeCloseTo(before.y, 2);
      expect(
        after.samples.filter((value) => value > before.scale && value < before.scale * 1.199)
      ).not.toHaveLength(0);
      await page.mouse.wheel(0, wheelDelta);
      await expect.poll(async () => (await scale()) / before.scale).toBeCloseTo(1, 6);
      if (route === 'embed')
        expect(await page.evaluate(() => localStorage.getItem('codeStore'))).toBeNull();
    });
  }
});

for (const renderMode of ['crisp', 'smooth']) {
  test(`${renderMode}: restoring the same diagram during zoom keeps the restored viewport`, async ({
    page
  }) => {
    const state = { ...defaultState, code: generatedDiagram(10), mermaid: '{"theme":"forest"}' };
    const restored = { ...state, pan: { x: 40, y: 60 }, zoom: 2 };
    await page.addInitScript((state) => {
      localStorage.setItem(
        'manualHistoryStore',
        JSON.stringify([{ id: 'zoom-restore', name: 'Viewport', type: 'manual', time: 1, state }])
      );
    }, restored);
    await page.goto(`/edit#${serializeState(state)}`);
    await expect(page.locator('.svg-pan-zoom_viewport')).toBeVisible({ timeout: 15_000 });
    if (renderMode === 'smooth')
      await page.getByRole('button', { name: '缩放显示模式', exact: true }).click();
    await page.getByRole('button', { name: '本地历史', exact: true }).click();
    const restore = page.getByRole('button', { name: '恢复此版本' }).first();
    await expect(restore).toBeVisible();
    await restore.evaluate(async (button) => {
      const svg = document.querySelector('#view svg');
      if (!svg) throw new Error('SVG is missing');
      svg.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, deltaY: -500, clientX: 900, clientY: 500 })
      );
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      (button as HTMLButtonElement).click();
    });
    await expect.poll(async () => (await storedState(page)).zoom).toBeCloseTo(2, 6);
    await expect.poll(async () => (await storedState(page)).pan).toEqual(restored.pan);
    await expect
      .poll(() =>
        page.locator('.svg-pan-zoom_viewport').evaluate((element) => {
          const matrix = (element as SVGGElement).transform.baseVal.getItem(0).matrix;
          return { x: matrix.e, y: matrix.f };
        })
      )
      .toEqual(restored.pan);
    await expect
      .poll(() => deserializeState(new URL(page.url()).hash.slice(1)).zoom)
      .toBeCloseTo(2, 6);
  });

  test(`${renderMode}: export interrupts wheel animation and restores an interactive canvas`, async ({
    page
  }) => {
    await page.goto(`/edit#${serializeState({ ...defaultState, code: generatedDiagram(10) })}`);
    await expect(page.locator('.svg-pan-zoom_viewport')).toBeVisible({ timeout: 15_000 });
    if (renderMode === 'smooth')
      await page.getByRole('button', { name: '缩放显示模式', exact: true }).click();
    await page.getByRole('button', { name: '导出', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByTestId(TID.downloadSVG).evaluate(async (button) => {
      const svg = document.querySelector('#view svg');
      if (!svg) throw new Error('SVG is missing');
      svg.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, deltaY: -500, clientX: 900, clientY: 500 })
      );
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      (button as HTMLButtonElement).click();
    });
    expect((await download).suggestedFilename()).toMatch(/\.svg$/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.svg-pan-zoom_viewport')).toBeVisible();
    await page.getByTitle('适应画布', { exact: true }).click();
    await expect.poll(async () => (await storedState(page)).zoom).toBeCloseTo(0.875, 6);
    await page.getByTitle('放大', { exact: true }).click();
    await expect.poll(async () => (await storedState(page)).zoom).toBeCloseTo(0.875 * 1.1, 6);
  });
}
