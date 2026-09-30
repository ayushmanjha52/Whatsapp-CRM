/**
 * RFC 4180 CSV parser: quoted fields, escaped quotes (""), commas and newlines inside
 * quotes, CRLF line endings and a UTF-8 BOM. Also accepts ";" or tab delimited files.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = [',', ';', '\t'].reduce((best, d) => (count(firstLine, d) > count(firstLine, best) ? d : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"' && field === '') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

function count(s: string, ch: string) {
  return s.split(ch).length - 1;
}

export type ColumnRole = 'name' | 'phone' | 'email' | 'company' | 'tags' | 'custom' | 'ignore';

/** Best guess for what each CSV header holds. */
export function guessColumnRole(header: string): ColumnRole {
  const h = header.trim().toLowerCase();
  if (/(phone|mobile|whatsapp|number|cell|msisdn)/.test(h)) return 'phone';
  if (/e-?mail/.test(h)) return 'email';
  if (/(company|organi[sz]ation|business|account)/.test(h)) return 'company';
  if (/^(tags?|labels?|segments?)$/.test(h)) return 'tags';
  if (/(^name$|full ?name|first ?name|contact|customer)/.test(h)) return 'name';
  if (!h) return 'ignore';
  return 'custom';
}

export type ImportRow = {
  name?: string;
  phone: string;
  email?: string;
  company?: string;
  tags?: string[];
  custom_fields?: Record<string, string>;
};

export function buildImportRows(rows: string[][], roles: ColumnRole[], headers: string[]): ImportRow[] {
  return rows.map(r => {
    const out: ImportRow = { phone: '' };
    const custom: Record<string, string> = {};
    roles.forEach((role, i) => {
      const v = (r[i] ?? '').trim();
      if (!v) return;
      if (role === 'phone') out.phone = v;
      else if (role === 'name') out.name = out.name ? `${out.name} ${v}` : v;
      else if (role === 'email') out.email = v;
      else if (role === 'company') out.company = v;
      else if (role === 'tags') out.tags = v.split(/[|,;]/).map(t => t.trim()).filter(Boolean);
      else if (role === 'custom') custom[headers[i].trim()] = v;
    });
    if (Object.keys(custom).length > 0) out.custom_fields = custom;
    return out;
  });
}
