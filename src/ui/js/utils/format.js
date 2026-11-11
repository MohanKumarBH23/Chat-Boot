/**
 * Pure formatting, date math, and XSS-safe Markdown rendering helpers.
 * @module ui/utils/format
 */

/**
 * Computes non-negative whole-day difference between two YYYY-MM-DD ISO dates.
 * @param {string} fromIso - Earlier baseline ISO date.
 * @param {string} toIso - Later reference ISO date.
 * @returns {number | null} Non-negative day delta or null when invalid.
 */
export function diffIsoDays(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const fromMs = Date.parse(`${fromIso}T00:00:00Z`);
  const toMs = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return null;
  return Math.max(0, Math.round((toMs - fromMs) / 86400000));
}

/**
 * Formats a temporal ruler stamp (`YYYY-MM-DD · -Nd · Tag`).
 * @param {string} iso - Date string in YYYY-MM-DD format.
 * @param {string} todayIso - Current workspace ISO date.
 * @param {string} tag - Ruler label suffix.
 * @returns {string}
 */
export function formatDateStamp(iso, todayIso, tag) {
  if (!iso) return `-- · ${tag}`;
  const delta = diffIsoDays(iso, todayIso);
  const deltaPart = typeof delta === 'number' ? ` · -${delta}d` : '';
  return `${iso}${deltaPart} · ${tag}`;
}

/**
 * Truncates text at word boundaries to a readable thread title.
 * @param {string} text - Raw prompt or title text.
 * @param {number} [maxLen=56] - Maximum character length.
 * @returns {string}
 */
export function truncateWords(text, maxLen = 56) {
  const clean = String(text || '').trim().replace(/\s+/g, ' ');
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = lastSpace > Math.floor(maxLen * 0.5) ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.replace(/[,:;.\-\s]+$/, '')}…`;
}

/**
 * Escapes HTML special characters to neutralize raw HTML injection.
 * @param {unknown} value - Untrusted string value.
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unescapeHtmlBasic(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Validates that a link target uses http/https with no embedded credentials.
 * @param {string} url - Candidate URL.
 * @returns {string} Safe normalized URL or '#'.
 */
export function safeUrl(url) {
  try {
    const parsed = new URL(String(url));
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password) {
      return parsed.href;
    }
  } catch {
    // Ignore malformed URLs and fall back to '#'
  }
  return '#';
}

function formatInline(raw) {
  let out = escapeHtml(raw);
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
    const validated = escapeHtml(safeUrl(unescapeHtmlBasic(url)));
    return `<a href="${validated}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  return out;
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * Renders limited Markdown safely into HTML (escaping all raw tags first).
 * @param {string} md - Assistant Markdown content.
 * @returns {string} Safe sanitized HTML markup.
 */
export function renderMarkdown(md) {
  const lines = String(md || '').split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trimEnd();

    if (!line.trim() || /^---+$/.test(line.trim())) {
      i++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(4, Math.max(3, headingMatch[1].length));
      blocks.push(`<h${level}>${formatInline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|/.test(lines[i + 1])) {
      const headers = splitTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      const thead = `<thead><tr>${headers.map((h) => `<th>${formatInline(h)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${formatInline(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`;
      blocks.push(`<div class="markdown-table-wrap"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${formatInline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const firstMatch = line.match(/^\s*(\d+)\.\s+/);
      const startNum = firstMatch ? Number(firstMatch[1]) : 1;
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${formatInline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i++;
      }
      blocks.push(startNum > 1 ? `<ol start="${startNum}">${items.join('')}</ol>` : `<ol>${items.join('')}</ol>`);
      continue;
    }

    const paraLines = [line.trim()];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,4}\s+|---+$|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i])
    ) {
      if (lines[i].includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|/.test(lines[i + 1])) {
        break;
      }
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push(`<p>${formatInline(paraLines.join(' '))}</p>`);
  }

  return blocks.join('');
}

