import { expect, test, type Page } from '@playwright/test';
import { cmd } from './utils';

const storedText = (page: Page, field: 'code' | 'mermaid'): Promise<string> =>
  page.evaluate((field) => JSON.parse(localStorage.getItem('codeStore') ?? '{}')[field], field);

for (const mobile of [false, true]) {
  for (const field of ['code', 'mermaid'] as const) {
    test(`${mobile ? 'mobile' : 'desktop'} ${field} preserves undo across sidebar changes`, async ({
      page
    }) => {
      await page.setViewportSize({ width: mobile ? 390 : 1280, height: 900 });
      await page.goto('/edit');
      await expect(page.locator('#view svg')).toBeVisible();
      const openCode = page.getByRole('button', { name: '代码编辑', exact: true });
      await openCode.click();
      if (field === 'mermaid') await page.getByRole('tab', { name: '渲染配置' }).click();
      const editor = mobile
        ? page.locator('.cm-content')
        : page.getByRole('textbox', { name: 'Editor content', exact: true });
      const editorRoot = page.locator(mobile ? '.cm-editor' : '.monaco-editor');
      await expect(editorRoot).toBeVisible();
      const original = await storedText(page, field);
      await editor.focus();
      // Loading a document must not become an undoable user edit.
      await page.keyboard.press(`${cmd}+z`);
      await expect.poll(() => storedText(page, field)).toBe(original);
      await page.keyboard.press(`${cmd}+End`);
      await page.keyboard.type(' ');
      await expect.poll(() => storedText(page, field)).toBe(`${original} `);
      for (const nextPanel of ['收起侧栏', '本地历史', '图表模板']) {
        await page.getByRole('button', { name: nextPanel, exact: true }).click();
        await expect(editorRoot).toBeHidden();
        await openCode.click();
        await expect(editorRoot).toBeVisible();
        await editor.focus();
        await page.keyboard.press(`${cmd}+z`);
        await expect.poll(() => storedText(page, field)).toBe(original);
        await page.keyboard.press(`${cmd}+Shift+z`);
        await expect.poll(() => storedText(page, field)).toBe(`${original} `);
      }
      const otherField = field === 'code' ? 'mermaid' : 'code';
      const otherOriginal = await storedText(page, otherField);
      await page.getByRole('tab', { name: field === 'code' ? '渲染配置' : '图表代码' }).click();
      await editor.focus();
      await page.keyboard.press(`${cmd}+End`);
      await page.keyboard.type('  ');
      await expect.poll(() => storedText(page, otherField)).toBe(`${otherOriginal}  `);
      await page.getByRole('tab', { name: field === 'code' ? '图表代码' : '渲染配置' }).click();
      await editor.focus();
      await page.keyboard.press(`${cmd}+z`);
      await expect.poll(() => storedText(page, field)).toBe(original);
      expect(await storedText(page, otherField)).toBe(`${otherOriginal}  `);
    });
  }
}
