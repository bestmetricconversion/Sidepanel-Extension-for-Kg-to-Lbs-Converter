const KG_TO_LBS = 2.2046226218;
const WEBSITE_URL = APP_CONFIG.toolUrl;
const EXTENSION_URL = APP_CONFIG.extensionStoreUrl;

const amountEl = document.getElementById("amount");
const directionEl = document.getElementById("direction");
const resultEl = document.getElementById("result");
const resultLabelEl = document.getElementById("resultLabel");
const formulaEl = document.getElementById("formula");
const copyBtn = document.getElementById("copyBtn");
const clearBtn = document.getElementById("clearBtn");
const swapBtn = document.getElementById("swapBtn");
const viewPdfBtn = document.getElementById("viewPdfBtn");
const minValueEl = document.getElementById("minValue");
const maxValueEl = document.getElementById("maxValue");
const generateRangePdf = document.getElementById("generateRangePdf");
const rangeError = document.getElementById("rangeError");
const quickChips = document.getElementById("quickChips");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const resetChat = document.getElementById("resetChat");
const historyList = document.getElementById("historyList");
const clearHistory = document.getElementById("clearHistory");
const openWebsite = document.getElementById("openWebsite");
const openWebsiteCard = document.getElementById("openWebsiteCard");

const quickValues = [1, 5, 10, 50, 100];
const pdfPresetValues = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000];
let lastResultText = "";

function roundSmart(num) {
  if (!Number.isFinite(num)) return "0";
  return Number(num.toFixed(6)).toString();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getConversion(value, direction) {
  const input = Number(value);
  if (!Number.isFinite(input) || input < 0) return null;

  if (direction === "kg-lbs") {
    const output = input * KG_TO_LBS;
    return {
      fromValue: roundSmart(input),
      fromUnit: "KG",
      toValue: roundSmart(output),
      toUnit: "LBS",
      label: `${roundSmart(input)} KG =`,
      result: `${roundSmart(output)} LBS`,
      formula: "Formula: pounds = kilograms × 2.2046226218",
      plainFormula: "pounds = kilograms × 2.2046226218",
      history: `${roundSmart(input)} kg = ${roundSmart(output)} lbs`
    };
  }

  const output = input / KG_TO_LBS;
  return {
    fromValue: roundSmart(input),
    fromUnit: "LBS",
    toValue: roundSmart(output),
    toUnit: "KG",
    label: `${roundSmart(input)} LBS =`,
    result: `${roundSmart(output)} KG`,
    formula: "Formula: kilograms = pounds ÷ 2.2046226218",
    plainFormula: "kilograms = pounds ÷ 2.2046226218",
    history: `${roundSmart(input)} lbs = ${roundSmart(output)} kg`
  };
}

async function saveHistory(text) {
  const { history = [] } = await chrome.storage.local.get("history");
  const next = [text, ...history.filter(item => item !== text)].slice(0, 10);
  await chrome.storage.local.set({ history: next });
  renderHistory();
}

async function renderHistory() {
  const { history = [] } = await chrome.storage.local.get("history");
  historyList.innerHTML = "";
  if (!history.length) {
    historyList.innerHTML = `<li class="empty">No conversion history yet.</li>`;
    return;
  }
  history.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    li.addEventListener("click", () => navigator.clipboard.writeText(item));
    historyList.appendChild(li);
  });
}

function convert(save = false) {
  const converted = getConversion(amountEl.value, directionEl.value);
  if (!converted) {
    resultLabelEl.textContent = "Invalid value";
    resultEl.textContent = "Enter a positive number";
    formulaEl.textContent = "";
    lastResultText = "";
    return;
  }
  resultLabelEl.textContent = converted.label;
  resultEl.textContent = converted.result;
  formulaEl.textContent = converted.formula;
  lastResultText = `${converted.label} ${converted.result}`;
  if (save) saveHistory(converted.history);
}

function renderChips() {
  quickChips.innerHTML = "";
  quickValues.forEach(value => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.type = "button";
    chip.textContent = `${value}`;
    chip.addEventListener("click", () => {
      amountEl.value = value;
      convert(true);
    });
    quickChips.appendChild(chip);
  });
}

