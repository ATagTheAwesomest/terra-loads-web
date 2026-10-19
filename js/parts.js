// Master parts database, bundled as data/master_parts.csv. Accepts either
// Mark,Description,Weight or the fabrication export (Main Mk, Shape, Dimension,
// Length, Grade, Qty, Ref #, Assembly Weight in "123.45#" form).

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
  // First header present wins, so both the simple Mark/Description/Weight list
  // and the fabrication export (Main Mk, Assembly Weight, ...) load as-is.
  const col = (...names) => {
    for (const name of names) {
      const i = header.findIndex((h) => h.trim().toLowerCase() === name);
      if (i >= 0) return i;
    }
    return -1;
  };
  const get = (r, i) => (i >= 0 ? (r[i] ?? '').trim() : '');
  const iMark = col('mark', 'main mk');
  const iDesc = col('description');
  const iWeight = col('assembly weight', 'weight');
  const iShape = col('shape');
  const iDim = col('dimension');
  const iLength = col('length');
  const iGrade = col('grade');
  const iQty = col('qty');
  const iRef = col('ref #');
  parts = new Map();
  for (const r of rows) {
    const mark = normalizeMark(get(r, iMark));
    if (!mark) continue;
    const size = `${get(r, iShape)}${get(r, iDim).replace(/\s+/g, '')}`;
    const ref = get(r, iRef);
    const description = get(r, iDesc)
      || [size, get(r, iLength), get(r, iGrade), ref && `Ref ${ref}`].filter(Boolean).join(' · ');
    parts.set(mark, {
      mark,
      description,
      weight: Number.parseFloat(get(r, iWeight).replace(/[^\d.]/g, '')) || 0,
      qty: Number.parseInt(get(r, iQty), 10) || 0,
    });
  }
  return parts.size;
}

// Exact match lookup. Returns { mark, description, weight, qty } or null;
// qty is 0 when the list doesn't carry it.
export function lookupPart(mark) {
  return parts.get(normalizeMark(mark)) ?? null;
}

export function partCount() {
  return parts.size;
}
