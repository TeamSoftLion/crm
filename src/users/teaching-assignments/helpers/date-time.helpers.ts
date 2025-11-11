// UZOQ KELAJAK: Prisma/DB qo‘llaydigan eng yuqori vaqt (YYYY <= 9999)
export const FAR_FUTURE = new Date('9999-12-31T23:59:59.999Z');

// "HH:mm" -> minutes (0..1439)
export function hhmmToMinutes(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error('Invalid time format, expected HH:mm');
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59)
    throw new Error('Invalid HH:mm value');
  return h * 60 + min;
}

// minutes -> "HH:mm"
export function minutesToHhmm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}`;
}

// [aStart, aEnd) va [bStart, bEnd) kesimlari kesishadimi?
export function timeOverlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// Sana oralig‘i bo‘yicha overlap (null => FAR_FUTURE)
export function dateRangesOverlap(
  aFrom: Date,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date | null,
): boolean {
  const aEnd = aTo ?? FAR_FUTURE;
  const bEnd = bTo ?? FAR_FUTURE;
  return aFrom <= bEnd && bFrom <= aEnd;
}

// Xavfsiz Date (string | Date | undefined) -> Date | null
export function safeToDate(input?: string | Date | null): Date | null {
  if (!input) return null;
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date value');
  return d;
}
