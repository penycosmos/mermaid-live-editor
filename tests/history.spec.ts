import { expect, test, type Page } from '@playwright/test';

const config = '{\n  "theme": "default"\n}';

const entry = (id: string, name: string, type: 'manual' | 'auto', label: string) => ({
  id,
  name,
  type,
  time: Number(id.slice(2)),
  state: {
    code: `flowchart TD\n  A[${label}]`,
    mermaid: config,
    autoSync: true,
    updateDiagram: false
  }
});

const manualHistory = [
  entry('m-2', 'hollow-art', 'manual', 'Halloween'),
  entry('m-1', 'helpful-ocean', 'manual', 'Pumpkin')
];
const autoHistory = [
  entry('a-2', 'barking-dog', 'auto', 'NewYear'),
  entry('a-1', 'needy-mosquito', 'auto', 'Fireworks')
];

const openHistory = (page: Page) => page.getByRole('button', { name: '本地历史' }).click();

test.describe('本地历史', () => {
  test.beforeEach(async ({ page }) => {
    // Freeze time so auto-save snapshots are deterministic.
    await page.addInitScript(() => {
      Object.defineProperty(Date, 'now', { value: () => new Date(2022, 0, 1).getTime() });
    });
    await page.goto('/edit');
  });

  test('loads Saved and Timeline history from localStorage and restores entries', async ({
    page
  }) => {
    await page.evaluate(
      ([manual, auto]) => {
        localStorage.setItem('manualHistoryStore', manual);
        localStorage.setItem('autoHistoryStore', auto);
      },
      [JSON.stringify(manualHistory), JSON.stringify(autoHistory)]
    );
    await page.reload();
    await openHistory(page);

    // Saved tab is active by default.
    await expect(page.locator('#historyList li:has(button)')).toHaveCount(2);
    await expect(page.locator('#historyList')).toContainText('hollow-art');
    await expect(page.locator('#historyList')).toContainText('helpful-ocean');

    await page.getByRole('button', { name: '恢复此版本' }).first().click();
    await expect(page.locator('#view')).toContainText('Halloween');

    // Restoring first backed up the previous diagram to the Timeline.
    await page.getByRole('tab', { name: '时间线' }).click();
    await expect(page.locator('#historyList li:has(button)')).toHaveCount(3);
    await expect(page.locator('#historyList')).toContainText('barking-dog');
    await expect(page.locator('#historyList')).toContainText('needy-mosquito');
    await expect(page.locator('#historyList')).not.toContainText('hollow-art');

    await page
      .locator('#historyList li')
      .filter({ hasText: 'barking-dog' })
      .getByRole('button', { name: '恢复此版本' })
      .click();
    await expect(page.locator('#view')).toContainText('NewYear');
  });

  test('each entry has a copyable link that opens it in a new tab', async ({ page }) => {
    await page.evaluate(
      (manual) => localStorage.setItem('manualHistoryStore', manual),
      JSON.stringify(manualHistory)
    );
    await page.reload();
    await openHistory(page);

    // It is a real link (so it can be copied / opened in a new tab), not a button.
    const link = page.getByRole('link', { name: '在新标签页打开' }).first();
    await expect(link).toHaveAttribute('target', '_blank');
    const href = await link.getAttribute('href');
    expect(href).toContain('/edit#pako:');

    // Following it loads that entry's diagram.
    await page.goto(href ?? '');
    await expect(page.locator('#view')).toContainText('Halloween');
  });

  test('keeps the active tab highlighted when switching modes', async ({ page }) => {
    await openHistory(page);
    const saved = page.getByRole('tab', { name: '收藏' });
    const timeline = page.getByRole('tab', { name: '时间线' });

    await expect(saved).toHaveAttribute('aria-selected', 'true');
    await expect(timeline).toHaveAttribute('aria-selected', 'false');

    await timeline.click();
    await expect(timeline).toHaveAttribute('aria-selected', 'true');
    await expect(saved).toHaveAttribute('aria-selected', 'false');
  });

  test('saves the current state and reports duplicates', async ({ page }) => {
    await openHistory(page);
    await expect(page.locator('#historyList li:has(button)')).toHaveCount(0);

    await page.locator('#saveHistory').click();
    await expect(page.locator('#historyList li:has(button)')).toHaveCount(1);

    // Saving again without changes does not add a duplicate and notifies the user.
    await page.locator('#saveHistory').click();
    await expect(page.getByText('当前图表已收藏')).toBeVisible();
    await expect(page.locator('#historyList li:has(button)')).toHaveCount(1);

    // Loading a different sample changes the state, so it saves as a new entry.
    await page.getByRole('button', { name: '图表模板', exact: true }).click();
    await page.getByRole('button', { name: '时序图', exact: true }).click();
    await expect(page.locator('#view')).not.toContainText('Christmas');
    await openHistory(page);
    await page.locator('#saveHistory').click();
    await expect(page.locator('#historyList li:has(button)')).toHaveCount(2);
  });

  test('auto-saves to the Timeline only, never the Saved list', async ({ page }) => {
    await openHistory(page);
    await page.locator('#saveHistory').click();
    await expect(page.locator('#historyList li:has(button)')).toHaveCount(1);

    await page.getByRole('tab', { name: '时间线' }).click();
    // A manual save must not appear under Timeline.
    await expect(page.locator('#historyList')).toContainText('暂无自动历史。');
  });

  test('deletes a single entry and clears all after confirmation', async ({ page }) => {
    await openHistory(page);
    await page.locator('#saveHistory').click();
    await page.getByRole('button', { name: '图表模板', exact: true }).click();
    await page.getByRole('button', { name: '时序图', exact: true }).click();
    await expect(page.locator('#view')).not.toContainText('Christmas');
    await openHistory(page);
    await page.locator('#saveHistory').click();
    await expect(page.locator('#historyList li:has(button)')).toHaveCount(2);

    await page.getByRole('button', { name: '删除此版本' }).first().click();
    await expect(page.locator('#historyList li:has(button)')).toHaveCount(1);

    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('#clearHistory').click();
    await expect(page.locator('#historyList li:has(button)')).toHaveCount(0);
    await expect(page.locator('#historyList')).toContainText('暂无收藏。');
  });

  test('renames a saved entry inline', async ({ page }) => {
    await openHistory(page);
    await page.locator('#saveHistory').click();
    await expect(page.locator('#historyList li:has(button)')).toHaveCount(1);

    await page.getByRole('button', { name: '重命名' }).first().click();
    const input = page.getByRole('textbox', { name: '重命名记录' });
    await input.fill('my-custom-name');
    await input.press('Enter');

    await expect(page.locator('#historyList')).toContainText('my-custom-name');
    await expect(page.locator('#historyList li:has(button)')).toHaveCount(1);
  });
});
