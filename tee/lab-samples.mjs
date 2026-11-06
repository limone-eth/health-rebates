// Synthetic lab reports for the lab check and the page. All names and values are made up.
// `expected` is the answer that the lab rule gives on 6 Nov 2026.
export const LAB_SAMPLES = [
  { id: "pass-mmol", lang: "it", unit: "mmol/mol", value: "36", date: "12/10/2026", earlier: "HbA1c 40 mmol/mol (14/09/2025)", expected: { test_found: true, rule_met: true } },
  { id: "fail-mmol", lang: "it", unit: "mmol/mol", value: "44", date: "12/10/2026", earlier: "HbA1c 45 mmol/mol (14/09/2025)", expected: { test_found: true, rule_met: false } },
  { id: "pass-percent-better", lang: "en", unit: "%", value: "6.1", date: "20/09/2026", earlier: "HbA1c 6.5 % (10/03/2026)", expected: { test_found: true, rule_met: true } },
  { id: "fail-percent", lang: "en", unit: "%", value: "6.0", date: "20/09/2026", earlier: "HbA1c 6.1 % (10/03/2026)", expected: { test_found: true, rule_met: false } },
  { id: "old-test", lang: "en", unit: "%", value: "5.2", date: "03/03/2025", earlier: null, expected: { test_found: false, rule_met: false } },
  { id: "no-hba1c", lang: "en", unit: null, value: null, date: "20/09/2026", earlier: null, expected: { test_found: false, rule_met: false } },
];

const TEXT = {
  it: { lab: "Laboratorio Analisi Esempio", patient: "Paziente: Mario Esempio", date: "Data prelievo", head: ["Esame", "Risultato", "Unità", "Valori di riferimento"], hba1c: "Emoglobina glicata (HbA1c)", glucose: "Glucosio", chol: "Colesterolo totale", creat: "Creatinina", earlier: "Referto precedente" },
  en: { lab: "Example Clinical Laboratory", patient: "Patient: Alex Example", date: "Sample date", head: ["Test", "Result", "Units", "Reference range"], hba1c: "Haemoglobin A1c (HbA1c)", glucose: "Glucose, fasting", chol: "Total cholesterol", creat: "Creatinine", earlier: "Previous result" },
};

export function sampleHtml(sample) {
  const t = TEXT[sample.lang];
  const rows = [
    [t.glucose, "92", "mg/dL", "70 - 99"],
    ...(sample.value ? [[t.hba1c, sample.value, sample.unit, sample.unit === "%" ? "4.0 - 5.6" : "20 - 38"]] : []),
    [t.chol, "184", "mg/dL", "< 200"],
    [t.creat, "0.9", "mg/dL", "0.7 - 1.2"],
  ];
  const cell = (tag, text) => `<${tag}>${text.replace(/</g, "&lt;")}</${tag}>`;
  return `<!doctype html><meta charset=utf-8><style>body{font:14px Arial;width:760px;padding:24px;margin:0;color:#111;background:#fff}h1{font-size:20px;margin:0}table{border-collapse:collapse;width:100%;margin-top:14px}td,th{border-bottom:1px solid #ccc;padding:6px;text-align:left}.s{color:#555;font-size:12px}</style>
<h1>${t.lab} (SAMPLE, NOT REAL)</h1><div class=s>No. 000123 · ${t.patient} · ${t.date}: ${sample.date}</div>
<table><tr>${t.head.map((h) => cell("th", h)).join("")}</tr>
${rows.map((row) => `<tr>${row.map((c) => cell("td", c)).join("")}</tr>`).join("\n")}</table>
${sample.earlier ? `<p class=s>${t.earlier}: ${sample.earlier}</p>` : ""}`;
}
