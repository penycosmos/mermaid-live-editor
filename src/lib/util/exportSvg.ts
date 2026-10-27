import { keepDiagramLocal } from './offline';

/** Build a self-contained copy without changing the preview's DOM. */
export const prepareExportSvg = async (
  source: SVGSVGElement,
  rough: boolean
): Promise<SVGSVGElement> => {
  const svg = source.cloneNode(true) as SVGSVGElement;
  keepDiagramLocal(svg);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  svg.style.backgroundColor = getComputedStyle(document.body).getPropertyValue('--background');

  if (rough) {
    for (const foreignObject of svg.querySelectorAll('foreignObject')) {
      const height = Number(foreignObject.getAttribute('height'));
      if (height <= 0) continue;
      // Centered rough labels extend beyond the measured viewport on both axes.
      foreignObject.style.overflow = 'visible';
      foreignObject.setAttribute('height', String(height * 1.5));
      foreignObject.setAttribute(
        'y',
        String(Number(foreignObject.getAttribute('y') ?? 0) - height / 4)
      );
      for (const element of foreignObject.querySelectorAll<HTMLElement>('div, span, p')) {
        Object.assign(element.style, {
          alignItems: 'center',
          display: 'flex',
          height: '100%',
          justifyContent: 'center'
        });
      }
    }
  }

  if (svg.querySelector('[class*="fa-"]')) {
    const { fontAwesomeCss } = await import('./exportFonts');
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = fontAwesomeCss;
    svg.prepend(style);
  }

  const resources = new Map<string, Promise<string>>();
  const inline = (url: string): Promise<string> => {
    if (url.startsWith('#') || url.startsWith('data:')) return Promise.resolve(url);
    let resource = resources.get(url);
    if (!resource) {
      resource = (async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('无法读取本地图表资源');
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('无法内嵌本地图表资源'));
          reader.readAsDataURL(blob);
        });
      })();
      resources.set(url, resource);
    }
    return resource;
  };
  for (const image of svg.querySelectorAll('image, img, feImage')) {
    for (const attribute of ['src', 'href', 'xlink:href']) {
      const url = image.getAttribute(attribute);
      if (url) image.setAttribute(attribute, await inline(url));
    }
  }
  // Include CSS resources too, including local images and custom local fonts.
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    for (const name of [
      'style',
      'fill',
      'stroke',
      'filter',
      'clip-path',
      'mask',
      'marker-start',
      'marker-mid',
      'marker-end'
    ]) {
      let value = element.getAttribute(name);
      if (!value) continue;
      for (const match of value.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi))
        value = value.replace(match[0], `url("${await inline(match[2])}")`);
      element.setAttribute(name, value);
    }
    if (element.localName === 'style') {
      let css = element.textContent ?? '';
      for (const match of css.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi))
        css = css.replace(match[0], `url("${await inline(match[2])}")`);
      element.textContent = css;
    }
  }
  return svg;
};
