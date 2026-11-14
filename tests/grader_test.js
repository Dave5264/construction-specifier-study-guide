// Checks for the fill-in grading and the bank's format. Run: node tests/grader_test.js
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "app.js"), "utf8");
// The grading code is the block between these two markers in app.js; run it on its own (no DOM needed).
const block = src.slice(src.indexOf("/* ---------- fill-in grading"), src.indexOf("/* ---------- difficulty progression"));
const { gradeFill } = new Function(block + "\nreturn { gradeFill, fillTokens };")();

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log("FAIL", msg); } };

const cases = [
  [[["Architect's Supplemental Instructions"]], "ASI", [true]],
  [[["ASI"]], "architects supplemental instructions", [true]],
  [[["Request for Information"]], "RFIs", [true]],
  [[["submittals"]], "Submittal", [true]],
  [[["warranty"]], "warranties", [true]],
  [[["three"]], "3", [true]],
  [[["Owner Representative"]], "or", [false]],
  [[["Construction Manager at Risk", "CMAR"]], "construction manager at-risk", [true]],
  [[["CMAR"]], "Construction Manager at Risk", [true]],
  [[["Construction Change Directive"]], "CCD", [true]],
  [[["qualitative"]], "quantitative", [false]],
  [[["addenda"]], "adenda", [true]],
  [[["01 80 00"]], "01 80 01", [false]],
  [[["bid bond"], ["performance bond"]], "performance bond and bid bond", [true, true]],
  [[["procurement requirements"], ["contract forms"]], "PR, CF", [false, false]],
];
for (const [answers, text, want] of cases) {
  const got = gradeFill(answers, text);
  check(JSON.stringify(got) === JSON.stringify(want), `grade ${JSON.stringify(text)} for ${JSON.stringify(answers)}: got ${got}, want ${want}`);
}

const bank = JSON.parse(fs.readFileSync(path.join(root, "questions.json"), "utf8"));
const ids = new Set();
const sorted = s => s === s.split("").sort().join("");
const checkMc = (id, o, key) => {
  check(o && Object.keys(o).sort().join("") === "ABCDEF", `${id}: options must be A-F`);
  check(/^[A-F]{1,3}$/.test(key) && sorted(key) && [...key].every(k => o[k]), `${id}: bad key ${key}`);
  for (const [k, t] of Object.entries(o || {})) for (const m of t.matchAll(/\{([A-F])\}/g)) check(m[1] !== k && o[m[1]], `${id}: option ${k} names {${m[1]}}`);
};
for (const q of bank.questions) {
  check(!ids.has(q.id), `${q.id}: duplicate id`); ids.add(q.id);
  check(q.explanation && q.explanation.split(/\s+/).length >= 15, `${q.id}: explanation missing or too short`);
  check(bank.domains[String(q.domain)], `${q.id}: unknown domain ${q.domain}`);
  if (q.type === "fill") {
    check((q.question.match(/____/g) || []).length === q.answers.length, `${q.id}: blanks and answers differ`);
    check(gradeFill(q.answers, q.answers.map(a => a[0]).join(", ")).every(Boolean), `${q.id}: its own answers don't grade right`);
    checkMc(q.id + " mc", q.mc.options, q.mc.correct);
    const right = [...q.mc.correct].map(k => q.mc.options[k]).join(" ; ");
    check(gradeFill(q.answers, right).every(Boolean), `${q.id}: mc key ${q.mc.correct} would not be graded right if typed`);
    if (q.mc.correct.length === 1) for (const [k, t] of Object.entries(q.mc.options))
      if (k !== q.mc.correct) check(!gradeFill(q.answers, t).every(Boolean), `${q.id}: mc wrong option ${k} would be graded right if typed`);
  } else {
    checkMc(q.id, q.options, q.correct);
  }
}
const counts = {};
bank.questions.forEach(q => { counts[q.domain] = (counts[q.domain] || 0) + 1; });
for (const [d, v] of Object.entries(bank.domains)) check(v.count === (counts[d] || 0), `domain ${d} count ${v.count} != ${counts[d]}`);
check(bank.total === bank.questions.length, "total does not match");

console.log(failed ? `${failed} failed` : `ok: ${cases.length} grading cases, ${bank.questions.length} questions checked`);
process.exit(failed ? 1 : 0);
