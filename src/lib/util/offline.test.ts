import { describe, expect, it } from 'vitest';
import { isLocalResource, keepDiagramLocal, localCss } from './offline';

describe('offline resources', () => {
  it('allows local assets and inline images but rejects external and executable URLs', () => {
    for (const url of ['/font.woff2', '#marker', 'data:image/png;base64,AA=='])
      expect(isLocalResource(url)).toBe(true);
    for (const url of [
      'https://outside.invalid/a',
      '//outside.invalid/a',
      'javascript:alert(1)',
      'data:text/html,x'
    ])
      expect(isLocalResource(url)).toBe(false);
  });

  it('cleans nested and escaped CSS resources without removing SVG markers', () => {
    const css = localCss(
      '@import "https://outside.invalid/font.css"; @media all { .node {fill:url(#paint);stroke:u\\72l(https://outside.invalid/a)} }'
    );
    expect(css).toContain('#paint');
    expect(css).not.toContain('outside.invalid');
  });

  it('removes external HTML/SVG links and images from the copy', () => {
    const template = document.createElement('template');
    template.innerHTML =
      '<svg><a href="https://outside.invalid"><text>Keep text</text></a><image href="//outside.invalid/a"/><foreignObject><img src="https://outside.invalid/a" onerror="alert(1)"/></foreignObject><path fill="url(#paint)"/></svg>';
    const svg = template.content.querySelector('svg');
    if (!svg) throw new Error('missing SVG');
    keepDiagramLocal(svg);
    expect(svg.outerHTML).not.toContain('outside.invalid');
    expect(svg.outerHTML).not.toContain('onerror');
    expect(svg.textContent).toContain('Keep text');
    expect(svg.outerHTML).toContain('url(#paint)');
  });
});