function addMessage(text, type = "bot") {
  const div = document.createElement("div");
  div.className = `msg ${type}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function parseChat(text) {
  const normalized = text.toLowerCase().replace(/kilograms?/g, "kg").replace(/pounds?|lbs?/g, "lbs");
  const numberMatch = normalized.match(/-?\d+(\.\d+)?/);
  if (!numberMatch) return null;
  const value = Number(numberMatch[0]);
  if (!Number.isFinite(value) || value < 0) return null;

  const hasKg = /\bkg\b/.test(normalized);
  const hasLbs = /\blbs\b|\blb\b/.test(normalized);

  if (hasKg && hasLbs) {
    if (normalized.indexOf("kg") < normalized.search(/lbs|lb/)) {
      return { value, direction: "kg-lbs" };
    }
    return { value, direction: "lbs-kg" };
  }
  if (hasKg) return { value, direction: "kg-lbs" };
  if (hasLbs) return { value, direction: "lbs-kg" };
  return null;
}


function chunkRows(rows, size) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}

function pdfEscape(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n\t]+/g, " ");
}

function makeText(x, y, size, text) {
  return `BT /F1 ${size} Tf ${x} ${y} Td (${pdfEscape(text)}) Tj ET\n`;
}

function makeLine(x1, y1, x2, y2) {
  return `${x1} ${y1} m ${x2} ${y2} l S\n`;
}

function buildDownloadPdfString({ title, subtitle, rows, formula }) {
  const pageWidth = 595;
  const pageHeight = 842;
  const left = 42;
  const top = 800;
  const rowHeight = 18;
  const rowsPerPage = 34;
  const pages = chunkRows(rows, rowsPerPage);

  const objects = [];
  const reserve = () => { objects.push(null); return objects.length; };
  const catalogId = reserve();
  const pagesId = reserve();
  const fontId = reserve();
  const pageIds = [];

  pages.forEach((pageRows, pageIndex) => {
    let stream = "";
    stream += "0.09 0.46 0.22 RG\n";
    stream += makeLine(left, 785, 553, 785);
    stream += "0 0 0 rg\n0 0 0 RG\n";
    stream += makeText(left, top, 18, title);
    stream += makeText(left, 770, 10, subtitle);
    stream += makeText(left, 748, 10, `Formula: ${formula}`);
    stream += makeText(left, 724, 11, "#");
    stream += makeText(92, 724, 11, "Input");
    stream += makeText(320, 724, 11, "Result");
    stream += makeLine(left, 716, 553, 716);

    let y = 698;
    pageRows.forEach((row, i) => {
      const number = pageIndex * rowsPerPage + i + 1;
      stream += makeText(left, y, 10, String(number));
      stream += makeText(92, y, 10, row.from);
      stream += makeText(320, y, 10, row.to);
      y -= rowHeight;
    });

    stream += makeLine(left, 54, 553, 54);
    stream += makeText(left, 38, 8, `Tool: ${WEBSITE_URL}`);
    stream += makeText(left, 24, 8, `Extension: ${EXTENSION_URL}`);
    stream += makeText(486, 24, 8, `Page ${pageIndex + 1} of ${pages.length}`);

    const contentId = reserve();
    const pageId = reserve();
    pageIds.push(pageId);
    objects[contentId - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
    objects[pageId - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objects[fontId - 1] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach(offset => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function pdfDataUrl(pdfString) {
  return `data:application/pdf;base64,${btoa(pdfString)}`;
}

function safeFileName(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".pdf";
}

function buildPdfDocument({ title, subtitle, rows, formula, pdfHref = "#", fileName = "conversion-table.pdf" }) {
  const tableRows = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(row.from)}</td>
      <td>${escapeHtml(row.to)}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 0; color: #111827; background: #f8fafc; }
    .page { max-width: 850px; margin: 24px auto; background: #fff; padding: 30px; border-radius: 18px; border: 1px solid #e5e7eb; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; border-bottom: 2px solid #16a34a; padding-bottom: 18px; }
    h1 { margin: 0; font-size: 28px; }
    .brand { font-size: 13px; color: #15803d; font-weight: 700; }
    .subtitle { color: #64748b; margin: 8px 0 0; }
    .pdf-actions { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
    .print-btn { background: #16a34a; color: #fff; border: 0; padding: 11px 16px; border-radius: 10px; font-weight: 700; cursor: pointer; text-decoration: none; display: inline-block; text-align: center; }
    .summary { margin: 20px 0; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 14px; padding: 16px; }
    .summary strong { color: #15803d; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    th, td { border: 1px solid #e5e7eb; padding: 11px; text-align: left; }
    th { background: #f1f5f9; }
    .links { margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .links a { text-align: center; background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; text-decoration: none; padding: 12px; border-radius: 12px; font-weight: 700; }
    .footer { margin-top: 16px; font-size: 12px; color: #64748b; text-align: center; }
    @media print {
      body { background: #fff; }
      .page { margin: 0; max-width: none; border: 0; border-radius: 0; }
      .pdf-actions { display: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="top">
      <div>
        <div class="brand">Best Metric Conversion</div>
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(subtitle)}</p>
      </div>
      <div class="pdf-actions">
        <button class="print-btn" id="printPdfBtn" type="button">Print / Save as PDF</button>
        <a class="print-btn" href="${pdfHref}" download="${escapeHtml(fileName)}">Download PDF</a>
      </div>
    </div>
    <div class="summary">
      <strong>Formula:</strong> ${escapeHtml(formula)}
    </div>
    <table>
      <thead>
        <tr><th>#</th><th>Input</th><th>Result</th></tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="links">
      <a href="${WEBSITE_URL}" target="_blank" rel="noopener">Open KG to LBS Tool</a>
      <a href="${EXTENSION_URL}" target="_blank" rel="noopener">Open Chrome Extension</a>
    </div>
    <div class="footer">Generated by KG to LBS Converter Extension</div>
  </div>
</body>
</html>`;
}

