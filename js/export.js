// Export, share and print for a single load.
//
// Works on a plain load object so it does not depend on how loads are stored:
//   {
//     name: "TRUCK-LOAD-101",
//     createdAt: "2026-10-19T16:15:00Z" | Date | epoch ms,
//     stacks: [
//       { name: "Stack TRUCK-LOAD-101 - 1",
//         items: [{ mark: "1001-C1", description: "Column", weight: 450 }, ...] },
//     ],
//   }
// Items are exported in array order, one line per scan, never collapsed.

const pad2 = (n) => String(n).padStart(2, "0");

function toDate(value) {
  if (value instanceof Date) return value;
  if (value === undefined || value === null || value === "") return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

// "2026-10-19 11:15" in the device's local time, as in the spec.
export function formatDateTime(value) {
  const d = toDate(value);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// Weights are stored in lbs; keep at most two decimals and drop trailing zeros.
export function formatWeight(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 100) / 100);
}

const itemsOf = (stack) => (stack && Array.isArray(stack.items) ? stack.items : []);
const stacksOf = (load) => (load && Array.isArray(load.stacks) ? load.stacks : []);
const weightOf = (item) => {
  const n = Number(item && item.weight);
  return Number.isFinite(n) ? n : 0;
};

export function stackTotals(stack) {
  const items = itemsOf(stack);
  return { pieces: items.length, weight: items.reduce((sum, it) => sum + weightOf(it), 0) };
}

export function loadTotals(load) {
  return stacksOf(load).reduce(
    (acc, stack) => {
      const t = stackTotals(stack);
      return { pieces: acc.pieces + t.pieces, weight: acc.weight + t.weight };
    },
    { pieces: 0, weight: 0 },
  );
}

// Unique 4-character sequence prefixes in first-seen order (1010-C1 -> 1010).
export function sequencesOf(load) {
  const seen = new Set();
  for (const stack of stacksOf(load)) {
    for (const item of itemsOf(stack)) {
      const prefix = String(item.mark || "").trim().slice(0, 4);
      if (prefix.length === 4) seen.add(prefix);
    }
  }
  return [...seen];
}

// Tekla-friendly text: control data lives in {} blocks, every other line is a mark.
export function buildLoadText(load) {
  const totals = loadTotals(load);
  const lines = [
    "{",
    `LOAD_NAME: ${load.name}`,
    `CREATED: ${formatDateTime(load.createdAt)}`,
    `TOTAL_PIECES: ${totals.pieces}`,
    `TOTAL_WEIGHT: ${formatWeight(totals.weight)}`,
    "}",
  ];
  for (const stack of stacksOf(load)) {
    lines.push(`{STACK: ${stack.name}}`);
    for (const item of itemsOf(stack)) lines.push(String(item.mark).trim());
  }
  return lines.join("\n") + "\n";
}

export function fileNameFor(load) {
  const safe = String(load.name || "load").trim().replace(/[^A-Za-z0-9._-]+/g, "_") || "load";
  return `${safe}.txt`;
}

function downloadText(text, fileName) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Opens the iPad share sheet (AirDrop, LocalSend, Mail, Files) with the load as a
// .txt file. Must be called from a tap handler. Falls back to a plain download
// where file sharing is unsupported. Resolves to "shared", "cancelled" or "downloaded".
export async function shareLoadFile(load) {
  const text = buildLoadText(load);
  const fileName = fileNameFor(load);
  const file = typeof File === "function" ? new File([text], fileName, { type: "text/plain" }) : null;

  if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return "shared";
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelled";
      // Any other failure (e.g. permission) falls through to download.
    }
  }
  downloadText(text, fileName);
  return "downloaded";
}

// ---- Print shipping ticket -------------------------------------------------

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function renderPrintTicket(load, printedAt = new Date()) {
  const totals = loadTotals(load);
  const sequences = sequencesOf(load);

  const summary = el(
    "dl",
    { class: "pt-summary" },
    el("dt", null, "Load"), el("dd", null, load.name),
    el("dt", null, "Created"), el("dd", null, formatDateTime(load.createdAt)),
    el("dt", null, "Printed"), el("dd", null, formatDateTime(printedAt)),
    el("dt", null, "Sequences"), el("dd", null, sequences.length ? sequences.join(", ") : "None"),
    el("dt", null, "Total pieces"), el("dd", null, totals.pieces),
    el("dt", null, "Total weight"), el("dd", null, `${formatWeight(totals.weight)} lbs`),
  );

  const stacks = stacksOf(load).map((stack) => {
    const t = stackTotals(stack);
    const rows = itemsOf(stack).map((item, i) =>
      el(
        "tr",
        item.matched === false || item.manual ? { class: "pt-unmatched" } : null,
        el("td", { class: "pt-num" }, i + 1),
        el("td", { class: "pt-mark" }, item.mark),
        el("td", null, item.description || ""),
        el("td", { class: "pt-num" }, formatWeight(weightOf(item))),
        el("td", { class: "pt-check" }, ""),
      ),
    );
    return el(
      "section",
      { class: "pt-stack" },
      el("h2", null, stack.name, el("span", null, `${t.pieces} pcs · ${formatWeight(t.weight)} lbs`)),
      el(
        "table",
        null,
        el(
          "thead",
          null,
          el("tr", null,
            el("th", { class: "pt-num" }, "#"),
            el("th", null, "Mark"),
            el("th", null, "Description"),
            el("th", { class: "pt-num" }, "Weight (lbs)"),
            el("th", { class: "pt-check" }, "✓")),
        ),
        el("tbody", null, ...rows),
        el(
          "tfoot",
          null,
          el("tr", null,
            el("td", { colspan: "3" }, "Stack subtotal"),
            el("td", { class: "pt-num" }, formatWeight(t.weight)),
            el("td", { class: "pt-check" }, "")),
        ),
      ),
    );
  });

  return el(
    "div",
    { id: "print-ticket", "aria-hidden": "true" },
    el("h1", null, "Shipping Ticket"),
    summary,
    ...stacks,
    el(
      "div",
      { class: "pt-signoff" },
      el("p", null, "Loaded by: ______________________"),
      el("p", null, "Checked by: _____________________"),
      el("p", null, "Driver: _________________________"),
    ),
  );
}

// Replaces any previous ticket, then opens the native print dialog.
export function printLoad(load) {
  document.getElementById("print-ticket")?.remove();
  document.body.appendChild(renderPrintTicket(load));
  window.print();
}
