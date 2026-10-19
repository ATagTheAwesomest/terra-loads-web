// Master parts database, bundled as data/master_parts.csv (Mark, Description, Weight).

let parts = new Map();

export function normalizeMark(mark) {
  return String(mark ?? '').trim().toUpperCase();
}

// Minimal RFC 4180 parser: handles quoted fields, escaped quotes and CRLF.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

export async function loadParts(url = 'data/master_parts.csv') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  const [header, ...rows] = parseCsv(await res.text());
  const col = (name) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const iMark = col('mark');
  const iDesc = col('description');
  const iWeight = col('weight');
  parts = new Map();
  for (const r of rows) {
    const mark = normalizeMark(r[iMark]);
    if (!mark) continue;
    parts.set(mark, {
      mark,
      description: (r[iDesc] ?? '').trim(),
      weight: Number.parseFloat(r[iWeight]) || 0,
    });
  }
  return parts.size;
}

// Exact match lookup. Returns { mark, description, weight } or null.
export function lookupPart(mark) {
  return parts.get(normalizeMark(mark)) ?? null;
}

export function partCount() {
  return parts.size;
}
