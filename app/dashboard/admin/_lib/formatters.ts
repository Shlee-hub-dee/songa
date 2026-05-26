// Shared formatters for admin pages — same NumberFormat instances re-used
// across server components to avoid re-allocating per request.

export const KES = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

export const KES_PRECISE = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  minimumFractionDigits: 2,
});

export const DATE_SHORT = new Intl.DateTimeFormat('en-KE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export const DATE_TIME = new Intl.DateTimeFormat('en-KE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export const DAY_LABEL = new Intl.DateTimeFormat('en-KE', {
  day: '2-digit',
  month: 'short',
});

export const MONTH_LABEL = new Intl.DateTimeFormat('en-KE', {
  month: 'short',
  year: '2-digit',
});

export function quarterLabel(d: Date): string {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${String(d.getFullYear()).slice(-2)}`;
}
