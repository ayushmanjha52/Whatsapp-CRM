const currencyFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const compactFmt = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

export function currency(value: number | null | undefined): string {
  return currencyFmt.format(Number(value || 0));
}

export function compact(value: number | null | undefined): string {
  return compactFmt.format(Number(value || 0));
}

export function initials(name: string | null | undefined): string {
  const parts = String(name || '?').replace(/^\+/, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (/^\d/.test(parts[0])) return parts[0].slice(-2);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function time(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** "09:41", "Yesterday", "Mon", or "12 Mar" — like a chat list. */
export function listTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (sameDay(d, now)) return time(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  if (now.getTime() - d.getTime() < 6 * 86400000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (sameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function duration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(Number(seconds || 0)));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(s < 36000 ? 1 : 0)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

export function relativeFromNow(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 3600e3) return rtf.format(Math.round(diff / 60e3), 'minute');
  if (abs < 86400e3) return rtf.format(Math.round(diff / 3600e3), 'hour');
  return rtf.format(Math.round(diff / 86400e3), 'day');
}

/** Time left in WhatsApp's 24h customer service window, or null when closed. */
export function windowRemaining(lastInboundAt: string | null, now = Date.now()): string | null {
  if (!lastInboundAt) return null;
  const left = new Date(lastInboundAt).getTime() + 86400e3 - now;
  if (left <= 0) return null;
  const h = Math.floor(left / 3600e3);
  const m = Math.floor((left % 3600e3) / 60e3);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Local datetime-input value (YYYY-MM-DDTHH:mm) for a Date. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}
