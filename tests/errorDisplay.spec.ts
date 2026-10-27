import { expect, test } from './test';

test('shows a local syntax error without any online repair actions', async ({ editPage, page }) => {
  await editPage.clearEditor();
  await editPage.typeInEditor('not a diagram');
  await expect(page.getByTestId('error-container')).toContainText('图表语法有误');
  await expect(page.getByRole('link', { name: /AI|Repair/ })).toHaveCount(0);
});

test('shows JSON errors locally in the config tab', async ({ editPage, page }) => {
  await editPage.setEditorMode('Config');
  await editPage.clearEditor();
  await editPage.typeInEditor('{ invalid');
  await expect(page.getByTestId('error-container')).toContainText('配置格式有误');
});
