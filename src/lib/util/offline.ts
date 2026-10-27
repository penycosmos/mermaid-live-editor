/** Only the local app and self-contained image/font data may supply resources. */
export const isLocalResource = (value: string): boolean => {
  if (value.startsWith('#')) return true;
  if (/^data:(?:image|font)\//i.test(value)) return true;
  try {
    const url = new URL(value, window.location.href);
    return (
      url.origin === window.location.origin && ['http:', 'https:', 'blob:'].includes(url.protocol)
    );
  } catch {
    return false;
  }
};

const localValue = (value: string): boolean => {
  const decoded = value.replace(
    /\\([\da-f]{1,6})\s?|\\(.)/gi,
    (_match, hex: string | undefined, character: string) =>
      hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)) : character
  );
  return (
    !/image-set\s*\(/i.test(decoded) &&
    Array.from(decoded.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)).every((match) =>
      isLocalResource(match[2])
    )
  );
};

// Parse CSS without attaching it to a document, so imports cannot start requests.
export const localCss = (css: string): string => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const clean = (rules: CSSRuleList): void => {
    for (const rule of rules) {
      if ('style' in rule) {
        const style = (rule as CSSStyleRule).style;
        for (const property of Array.from(style)) {
          const value = style.getPropertyValue(property);
          if (!localValue(value)) {
            style.removeProperty(property);
          }
        }
      }
      if ('cssRules' in rule) clean((rule as CSSGroupingRule).cssRules);
    }
  };
  clean(sheet.cssRules);
  return Array.from(sheet.cssRules)
    .filter((rule) => rule.type !== CSSRule.IMPORT_RULE)
    .map((rule) => rule.cssText)
    .join('\n');
};

/** Clean the rendered copy, never the user's Mermaid source or saved config. */
export const keepDiagramLocal = (root: Element): void => {
  root
    .querySelectorAll('script, iframe, object, embed, link, base, meta, animate, set')
    .forEach((node) => node.remove());
  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (
        name.startsWith('on') ||
        name === 'srcset' ||
        name === 'ping' ||
        !localValue(attribute.value) ||
        (['href', 'xlink:href', 'src', 'poster', 'background', 'action', 'formaction'].includes(
          name
        ) &&
          (!isLocalResource(attribute.value) ||
            (element.localName === 'a' && /^(?:data|blob):/i.test(attribute.value))))
      ) {
        element.removeAttributeNode(attribute);
      }
    }
    if (element.hasAttribute('style'))
      element.setAttribute(
        'style',
        localCss(`x{${element.getAttribute('style')}}`).replace(/^x\s*\{|\}$/g, '')
      );
    if (element.localName === 'style') element.textContent = localCss(element.textContent ?? '');
  }
};
