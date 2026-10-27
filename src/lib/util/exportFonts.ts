import css from '@fortawesome/fontawesome-free/css/all.css?raw';
import brands from '@fortawesome/fontawesome-free/webfonts/fa-brands-400.woff2?inline';
import regular from '@fortawesome/fontawesome-free/webfonts/fa-regular-400.woff2?inline';
import solid from '@fortawesome/fontawesome-free/webfonts/fa-solid-900.woff2?inline';
import compatibility from '@fortawesome/fontawesome-free/webfonts/fa-v4compatibility.woff2?inline';

// Loaded only for exports containing Font Awesome labels.
export const fontAwesomeCss = css
  .replaceAll('../webfonts/fa-brands-400.woff2', brands)
  .replaceAll('../webfonts/fa-regular-400.woff2', regular)
  .replaceAll('../webfonts/fa-solid-900.woff2', solid)
  .replaceAll('../webfonts/fa-v4compatibility.woff2', compatibility);
