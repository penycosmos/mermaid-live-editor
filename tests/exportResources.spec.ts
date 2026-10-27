import { defaultState, TID } from '$/constants';
import { serializeState } from '$/util/serde';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('downloaded SVG and PNG preserve the local SVG image viewport', async ({ page }, testInfo) => {
  const fragment = '#svgView(viewBox(0,0,20,20))';
  await page.goto(
    `/edit#${serializeState({
      ...defaultState,
      code: `flowchart TD\n A@{ img: "/favicon.svg${fragment}", label: "Image", h: 60 }`,
      panZoom: false
    })}`
  );
  await expect(page.locator('#view image')).toBeVisible();
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const files: Record<string, string> = {};
  for (const [format, id] of [
    ['svg', TID.downloadSVG],
    ['png', TID.downloadPNG]
  ]) {
    const pending = page.waitForEvent('download');
    await page.getByTestId(id).click();
    const download = await pending;
    const path = testInfo.outputPath(`local-viewport.${format}`);
    await download.saveAs(path);
    files[format] = (await readFile(path)).toString(format === 'svg' ? 'utf8' : 'base64');
  }
  const result = await page.evaluate(
    async ({ files, fragment }) => {
      const svg = new DOMParser().parseFromString(files.svg, 'image/svg+xml').documentElement;
      const image = svg.querySelector('image');
      if (!image) throw new Error('Exported image is missing');
      const href = image.getAttribute('href') ?? image.getAttribute('xlink:href') ?? '';
      const load = (source: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('Cannot load downloaded image'));
          image.src = source;
        });
      const actual = await load(`data:image/png;base64,${files.png}`);
      const canvas = document.createElement('canvas');
      canvas.width = actual.width;
      canvas.height = actual.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas context is missing');
      const pixels = (image: HTMLImageElement) => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = getComputedStyle(document.body).getPropertyValue('--background');
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const actualPixels = pixels(actual);
      const reference = async (hash: string) => {
        for (const attribute of ['href', 'xlink:href']) {
          if (image.hasAttribute(attribute))
            image.setAttribute(attribute, href.split('#')[0] + hash);
        }
        return pixels(await load(`data:image/svg+xml,${encodeURIComponent(svg.outerHTML)}`));
      };
      const expected = await reference(fragment);
      const withoutFragment = await reference('');
      const differences = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
        let count = 0;
        for (let offset = 0; offset < a.length; offset += 4)
          if (a.slice(offset, offset + 4).some((value, channel) => value !== b[offset + channel]))
            count++;
        return count;
      };
      return {
        href,
        incorrectPixels: differences(actualPixels, expected),
        fragmentPixels: differences(withoutFragment, expected)
      };
    },
    { files, fragment }
  );
  expect(result.fragmentPixels).toBeGreaterThan(100);
  expect(result.incorrectPixels).toBe(0);
  expect(result.href).toMatch(/^data:image\/svg\+xml;base64,/);
  expect(result.href.endsWith(fragment)).toBe(true);
});
