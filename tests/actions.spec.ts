import { defaultState, TID } from '$/constants';
import { serializeState } from '$/util/serde';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expect, test } from './test';

const missingTextPixels = (page: Page, png?: string) =>
  page.evaluate(async (png) => {
    const svgSource = document.documentElement.dataset.exportSvg;
    if (!svgSource) throw new Error('Exported SVG was not captured');
    const svgText = await (await fetch(svgSource)).text();
    const svg = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
    const loadImage = (source: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Exported image could not be loaded'));
        image.src = source;
      });
    const previewBox = document.querySelector('#container svg')?.getBoundingClientRect();
    // SVG downloads retain the preview's pan/zoom transform instead of a viewBox.
    const viewBox =
      svg.getAttribute('viewBox')?.split(/[ ,]+/).map(Number) ??
      (previewBox && [0, 0, previewBox.width, previewBox.height]);
    if (!viewBox) throw new Error('Exported SVG has no viewBox');
    svg.setAttribute('viewBox', viewBox.join(' '));
    svg.setAttribute('width', String(Math.trunc(viewBox[2] * 2)));
    svg.setAttribute('height', String(Math.trunc(viewBox[3] * 2)));
    const actual = await loadImage(
      png ?? `data:image/svg+xml,${encodeURIComponent(svg.outerHTML)}`
    );
    svg.setAttribute('width', String(actual.width));
    svg.setAttribute('height', String(actual.height));
    // Expand only the clipping viewport; keep the HTML layout and glyph positions fixed.
    for (const foreignObject of svg.querySelectorAll('foreignObject')) {
      const content = foreignObject.querySelector('div');
      if (!content) throw new Error('Label content is missing');
      for (const [position, size] of [
        ['x', 'width'],
        ['y', 'height']
      ]) {
        const extent = Number(foreignObject.getAttribute(size));
        foreignObject.setAttribute(
          position,
          String(Number(foreignObject.getAttribute(position)) - 32)
        );
        foreignObject.setAttribute(size, String(extent + 64));
        if (size === 'height') content.style.height = `${extent}px`;
      }
      content.style.transform = 'translate(32px, 32px)';
    }
    const reference = await loadImage(`data:image/svg+xml,${encodeURIComponent(svg.outerHTML)}`);
    const canvas = document.createElement('canvas');
    canvas.width = actual.width;
    canvas.height = actual.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context is missing');
    context.drawImage(actual, 0, 0);
    const actualPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(reference, 0, 0);
    const referencePixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = 0;
    let right = 0;
    for (let offset = 0; offset < actualPixels.length; offset += 4) {
      if (
        Math.max(...referencePixels.slice(offset, offset + 3)) < 130 &&
        Math.min(...actualPixels.slice(offset, offset + 3)) > 220
      ) {
        if ((offset / 4) % canvas.width < canvas.width / 2) left++;
        else right++;
      }
    }
    return { left, right, width: actual.width, height: actual.height };
  }, png);

test.describe('Check actions', () => {
  test.beforeEach(async ({ editPage }) => {
    await editPage.toggleActions();
  });

  test('should update markdown code', async ({ editPage }) => {
    const oldText = await editPage.markdownInput.inputValue();
    await editPage.typeInEditor('C --> HistoryTest', { bottom: true, newline: true });
    await expect(editPage.markdownInput).not.toHaveValue(oldText);
  });

  test.skip('should load gists from URL', async ({ page }) => {
    await page
      .locator('#gist')
      .fill('https://gist.github.com/sidharthv96/6268a23e673a533dcb198f241fd7012a');
    await page.getByText('Load Gist').click();
    await expect(page.getByText('Go shopping!!')).toBeVisible();
  });

  test('should download png and svg', async ({ editPage }) => {
    const firstPngSize = await editPage.checkAndDownloadPNG(20_000);
    const firstSvgSize = await editPage.downloadSVG(10_000);

    // Verify downloaded file is different for different diagrams
    await editPage.toggleSampleDiagrams();
    await editPage.loadSampleDiagram('Entity Relationship');

    const secondPngSize = await editPage.checkAndDownloadPNG(20_000);
    const secondSvgSize = await editPage.downloadSVG(10_000);

    // Verify files are actually different
    expect(firstPngSize).not.toBe(secondPngSize);
    expect(firstSvgSize).not.toBe(secondSvgSize);
  });
});

