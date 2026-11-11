import { TemporalAnchor } from '../../types/index.js';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatHumanDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function resolveRelativeDate(
  userMessage: string,
  now: Date,
  currentDayIdx: number
): { date: Date; description: string } | null {
  const lower = userMessage.toLowerCase();

  const dateRegex =
    /(?:(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:\s+(\d{4}))?)|(?:(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?)/i;
  const dateMatch = lower.match(dateRegex);

  if (dateMatch) {
    const dayNum = parseInt(dateMatch[1] || dateMatch[5], 10);
    const monthAbbr = (dateMatch[2] || dateMatch[4]).toLowerCase().slice(0, 3);
    const explicitYear = dateMatch[3] || dateMatch[6];
    const monthIdx = MONTHS.indexOf(monthAbbr);

    if (monthIdx !== -1 && dayNum >= 1 && dayNum <= 31) {
      const year = explicitYear ? parseInt(explicitYear, 10) : now.getFullYear();
      let candidate = new Date(year, monthIdx, dayNum);
      if (!explicitYear && candidate.getTime() > now.getTime()) {
        candidate = new Date(year - 1, monthIdx, dayNum);
      }
      const capMonth = monthAbbr.charAt(0).toUpperCase() + monthAbbr.slice(1);
      return { date: candidate, description: `${dayNum} ${capMonth}` };
    }
  }

  if (/\btoday\b/.test(lower)) {
    return { date: new Date(now), description: 'today' };
  }

  if (/\byesterday\b/.test(lower)) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    return { date, description: 'yesterday' };
  }

  const agoMatch = lower.match(/\b(\d+)\s+(day|days|week|weeks)\s+ago\b/);
  if (agoMatch) {
    const amount = parseInt(agoMatch[1], 10);
    const days = agoMatch[2].startsWith('week') ? amount * 7 : amount;
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    return { date, description: `${amount} ${agoMatch[2]} ago` };
  }

  const weekdayMatches = Array.from(
    lower.matchAll(/\b(last\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g)
  );
  if (weekdayMatches.length > 0) {
    // Prefer explicit "last <weekday>" phrasing when multiple weekdays appear in one sentence.
    const chosen = weekdayMatches.find((m) => Boolean(m[1])) || weekdayMatches[0];
    const isExplicitLast = Boolean(chosen[1]);
    const dayName = chosen[2];
    const targetDayIdx = WEEKDAYS.indexOf(dayName);

    let diff = currentDayIdx - targetDayIdx;
    if (diff <= 0 || isExplicitLast) {
      diff += 7;
    }

    const date = new Date(now);
    date.setDate(date.getDate() - diff);
    const capDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    const shortDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return {
      date,
      description: `${isExplicitLast ? 'last ' : ''}${capDay} (${shortDate})`,
    };
  }

  return null;
}

/**
 * Deterministic calendar parser resolving current clock and past date anchors cleanly outside the LLM.
 */
export function resolveTemporalAnchor(userMessage: string, simulatedDate?: Date): TemporalAnchor {
  const now = simulatedDate ? new Date(simulatedDate) : new Date();
  const currentDayIdx = now.getDay();
  const currentDayOfWeek =
    WEEKDAYS[currentDayIdx].charAt(0).toUpperCase() + WEEKDAYS[currentDayIdx].slice(1);

  const currentIsoTimestamp = now.toISOString();
  const currentDateIso = formatIsoDate(now);
  const currentFormatted = formatHumanDate(now);

  const resolved = resolveRelativeDate(userMessage, now, currentDayIdx);
  if (!resolved) {
    return {
      currentIsoTimestamp,
      currentDateIso,
      currentDayOfWeek,
      currentFormatted,
    };
  }

  const referenceDateIso = formatIsoDate(resolved.date);
  const referenceFormatted = formatHumanDate(resolved.date);
  const d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d2 = new Date(resolved.date.getFullYear(), resolved.date.getMonth(), resolved.date.getDate());
  const deltaDays = Math.max(0, Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    currentIsoTimestamp,
    currentDateIso,
    currentDayOfWeek,
    currentFormatted,
    referenceDateIso,
    referenceFormatted,
    relativeDescription: resolved.description,
    deltaDays,
  };
}

