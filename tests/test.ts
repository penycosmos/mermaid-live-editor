import { TID } from '$/constants';
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { verifyFileSizeGreaterThan, type EditorOptions } from './utils';

export class EditorPage {
  readonly editor: Locator;
  readonly view: Locator;

  constructor(readonly page: Page) {
    this.editor = page.locator('css=.monaco-editor');
    this.view = page.locator('#view');
  }

  async start(url = '/edit') {
    await this.page.goto(url);
    await expect(this.page)
      .toHaveURL(/.*\/edit#pako/)
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .catch(() => {});
  }

  async openCode() {
    const button = this.page.getByRole('button', { name: '代码编辑', exact: true });
    if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  }

  async typeInEditor(text: string, { bottom = true, newline = false }: EditorOptions = {}) {
    await this.openCode();
    await this.editor.click();
    if (bottom) {
      await this.page.keyboard.press('PageDown');
    }
    if (newline) {
      await this.page.keyboard.press('Enter');
    }
    await this.page.keyboard.type(text, { delay: 10 });
  }

  async clearEditor() {
    await this.openCode();
    await this.editor.click();
    await this.page.keyboard.press('Control+KeyA');
    await this.page.keyboard.press('Backspace');
  }

  async toggleActions() {
    await this.page.getByRole('button', { name: '导出', exact: true }).click();
  }

  async toggleSampleDiagrams() {
    await this.page.keyboard.press('Escape');
    await this.page.getByRole('button', { name: '图表模板', exact: true }).click();
  }

  async checkAndDownloadPNG(expectedSize: number) {
    const downloadPNGPromise = verifyFileSizeGreaterThan(this.page, 'diagram', 'png', expectedSize);
    await this.page.getByTestId(TID.downloadPNG).click();
    return await downloadPNGPromise;
  }

  async downloadSVG(expectedSize: number) {
    const downloadSVGPromise = verifyFileSizeGreaterThan(this.page, 'diagram', 'svg', expectedSize);
    await this.page.getByTestId(TID.downloadSVG).click();
    return await downloadSVGPromise;
  }

  async loadSampleDiagram(diagramName: string) {
    await this.page.keyboard.press('Escape');
    const button = this.page.getByRole('button', { name: '图表模板', exact: true });
    if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
    await this.page.locator(`button[title="${diagramName}"]`).click();
  }

  async checkTextInView(text: string) {
    await expect(this.view).toContainText(text);
  }

  async checkTextNotInView(text: string) {
    await expect(this.view).not.toContainText(text);
  }

  async checkError(text: string) {
    await expect(this.page.getByTestId(TID.errorContainer)).toContainText(text, {
      timeout: 10_000
    });
  }

  async checkInEditor(text: string) {
    await this.openCode();
    await expect(this.editor).toContainText(text);
  }

  async toggleComment(text: string) {
    await this.openCode();
    await this.editor.getByText(text).click();
    await this.page.keyboard.press('Control+/');
  }

  async setEditorMode(mode: 'Code' | 'Config') {
    await this.openCode();
    await this.page.getByRole('tab', { name: mode === 'Code' ? '图表代码' : '渲染配置' }).click();
  }

  async toggleTheme() {
    await this.page.getByTestId(TID.themeToggleButton).click();
  }

  async checkTheme(theme: 'light' | 'dark') {
    await expect(this.page.getByTestId(TID.themeToggleButton)).toHaveAttribute(
      'title',
      `切换为${theme === 'light' ? '深色' : '浅色'}主题`
    );
  }
}

export const test = base.extend<{ editPage: EditorPage }>({
  editPage: async ({ page }, use) => {
    const editorPage = new EditorPage(page);
    await editorPage.start();
    await editorPage.openCode();
    await use(editorPage);
  }
});

export { expect } from '@playwright/test';
