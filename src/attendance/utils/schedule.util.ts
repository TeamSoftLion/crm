import { DaysPattern } from '@prisma/client';

export function isOdd(date: Date) {
  const d = date.getUTCDay(); // 0..6 (Sun..Sat)

  return d === 1 || d === 3 || d === 5;
}
export function isEven(date: Date) {
  const d = date.getUTCDay();
  return d === 2 || d === 4 || d === 6;
}

export function dateOnlyUTC(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function ensureDateMatchesGroupPattern(
  date: Date,
  pattern: DaysPattern,
) {
  if (pattern === 'ODD' && !isOdd(date)) return false;
  if (pattern === 'EVEN' && !isEven(date)) return false;
  return true;
}
