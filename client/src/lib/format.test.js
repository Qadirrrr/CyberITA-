import { describe, expect, it } from 'vitest';
import { formatDate, formatMinutes, initials, percent, pluralize, truncate } from './format';

describe('format helpers', () => {
  it('formats dates and falls back for invalid input', () => {
    expect(formatDate('2026-03-04T12:00:00Z')).toMatch(/Mar 4, 2026/);
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('formats durations in minutes and hours', () => {
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(95)).toBe('1h 35m');
  });

  it('derives initials from up to two name parts', () => {
    expect(initials('Alex Rivera')).toBe('AR');
    expect(initials('  sarah   chen  ')).toBe('SC');
    expect(initials('')).toBe('');
  });

  it('clamps percentages and handles zero totals', () => {
    expect(percent(5, 10)).toBe(50);
    expect(percent(15, 10)).toBe(100);
    expect(percent(-2, 10)).toBe(0);
    expect(percent(3, 0)).toBe(0);
  });

  it('truncates long strings and pluralizes counts', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('a longer sentence', 8)).toBe('a longer…');
    expect(pluralize(1, 'lesson')).toBe('lesson');
    expect(pluralize(2, 'lesson')).toBe('lessons');
  });
});
