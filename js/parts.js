// Master parts database, bundled as data/master_parts.csv. Accepts either
// Mark,Description,Weight or the fabrication export (Main Mk, Shape, Dimension,
// Length, Grade, Qty, Ref #, Assembly Weight in "123.45#" form). In the export
// the weight columns total the whole line (every piece of that mark), so the
// per-piece weight is Assembly Weight / Qty.
//
// A mark is only unique within a job: P1 on one job is a different part from
// P1 on another. Parts are keyed "<job>|<mark>". When the list has a Job column
// each row is filed under its job; rows without one (the current file) have an
// empty job and match a mark on any job.

let parts = new Map();

// The job number a part or load is filed under, reduced to its leading number
// so "26123 - 25-418" in the app and "26123" in the spreadsheet agree.
export function jobKey(job) {
  return String(job ?? '').trim().toUpperCase().split(/\s+/)[0] ?? '';
}

export function partKey(job, mark) {
  return `${jobKey(job)}|${normalizeMark(mark)}`;
}

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
  const iJob = col('job', 'job #', 'job number', 'job no', 'job no.');
  const iDesc = col('description');
  const iWeight = col('assembly weight', 'weight');
  const iShape = col('shape');
  const iDim = col('dimension');
  const iLength = col('length');
  const iGrade = col('grade');
  const iQty = col('qty');
  const iRef = col('ref #');
  const num = (v) => Number.parseFloat(v.replace(/[^\d.]/g, '')) || 0;
  parts = new Map();
  for (const r of rows) {
    const mark = normalizeMark(get(r, iMark));
    if (!mark) continue;
    const job = jobKey(get(r, iJob));
    const size = `${get(r, iShape)}${get(r, iDim).replace(/\s+/g, '')}`;
    const ref = get(r, iRef);
    const description = get(r, iDesc)
      || [size, get(r, iLength), get(r, iGrade), ref && `Ref ${ref}`].filter(Boolean).join(' · ');
    const qty = Number.parseInt(get(r, iQty), 10) || 0;
    const lineWeight = num(get(r, iWeight));
    parts.set(partKey(job, mark), {
      mark,
      job,
      description,
      weight: qty > 1 ? Math.round((lineWeight / qty) * 100) / 100 : lineWeight,
      lineWeight,
      qty,
      // Every non-empty column, for the expanded row view.
      fields: header.map((h, i) => [h.trim(), get(r, i)]).filter(([h, v]) => h && v),
    });
  }
  return parts.size;
}

// Exact match lookup of a mark on a job. Returns { mark, job, description,
// weight, lineWeight, qty, fields } or null; weight is per piece, qty is 0 when
// the list doesn't carry it. A row filed under the job wins; a row with no job
// matches any job.
export function lookupPart(mark, job = null) {
  const j = jobKey(job);
  return (j && parts.get(partKey(j, mark))) || parts.get(partKey('', mark)) || null;
}

export function partCount() {
  return parts.size;
}
