import { expect, test } from '@playwright/test';

test('sidebar divider follows the mouse in both directions after opening and reopening', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/edit');
  await expect(page.locator('#view svg')).toBeVisible();
  const code = page.getByRole('button', { name: '代码编辑', exact: true });
  await code.click();
  const sidebar = page.locator('#workspace-panel');
  const divider = page.getByRole('separator', { name: '调整侧栏宽度' });
  for (const panel of ['代码编辑', '图表模板', '本地历史', '重新打开']) {
    if (panel === '重新打开') {
      await page.getByRole('button', { name: '收起侧栏' }).click();
      await code.click();
    } else if (panel !== '代码编辑') {
      await page.getByRole('button', { name: panel, exact: true }).click();
    }
    await divider.hover();
    for (const [distance, grabOffset] of [
      [-80, -4],
      [120, 0],
      [-40, 4]
    ]) {
      const before = await sidebar.boundingBox();
      const handle = await divider.boundingBox();
      const canvas = await page.locator('#view').boundingBox();
      if (!before || !handle || !canvas) throw new Error('Workspace layout is missing');
      const x = handle.x + handle.width / 2 + grabOffset;
      const y = handle.y + handle.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + distance, y, { steps: 10 });
      await page.mouse.up();
      await expect
        .poll(async () =>
          Math.abs(((await sidebar.boundingBox())?.width ?? NaN) - before.width - distance)
        )
        .toBeLessThan(2);
      expect(
        Math.abs(((await divider.boundingBox())?.x ?? NaN) - handle.x - distance)
      ).toBeLessThan(2);
      expect(
        Math.abs(
          ((await page.locator('#view').boundingBox())?.width ?? NaN) - canvas.width + distance
        )
      ).toBeLessThan(2);
    }
  }
});
