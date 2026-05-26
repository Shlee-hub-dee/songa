// Period helpers shared between the finance page (server-side filtering)
// and the filter bar (client-side UI).

export type Period =
  | { type: 'all' }
  | { type: 'month'; year: number; month: number } // month is 0-indexed
  | { type: 'quarter'; year: number; quarter: number }; // quarter is 1..4

const MONTH_RE = /^(\d{4})-(\d{2})$/;
const QUARTER_RE = /^(\d{4})-Q([1-4])$/;

// Parse the `period` search-param string into a Period. Unknown / missing
// inputs yield { type: 'all' }.
export function parsePeriod(raw: string | undefined): Period {
  if (!raw) return { type: 'all' };
  const m = raw.match(MONTH_RE);
  if (m) {
    return { type: 'month', year: Number(m[1]), month: Number(m[2]) - 1 };
  }
  const q = raw.match(QUARTER_RE);
  if (q) {
    return { type: 'quarter', year: Number(q[1]), quarter: Number(q[2]) };
  }
  return { type: 'all' };
}

export function periodToString(p: Period): string {
  if (p.type === 'all') return '';
  if (p.type === 'month') {
    return `${p.year}-${String(p.month + 1).padStart(2, '0')}`;
  }
  return `${p.year}-Q${p.quarter}`;
}

export function periodRange(p: Period): { start: Date; end: Date } | null {
  if (p.type === 'all') return null;
  if (p.type === 'month') {
    return {
      start: new Date(p.year, p.month, 1),
      end: new Date(p.year, p.month + 1, 1),
    };
  }
  // quarter
  const startMonth = (p.quarter - 1) * 3;
  return {
    start: new Date(p.year, startMonth, 1),
    end: new Date(p.year, startMonth + 3, 1),
  };
}

export function periodLabel(p: Period): string {
  if (p.type === 'all') return 'All time';
  if (p.type === 'month') {
    return new Intl.DateTimeFormat('en-KE', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(p.year, p.month, 1));
  }
  return `Q${p.quarter} ${p.year}`;
}

// Month-window helpers for the 12-month trend chart.
export function lastNMonths(n: number): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  const today = new Date();
  today.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() });
  }
  return out;
}
