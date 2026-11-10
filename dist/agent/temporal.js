export class TemporalReasoner {
    baseDate;
    constructor(baseDate) {
        this.baseDate = baseDate || new Date();
    }
    getCurrentDate() {
        return new Date(this.baseDate);
    }
    formatHuman(date) {
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    }
    /**
     * Timezone-safe local YYYY-MM-DD formatting (prevents UTC offset shifts).
     */
    formatIsoDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    /**
     * Resolves natural language date references to concrete Calendar dates.
     */
    resolveDateExpression(expr) {
        const text = expr.toLowerCase().trim();
        const now = this.getCurrentDate();
        const currentDayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday, 2 is Tuesday, etc.
        const daysMap = {
            sunday: 0,
            monday: 1,
            tuesday: 2,
            wednesday: 3,
            thursday: 4,
            friday: 5,
            saturday: 6,
        };
        if (text.includes('today')) {
            return { date: new Date(now), description: 'today' };
        }
        if (text.includes('yesterday')) {
            const d = new Date(now);
            d.setDate(d.getDate() - 1);
            return { date: d, description: 'yesterday' };
        }
        // Check calendar dates like "3 November", "Nov 3", "November 3rd"
        const monthPattern = /(?:(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))|(?:(?:on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?)/i;
        const match = text.match(monthPattern);
        if (match) {
            const monthNames = [
                'jan', 'feb', 'mar', 'apr', 'may', 'jun',
                'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
            ];
            let day;
            let monthStr;
            if (match[1] && match[2]) {
                day = parseInt(match[1], 10);
                monthStr = match[2].toLowerCase().slice(0, 3);
            }
            else {
                monthStr = match[3].toLowerCase().slice(0, 3);
                day = parseInt(match[4], 10);
            }
            const monthIdx = monthNames.indexOf(monthStr);
            if (monthIdx !== -1) {
                const year = now.getFullYear();
                const resolved = new Date(year, monthIdx, day);
                return {
                    date: resolved,
                    description: `${day} ${monthStr.toUpperCase()}`,
                };
            }
        }
        // Check specific day of week (e.g. "on monday", "last tuesday")
        for (const [dayName, targetDayNum] of Object.entries(daysMap)) {
            if (text.includes(dayName)) {
                const isExplicitLast = text.includes('last ' + dayName);
                let diff = currentDayOfWeek - targetDayNum;
                if (diff === 0) {
                    // Today is that day
                    diff = isExplicitLast ? 7 : 0;
                }
                else if (diff > 0) {
                    // The day occurred earlier this week
                    diff = isExplicitLast ? diff + 7 : diff;
                }
                else {
                    // The day is later this week (e.g. today is Tuesday, target is Friday)
                    diff = diff + 7;
                    if (isExplicitLast)
                        diff += 7;
                }
                const resolved = new Date(now);
                resolved.setDate(resolved.getDate() - diff);
                return {
                    date: resolved,
                    description: `${isExplicitLast ? 'last ' : ''}${dayName}`,
                };
            }
        }
        return null;
    }
    /**
     * Generates a rich TemporalContext object for prompt injection and delta calculation.
     */
    buildTemporalContext(userPrompt) {
        const now = this.getCurrentDate();
        const resolved = this.resolveDateExpression(userPrompt);
        if (resolved) {
            const d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const d2 = new Date(resolved.date.getFullYear(), resolved.date.getMonth(), resolved.date.getDate());
            const deltaDays = Math.max(0, Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)));
            return {
                currentDateIso: this.formatIsoDate(now),
                currentDateFormatted: this.formatHuman(now),
                referenceDateIso: this.formatIsoDate(resolved.date),
                referenceDateFormatted: this.formatHuman(resolved.date),
                relativePeriodDescription: `since ${resolved.description} (${this.formatHuman(resolved.date)})`,
                deltaDays,
            };
        }
        return {
            currentDateIso: this.formatIsoDate(now),
            currentDateFormatted: this.formatHuman(now),
        };
    }
}
