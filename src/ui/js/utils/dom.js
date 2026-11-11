/**
 * Reusable safe DOM element constructors.
 * @module ui/utils/dom
 */
import { safeUrl } from './format.js';

/**
 * Retrieves a required DOM element by ID, failing fast if markup is missing.
 * @param {string} id - Element ID.
 * @returns {HTMLElement}
 */
export function qs(id) {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Required UI element #${id} not found in document`);
  }
  return el;
}

/**
 * Builds an accessible inline close SVG icon.
 * @returns {SVGElement}
 */
export function createSvgCloseIcon() {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svgNs, 'path');
  path.setAttribute('d', 'M18 6L6 18M6 6l12 12');
  svg.appendChild(path);
  return svg;
}

/**
 * Builds a single spectral search query badge line.
 * @param {string} queryText - Executed search query text.
 * @returns {HTMLSpanElement}
 */
export function createQueryLine(queryText) {
  const line = document.createElement('span');
  line.className = 'query-line';
  const mark = document.createElement('span');
  mark.className = 'emit-mark live-cyan';
  mark.setAttribute('aria-hidden', 'true');
  const qText = document.createElement('span');
  qText.className = 'query-text';
  qText.textContent = queryText;
  line.appendChild(mark);
  line.appendChild(qText);
  return line;
}

/**
 * Builds a verified external citation link element.
 * @param {{ url: string, title?: string, snippet?: string, domain?: string, publishedDate?: string }} source
 * @param {boolean} [includeSnippet=false] - Show source snippet in inspector modal.
 * @returns {HTMLAnchorElement}
 */
export function createSourceAnchor(source, includeSnippet = false) {
  const link = document.createElement('a');
  link.className = 'source-item';
  link.href = safeUrl(source.url);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  if (includeSnippet) {
    const bodyWrap = document.createElement('div');
    const titleEl = document.createElement('div');
    titleEl.className = 'source-item-title';
    titleEl.textContent = source.title || 'Untitled source';
    const snipEl = document.createElement('div');
    snipEl.className = 'inspector-snippet';
    snipEl.textContent = source.snippet || '';
    bodyWrap.appendChild(titleEl);
    bodyWrap.appendChild(snipEl);
    link.appendChild(bodyWrap);
  } else {
    const titleSpan = document.createElement('span');
    titleSpan.className = 'source-item-title';
    titleSpan.textContent = source.title || 'Untitled source';
    link.appendChild(titleSpan);
  }

  const metaSpan = document.createElement('span');
  metaSpan.className = 'source-item-meta';
  metaSpan.textContent = `${source.domain || 'web'}${source.publishedDate ? ` · ${source.publishedDate}` : ''}`;
  link.appendChild(metaSpan);

  return link;
}

