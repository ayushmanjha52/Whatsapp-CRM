import { describe, it, expect } from 'bun:test';
import { buildImportRows, guessColumnRole, parseCsv } from './csv';
import { duration, initials, listTime, pct, windowRemaining } from './format';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded commas and newlines', () => {
    const csv = '﻿name,phone,notes\r\n"Doe, Jane",+1 415 555 2671,"said ""hi""\nthen left"\r\nBob,919876543210,\r\n\r\n';
    expect(parseCsv(csv)).toEqual([
      ['name', 'phone', 'notes'],
      ['Doe, Jane', '+1 415 555 2671', 'said "hi"\nthen left'],
      ['Bob', '919876543210', '']
    ]);
  });

  it('detects semicolon and tab delimiters', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('parses a final line without a trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('column mapping', () => {
  it('guesses roles from common headers', () => {
    expect(['Full Name', 'Mobile Number', 'E-mail', 'Company', 'Tags', 'City', ''].map(guessColumnRole)).toEqual([
      'name', 'phone', 'email', 'company', 'tags', 'custom', 'ignore'
    ]);
  });

  it('builds import rows with tags, custom fields and joined names', () => {
    const rows = buildImportRows([['Jane', 'Doe', '+1415', 'vip|lead', 'Pune']], ['name', 'name', 'phone', 'tags', 'custom'], ['First', 'Last', 'Phone', 'Tags', 'City']);
    expect(rows).toEqual([{ name: 'Jane Doe', phone: '+1415', tags: ['vip', 'lead'], custom_fields: { City: 'Pune' } }]);
  });
});

describe('format', () => {
  it('builds initials', () => {
    expect(initials('jane doe')).toBe('JD');
    expect(initials('+14155552671')).toBe('71');
    expect(initials('')).toBe('?');
  });

  it('formats durations', () => {
    expect(duration(42)).toBe('42s');
    expect(duration(600)).toBe('10m');
    expect(duration(5400)).toBe('1.5h');
    expect(duration(172800)).toBe('2.0d');
  });

  it('formats chat list times', () => {
    const now = new Date('2026-03-12T15:00:00');
    expect(listTime('2026-03-11T09:00:00', now)).toBe('Yesterday');
    expect(listTime(null, now)).toBe('');
  });

  it('computes the remaining 24h window', () => {
    const now = Date.parse('2026-01-02T12:00:00Z');
    expect(windowRemaining('2026-01-02T10:30:00Z', now)).toBe('22h 30m');
    expect(windowRemaining('2026-01-01T11:00:00Z', now)).toBeNull();
    expect(windowRemaining(null, now)).toBeNull();
  });

  it('computes safe percentages', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBe(0);
  });
});