function openPdfPreview(html) {
  const previewWindow = window.open("", "_blank");
  if (!previewWindow) {
    alert("Popup blocked. Please allow popups for this extension to view/print the PDF.");
    return;
  }

  previewWindow.document.open();
  previewWindow.document.write(html);
  previewWindow.document.close();

  const attachPrint = () => {
    const printBtn = previewWindow.document.getElementById("printPdfBtn");
    if (printBtn) {
      printBtn.addEventListener("click", () => {
        previewWindow.focus();
        previewWindow.print();
      });
    }
  };

  if (previewWindow.document.readyState === "complete") {
    attachPrint();
  } else {
    previewWindow.addEventListener("load", attachPrint, { once: true });
    setTimeout(attachPrint, 300);
  }
}

function viewPresetPdf() {
  const direction = directionEl.value;
  const rows = pdfPresetValues.map(value => {
    const converted = getConversion(value, direction);
    return {
      from: `${converted.fromValue} ${converted.fromUnit}`,
      to: `${converted.toValue} ${converted.toUnit}`
    };
  });

  const sample = getConversion(pdfPresetValues[0], direction);
  const title = `${sample.fromUnit} to ${sample.toUnit} Fixed Conversion Table`;
  const subtitle = `Includes fixed values: ${pdfPresetValues.join(", ")}`;
  const pdfString = buildDownloadPdfString({ title, subtitle, formula: sample.plainFormula, rows });
  const html = buildPdfDocument({
    title,
    subtitle,
    formula: sample.plainFormula,
    rows,
    pdfHref: pdfDataUrl(pdfString),
    fileName: safeFileName(title)
  });
  openPdfPreview(html);
}

function viewRangePdf() {
  rangeError.textContent = "";
  const from = Number(minValueEl.value);
  const to = Number(maxValueEl.value);
  const direction = directionEl.value;

  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < 0) {
    rangeError.textContent = "Please enter valid positive From and To values.";
    return;
  }
  if (from > to) {
    rangeError.textContent = "From value must be smaller than To value.";
    return;
  }
  if ((to - from) > 10000) {
    rangeError.textContent = "Maximum range gap allowed is 10,000. Example: 10000 to 20000.";
    return;
  }

  const rows = [];
  for (let value = from; value <= to; value += 1) {
    const converted = getConversion(value, direction);
    rows.push({ from: `${converted.fromValue} ${converted.fromUnit}`, to: `${converted.toValue} ${converted.toUnit}` });
    if (rows.length > 10001) break;
  }

  const sample = getConversion(from, direction);
  const title = `${sample.fromUnit} to ${sample.toUnit} Custom PDF Table`;
  const subtitle = `Generated from ${roundSmart(from)} to ${roundSmart(to)} ${sample.fromUnit}`;
  const pdfString = buildDownloadPdfString({ title, subtitle, formula: sample.plainFormula, rows });
  const html = buildPdfDocument({
    title,
    subtitle,
    formula: sample.plainFormula,
    rows,
    pdfHref: pdfDataUrl(pdfString),
    fileName: safeFileName(title)
  });
  openPdfPreview(html);
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const query = chatInput.value.trim();
  if (!query) return;
  addMessage(query, "user");
  chatInput.value = "";

  const parsed = parseChat(query);
  if (!parsed) {
    addMessage("Try like this: 10 kg to lbs, 50 kg, or 22 lbs to kg.");
    return;
  }

  amountEl.value = parsed.value;
  directionEl.value = parsed.direction;
  const converted = getConversion(parsed.value, parsed.direction);
  convert(true);
  addMessage(`${converted.history}. ${converted.formula}`);
});

amountEl.addEventListener("input", () => convert(false));
directionEl.addEventListener("change", () => convert(true));
copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(lastResultText || resultEl.textContent);
  copyBtn.textContent = "Copied!";
  setTimeout(() => (copyBtn.textContent = "Copy"), 1000);
});
clearBtn.addEventListener("click", () => {
  amountEl.value = "";
  convert(false);
});
swapBtn.addEventListener("click", () => {
  directionEl.value = directionEl.value === "kg-lbs" ? "lbs-kg" : "kg-lbs";
  convert(true);
});
viewPdfBtn.addEventListener("click", viewPresetPdf);
generateRangePdf.addEventListener("click", viewRangePdf);
resetChat.addEventListener("click", () => {
  chatMessages.innerHTML = "";
  addMessage("Hi! Ask me anything like: 10 kg to lbs or 22 lbs to kg.");
});
clearHistory.addEventListener("click", async () => {
  await chrome.storage.local.set({ history: [] });
  renderHistory();
});
openWebsite.addEventListener("click", () => chrome.tabs.create({ url: WEBSITE_URL }));
openWebsiteCard.addEventListener("click", () => chrome.tabs.create({ url: WEBSITE_URL }));

renderChips();
convert(false);
renderHistory();
addMessage("Hi! Ask me anything like: 10 kg to lbs or 22 lbs to kg.");