for (const [label, format, sizeMode, rough] of [
  ['ABCDEFGHIJKLMNO', 'PNG', 'Auto', true],
  ['ABCDEFGHIJKLMNO', 'PNG', 'Width', true],
  ['ABCDEFGHIJKLMNO', 'PNG', 'Height', true],
  ['文字刚好挤满卡片', 'PNG', 'Auto', true],
  ['文字刚好挤满卡片宽度<br/>第二行文字底部', 'PNG', 'Auto', true],
  ['ABCDEFGHIJKLMNO', 'SVG', 'Auto', true],
  ['ABCDEFGHIJKLMNO', 'Copy Image', 'Auto', true],
  ['ABCDEFGHIJKLMNO', 'PNG', 'Auto', false]
] as const) {
  test(`${rough ? 'should export hand-drawn labels without clipping' : 'should preserve classic labels'}: ${format} ${sizeMode} ${label}`, async ({
    editPage,
    page
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await editPage.start(
      `/edit#${serializeState({
        ...defaultState,
        code: `flowchart TD\n A["${label}"]`,
        rough,
        panZoom: false
      })}`
    );
    await editPage.checkTextInView(label.split('<br/>')[0]);
    await editPage.toggleActions();
    const previewLabel = page.locator('#container foreignObject').first();
    const previewStyles = await previewLabel.getAttribute('style');
    const previewMarkup = await previewLabel.evaluate((element) =>
      new XMLSerializer().serializeToString(element)
    );
    if (sizeMode !== 'Auto') {
      await page.getByRole('radio', { name: sizeMode, exact: true }).click();
      await page.getByRole('spinbutton').fill('256');
    }
    await page.evaluate((copy) => {
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...coordinates: number[]) {
        if (image instanceof HTMLImageElement && image.src.startsWith('data:image/svg+xml')) {
          document.documentElement.dataset.exportSvg = image.src;
        }
        Reflect.apply(drawImage, this, [image, ...coordinates]);
      };
      if (copy) {
        Object.defineProperty(navigator.clipboard, 'write', {
          value: async (items: ClipboardItem[]) => {
            const blob = await items[0].getType('image/png');
            await new Promise<void>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                document.documentElement.dataset.clipboardPng = String(reader.result);
                resolve();
              };
              reader.onerror = () => reject(new Error('Clipboard PNG could not be read'));
              reader.readAsDataURL(blob);
            });
          }
        });
      }
    }, format === 'Copy Image');
    let png: string | undefined;
    if (format === 'Copy Image') {
      await page.getByRole('button', { name: format, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-clipboard-png', /^data:image\/png/);
      png = await page.evaluate(() => document.documentElement.dataset.clipboardPng);
    } else {
      const pendingDownload = page.waitForEvent('download');
      await page.getByTestId(format === 'PNG' ? TID.downloadPNG : TID.downloadSVG).click();
      const download = await pendingDownload;
      const path = testInfo.outputPath(`diagram.${format.toLowerCase()}`);
      await download.saveAs(path);
      const image = `data:image/${format === 'PNG' ? 'png' : 'svg+xml'};base64,${(await readFile(path)).toString('base64')}`;
      if (format === 'PNG') png = image;
      else
        await page.evaluate((svg) => {
          document.documentElement.dataset.exportSvg = svg;
        }, image);
    }
    expect(await previewLabel.getAttribute('style')).toBe(previewStyles);
    if (!rough) {
      const exportedMarkup = await page.evaluate(async () => {
        const source = document.documentElement.dataset.exportSvg;
        if (!source) throw new Error('Exported SVG was not captured');
        const svgText = await (await fetch(source)).text();
        const label = new DOMParser()
          .parseFromString(svgText, 'image/svg+xml')
          .querySelector('foreignObject');
        if (!label) throw new Error('Exported label is missing');
        return new XMLSerializer().serializeToString(label);
      });
      expect(exportedMarkup).toBe(previewMarkup);
      return;
    }
    const result = await missingTextPixels(page, png);
    expect(result).toMatchObject({ left: 0, right: 0 });
    if (sizeMode === 'Width') expect(result.width).toBe(256);
    if (sizeMode === 'Height') expect(result.height).toBe(256);
  });
}
