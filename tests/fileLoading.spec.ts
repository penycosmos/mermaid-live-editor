import { defaultState } from '$/constants';
import { expect, test, type Page } from '@playwright/test';
import { cmd } from './utils';

declare global {
  interface Window {
    finishFileRead: Record<string, () => void>;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (state) => {
      localStorage.setItem(
        'manualHistoryStore',
        JSON.stringify([{ id: 'saved', type: 'manual', time: Date.now(), name: 'Saved', state }])
      );
      const read = File.prototype.text;
      window.finishFileRead = {};
      File.prototype.text = function () {
        if (!this.name.startsWith('pending')) return read.call(this);
        return new Promise((resolve, reject) => {
          window.finishFileRead[this.name] = () => {
            read.call(this).then(resolve, reject);
          };
        });
      };
    },
    { ...defaultState, code: 'flowchart TD\n A[Saved]' }
  );
  await page.goto('/edit');
  await expect(page.locator('#view svg')).toBeVisible();
});

const selectFile = async (page: Page, name: string) => {
  await page.getByTestId('source-file-input').setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(`flowchart TD\n A[${name}]`)
  });
  if (name.startsWith('pending'))
    await expect
      .poll(() => page.evaluate((name) => !!window.finishFileRead[name], name))
      .toBe(true);
};
const finishRead = (page: Page, name: string) =>
  page.evaluate(async (name) => {
    window.finishFileRead[name]();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }, name);
const storedCode = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('codeStore') ?? '{}').code);

for (const operation of ['new', 'template', 'history', 'typing']) {
  test(`a pending file cannot replace a later ${operation} operation`, async ({ page }) => {
    await selectFile(page, 'pending-old.mmd');
    if (operation === 'new') await page.getByRole('button', { name: '新建图表' }).click();
    if (operation === 'template') {
      await page.getByRole('button', { name: '图表模板', exact: true }).click();
      await page.getByRole('button', { name: '时序图', exact: true }).click();
      await expect(page.locator('#view .actor').first()).toBeVisible();
    }
    if (operation === 'history') {
      await page.getByRole('button', { name: '本地历史', exact: true }).click();
      await page.getByRole('button', { name: '恢复此版本' }).click();
      await expect(page.locator('#view')).toContainText('Saved');
    }
    if (operation === 'typing') {
      await page.getByRole('button', { name: '代码编辑', exact: true }).click();
      await page.getByRole('textbox', { name: 'Editor content', exact: true }).focus();
      await page.keyboard.press(`${cmd}+End`);
      await page.keyboard.type(' ');
      await expect.poll(() => storedCode(page)).toBe(`${defaultState.code} `);
    }
    const expected = await storedCode(page);
    await finishRead(page, 'pending-old.mmd');
    await expect(page.getByTestId('source-file-input')).toHaveValue('');
    expect(await storedCode(page)).toBe(expected);
    await expect(page.locator('.workspace-header')).not.toContainText('pending-old.mmd');
  });
}

for (const order of ['old-first', 'new-first']) {
  test(`only the latest selected file is applied: ${order}`, async ({ page }) => {
    await selectFile(page, 'pending-old.mmd');
    await selectFile(page, 'pending-new.mmd');
    if (order === 'old-first') {
      await finishRead(page, 'pending-old.mmd');
      await expect(page.getByTestId('source-file-input')).toHaveValue(/pending-new\.mmd$/);
    }
    await finishRead(page, 'pending-new.mmd');
    await expect(page.locator('#view')).toContainText('pending-new.mmd');
    if (order === 'new-first') await finishRead(page, 'pending-old.mmd');
    expect(await storedCode(page)).toBe('flowchart TD\n A[pending-new.mmd]');
    await expect(page.locator('.workspace-header')).toContainText('pending-new.mmd');
  });
}

test('view and theme changes do not cancel a pending file or reset its config', async ({
  page
}) => {
  await selectFile(page, 'pending-source.mmd');
  await page.getByRole('button', { name: '背景网格', exact: true }).click();
  await page.getByRole('button', { name: '切换为深色主题' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const config = await page.evaluate(
    () => JSON.parse(localStorage.getItem('codeStore') ?? '{}').mermaid
  );
  await finishRead(page, 'pending-source.mmd');
  await expect(page.locator('#view')).toContainText('pending-source.mmd');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('codeStore') ?? '{}'));
  expect(state.mermaid).toBe(config);
  expect(state.grid).toBe(false);
});
