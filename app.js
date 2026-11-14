"use strict";

/* ---------- full-length review config (single source of truth) ----------
   Topic weighting mirrors the standard construction-specification competency split.
   200 questions / 240 min / 75% goal — change here to taste. */
const FULL = {
  questions: 200,
  minutes: 240,
  goal: 75,
  weights: { 1: 11, 2: 14, 3: 17, 4: 12, 5: 16, 6: 30 } // % per topic area
};

// Difficulty level per topic (the badge). The top level is "Expert", not "Mastered": a mastered question is one whose
// latest answer was right with no repeats owed (the bar), and the two must not be confused.
const LEVEL_NAMES = ["Not started", "Foundation", "Proficient", "Advanced", "Expert"];

/* ---------- repeats after a miss ----------
   Each miss adds REPEAT_PER_MISS repeats. Every right answer while repeats are owed pays one off, the first right
   answer after the miss included (it is repeat 1 of 3). A missed question comes back after MISSED_GAP other
   answers (or MISSED_MINUTES); the rest come back after REPEAT_GAPS other answers (25, then 50, then every 100),
   so they are spread through the bank. A question that owes repeats doesn't count as mastered. */
const REPEAT_PER_MISS = 3;
const REPEAT_GAPS = [25, 50, 100];
const MISSED_GAP = 5;
const MISSED_MINUTES = 20;
const MAX_BOX = 6;

/* ---------- persistent state ---------- */
const STORE_KEY = "spec_guide_v1";
const DEFAULT_STATE = { n: 0, history: {}, settings: { mode: "practice", length: "20", fillMode: false } };

/* history[id]: seen, correct, wrong, bookmarked, plus the repeat state:
   box 0 = never answered, 1 = last answer wrong, 2..6 = answered right; last = latest answer right?;
   owed = repeats still owed; reps = spaced repeats answered right since the last miss (picks the gap);
   lastN = answer number of the latest answer (state.n counts every answer); lastT = its time. */
function upgrade(h) {
  if (h.box !== undefined) return h;
  const answered = (h.correct || 0) + (h.wrong || 0);
  h.box = !answered ? 0 : h.correct === 0 ? 1 : 3;       // older saves only kept counts
  h.owed = h.box === 1 ? REPEAT_PER_MISS : 0;
  h.reps = 0;
  h.last = h.box === 0 ? null : h.box >= 2;
  h.lastN = -1000; h.lastT = 0;
  return h;
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const history = p.history || {};
      Object.keys(history).forEach(k => upgrade(history[k]));
      return { n: p.n || 0, history, settings: Object.assign({}, DEFAULT_STATE.settings, p.settings) };
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}
function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }

let state = loadState();
let BANK = null;
let session = null;

const app = document.getElementById("app");
const homeBtn = document.getElementById("homeBtn");
homeBtn.addEventListener("click", () => { endTimer(); session = null; renderHome(); });

/* ---------- helpers ---------- */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const BLANK = { seen: 0, correct: 0, wrong: 0, bookmarked: false, box: 0, owed: 0, reps: 0, last: null, lastN: -1000, lastT: 0 };
function peek(id) { return state.history[id] || BLANK; }
function hist(id) { return state.history[id] || (state.history[id] = Object.assign({}, BLANK)); }
function esc(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
function tier(q) { return q.difficulty || (q.hard ? 3 : 1); }   // 1 = Core, 2 = Medium, 3 = Advanced
function domQs(dom) { return BANK.questions.filter(q => String(q.domain) === String(dom)); }
const isMastered = h => h.last === true && !h.owed;           // latest answer right and no repeats owed
const owesWork = h => h.box === 1 || h.owed > 0;              // missed, or repeats still owed

/* ---------- answering and repeats ---------- */
function record(id, ok) {
  const h = hist(id);
  const owedBefore = h.owed;
  h.seen++; ok ? h.correct++ : h.wrong++;
  if (ok) {
    if (h.owed) { h.owed--; if (h.box !== 1) h.reps++; }   // the first right answer after a miss pays one off too
    h.box = h.box === 0 ? 3 : Math.min(MAX_BOX, Math.max(h.box, 1) + 1);
  } else {
    h.owed += REPEAT_PER_MISS; h.reps = 0; h.box = 1;
  }
  h.last = ok; h.lastN = state.n; h.lastT = Date.now(); state.n++;
  saveState();
  return { ok, owed: h.owed, owedBefore, nextGap: repeatGap(h) };
}
function repeatGap(h) { return REPEAT_GAPS[Math.min(h.reps, REPEAT_GAPS.length - 1)]; }
function overdueBy(id, now) {   // > 0 when due: how far past its gap (answers), or null if not waiting
  const h = state.history[id];
  if (!h) return null;
  const since = state.n - 1 - h.lastN;     // other answers given since this one
  if (h.box === 1) return now - h.lastT >= MISSED_MINUTES * 60000 ? since + 1000 : since - MISSED_GAP + 1;
  if (h.box >= 2 && h.owed) return since - repeatGap(h) + 1;
  return null;
}
function isDue(id, now) { const o = overdueBy(id, now); return o !== null && o > 0; }
function dueRepeats(pool, now, skip) {
  return pool.filter(q => !(skip && skip.has(q.id)) && isDue(q.id, now))
    .sort((a, b) => overdueBy(b.id, now) - overdueBy(a.id, now));
}
function repeatTag(id) {
  const h = peek(id);
  if (h.box === 1) return "Missed before";
  if (h.owed) return `Repeat · ${h.owed} to go`;
  return "";
}
function repeatNote(r) {
  if (!r.ok && r.owed) return `This one comes back after about ${MISSED_GAP} more questions. Repeats owed: ${r.owed} ` +
    `(${REPEAT_PER_MISS} per miss). Getting it right when it comes back counts as the first; the rest come back spread through the bank.`;
  if (r.ok && r.owed) return `Repeats: ${r.owed} more to go; the next one comes after about ${r.nextGap} other questions.`;
  if (r.ok && r.owedBefore) return "Repeats: done, so it counts as mastered now.";
  return "";
}

/* ---------- options: shuffled each time ----------
   Combination options ("Both {A} and {C}") stay after the statements, with the letters each statement is shown
   under filled in, sorted. */
const PH = /\{([A-F])\}/g;
const isCombo = t => /\{[A-F]\}/.test(t);
function makeDisplay(v) {
  if (v.kind === "fill") return { display: [], label: {} };
  const keys = Object.keys(v.options).sort();
  const order = shuffle(keys.filter(k => !isCombo(v.options[k]))).concat(shuffle(keys.filter(k => isCombo(v.options[k]))));
  const label = {}; order.forEach((k, i) => { label[k] = "ABCDEF"[i]; });
  const fill = t => { const ls = (t.match(PH) || []).map(m => label[m[1]] || m[1]).sort(); return t.replace(PH, () => ls.shift()); };
  return { display: order.map(k => ({ key: k, text: fill(v.options[k]) })), label };
}
const fillExpl = (t, label) => String(t || "").replace(PH, (m, k) => (label && label[k]) || m);
/* A fill-in question is typed in fill-in mode and shown as six options (its "mc" version) otherwise. */
function viewOf(q) {
  if (q.type === "fill" && (state.settings.fillMode || !q.mc)) return { kind: "fill", question: q.question, answers: q.answers };
  if (q.type === "fill") return { kind: "mc", question: q.mc.question, options: q.mc.options, correct: q.mc.correct };
  return { kind: "mc", question: q.question, options: q.options, correct: q.correct };
}
function makeItem(q) { const v = viewOf(q); return Object.assign({ q, v, tag: repeatTag(q.id) }, makeDisplay(v)); }
const chooseNote = v => v.kind === "fill" ? fillNote(v.answers.length)
  : v.correct.length > 1 ? ` (Choose ${["", "", "two", "three"][v.correct.length] || v.correct.length}.)`
  : Object.values(v.options).some(isCombo) ? " (Pick the option that lists all the correct statements, and only those.)" : "";
const fillNote = n => n === 1 ? " (Type the missing word or words.)" : n === 2 ? " (Fill in both blanks.)" : ` (Name all ${n}, in any order.)`;

/* ---------- fill-in grading ----------
   Each blank's accepted wordings are looked for in the typed text as a run of words, in any order across blanks,
   each typed word used once. Ignored: capitals, punctuation, a/an/the, "&" vs "and", possessives and plurals
   ("architect's", "submittals"), number words ("three" = 3), and one typo in a word of 6+ letters with the same
   first two letters. Acronyms count both ways: "ASI" for "Architect's Supplemental Instructions" and the words
   for an accepted acronym. (Same rules as grader.py, which checks the bank's fill-in questions.) */
const ARTICLES = new Set(["a", "an", "the"]);
const SHORTHAND = { req: "requirement", reqs: "requirements", info: "information", spec: "specification",
  specs: "specifications", div: "division", mfr: "manufacturer", mfrs: "manufacturers", doc: "document", docs: "documents" };
const NUMBERS = {};
"zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty"
  .split(" ").forEach((w, i) => { NUMBERS[w] = String(i); });
const SMALL = new Set(["of", "for", "and", "to", "in", "on", "at", "as", "by", "with", "or", "from"]);
const NOT_ACRONYM = new Set(("and the for not are but all can any one our out use may set per its own who how why yes was has had his " +
  "her him new now old see two way day get let put say too off bid man art act end far few lot low top site work list part").split(" "));
const ACRONYM_RAW = /^[A-Z][A-Za-z/&@.]{0,6}[A-Z]s?$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function stemWord(w) {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}
function fillTokens(text) {
  let t = String(text || "").toLowerCase().replace(/[‘’]/g, "'");
  t = t.replace(/(\w)'s\b/g, "$1").replace(/\b([a-z])\/([a-z])\b/g, "$1$2")
    .replace(/&/g, " and ").replace(/%/g, " percent ").replace(/@/g, " at ");
  return (t.match(/[a-z0-9]+/g) || []).filter(w => !ARTICLES.has(w))
    .map(w => { w = has(SHORTHAND, w) ? SHORTHAND[w] : w; w = has(NUMBERS, w) ? NUMBERS[w] : w; return stemWord(w); });
}
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)));
    prev = cur;
  }
  return prev[b.length];
}
function sameWord(want, got) {   // one typo in a 6+ letter word with the same first two letters
  if (want === got) return true;
  if (/\d/.test(want + got) || want.length < 6 || want.slice(0, 2) !== got.slice(0, 2)) return false;
  return Math.abs(want.length - got.length) <= 1 && editDistance(want, got) <= 1;
}
function initials(toks) {
  const out = new Set();
  if (toks.length >= 2 && !toks.some(w => /\d/.test(w))) {
    [toks, toks.filter(w => !SMALL.has(w))].forEach(ws => {
      const a = ws.map(w => w[0]).join("");
      if (a.length >= 3 && !NOT_ACRONYM.has(a)) out.add(a);
    });
  }
  return out;
}
function wantedForms(accepted) {
  const toks = fillTokens(accepted);
  if (!toks.length) return [];
  const forms = [["words", toks]];
  Array.from(initials(toks)).sort().forEach(a => forms.push(["words", [a]]));
  if (ACRONYM_RAW.test(String(accepted).trim()) && toks.length === 1 && toks[0].length >= 3 && toks[0].length <= 7)
    forms.push(["expand", toks[0]]);
  return forms;
}
function gradeFill(answers, text) {
  const resp = fillTokens(text), used = new Set();
  return answers.map(accepted => {
    const forms = [].concat(...accepted.map(wantedForms));
    forms.sort((x, y) => y[1].length - x[1].length);   // stable: longest run first, as in grader.py
    for (const [kind, want] of forms) {
      if (kind === "words") {
        for (let i = 0; i + want.length <= resp.length; i++) {
          let ok = true;
          for (let j = 0; j < want.length && ok; j++) ok = !used.has(i + j) && sameWord(want[j], resp[i + j]);
          if (ok) { for (let j = 0; j < want.length; j++) used.add(i + j); return true; }
        }
      } else {
        for (let n = want.length; n < want.length + 3; n++) {
          for (let i = 0; i + n <= resp.length; i++) {
            let free = true;
            for (let j = i; j < i + n; j++) if (used.has(j)) free = false;
            if (free && initials(resp.slice(i, i + n)).has(want)) { for (let j = i; j < i + n; j++) used.add(j); return true; }
          }
        }
      }
    }
    return false;
  });
}

/* ---------- difficulty progression (3 tiers: Core / Medium / Advanced) ---------- */
function domainStats(dom) {
  const s = { t: { 1:{seen:0,correct:0}, 2:{seen:0,correct:0}, 3:{seen:0,correct:0} }, seen: 0, correct: 0,
    total: 0, mastered: 0, working: 0, owed: 0 };
  domQs(dom).forEach(q => {
    s.total++;
    const h = peek(q.id);
    if (isMastered(h)) s.mastered++;
    else if (h.seen > 0) s.working++;          // answered, but missed last time or owes repeats
    s.owed += h.owed || 0;
    const ans = h.correct + h.wrong;
    if (!ans) return;
    s.seen += ans; s.correct += h.correct;
    const t = s.t[tier(q)] || s.t[1];
    t.seen += ans; t.correct += h.correct;
  });
  return s;
}
function acc(c, s) { return s ? c / s : 0; }
const NEED = 6;  // correct answers (at the working tier or harder) to clear a level
function domainLevel(dom) {
  const s = domainStats(dom);
  const t2 = s.t[2], t3 = s.t[3];
  // Count correct answers at the current tier OR HARDER toward the next level —
  // doing well on harder questions is evidence of progress, so it must move the badge.
  const totC = s.correct, totS = s.seen;
  const ge2C = t2.correct + t3.correct, ge2S = t2.seen + t3.seen;   // Medium or harder
  const ge3C = t3.correct, ge3S = t3.seen;                          // Advanced
  let level = 0;
  if (totS > 0) level = 1;
  const L2 = totC >= NEED && acc(totC, totS) >= 0.70;               // can handle Core-level
  const L3 = L2 && ge2C >= NEED && acc(ge2C, ge2S) >= 0.70;         // can handle Medium-level
  const L4 = L3 && ge3C >= NEED && acc(ge3C, ge3S) >= 0.75;         // can handle Advanced-level
  if (L4) level = 4; else if (L3) level = 3; else if (L2) level = 2;
  return { level, name: LEVEL_NAMES[level], s, accuracy: pct(totC, totS) };
}
// Smart practice serves the tier you're currently working through:
// Foundation/L1 -> Core, Proficient/L2 -> Medium, Advanced+/L3-4 -> Advanced.
function targetTier(dom) { const l = domainLevel(dom).level; return l >= 3 ? 3 : (l === 2 ? 2 : 1); }

/* ---------- timer ---------- */
function endTimer() { if (session && session.timerId) { clearInterval(session.timerId); session.timerId = null; } }
function fmtTime(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return (h ? h + ":" : "") + String(m).padStart(h ? 2 : 1, "0") + ":" + String(ss).padStart(2, "0");
}
const num = n => Number(n).toLocaleString("en-US");

/* ---------- boot ---------- */
fetch("questions.json").then(r => r.json())
  .then(data => { BANK = data; renderHome(); })
  .catch(() => { app.innerHTML = '<div class="panel center muted">Could not load the question bank. Open the app once while online so it can cache for offline use.</div>'; });

/* ---------- HOME ---------- */
function progressRow(label, s, levelHtml, title) {
  const m = pct(s.mastered, s.total), w = Math.min(100 - m, pct(s.working, s.total));
  const counts = [`${num(s.mastered)} of ${num(s.total)} mastered`];
  if (s.working) counts.push(`${num(s.working)} in progress`);
  if (s.owed) counts.push(`${num(s.owed)} repeats owed`);
  return `<div class="dom-row" title="${esc(title)}">
      <div class="dom-top"><span class="nm">${label}</span>${levelHtml}</div>
      <span class="bar2"><span class="m" style="width:${m}%"></span><span class="w" style="width:${w}%"></span></span>
      <div class="counts">${counts.join(" &middot; ")}</div>
    </div>`;
}
function renderHome() {
  homeBtn.hidden = true;
  const qs = BANK.questions;
  const seen = qs.filter(q => peek(q.id).seen > 0).length;
  const totalCorrect = qs.reduce((s, q) => s + peek(q.id).correct, 0);
  const totalAns = qs.reduce((s, q) => s + peek(q.id).correct + peek(q.id).wrong, 0);
  const mastered = qs.filter(q => isMastered(peek(q.id))).length;
  const missed = qs.filter(q => owesWork(peek(q.id))).length;
  const owed = qs.reduce((s, q) => s + (peek(q.id).owed || 0), 0);
  const due = dueRepeats(qs, Date.now()).length;
  const marked = qs.filter(q => peek(q.id).bookmarked).length;
  const nFill = qs.filter(q => q.type === "fill").length;
  const doms = BANK.domains;

  let domSel = `<option value="all">All domains (${num(qs.length)})</option>`;
  Object.keys(doms).forEach(k => { domSel += `<option value="${k}">${k}. ${esc(doms[k].name)} (${num(doms[k].count)})</option>`; });

  const lengths = [["10","10 questions"],["20","20 questions"],["50","50 questions"],["all","Full selection"],["full",`Full-length review (${FULL.questions} Q, timed)`]];

  let domRows = "";
  Object.keys(doms).forEach(k => {
    const dl = domainLevel(k), s = dl.s;
    const title = `${s.mastered} mastered, ${s.working} in progress (missed or owing repeats), ${s.total - s.mastered - s.working} not seen yet` +
      (s.seen ? ` · ${dl.accuracy}% accuracy` : "") + (s.owed ? ` · ${s.owed} repeats owed` : "");
    domRows += progressRow(`${k}. ${esc(doms[k].name)}`, s,
      `<span class="lvl lvl-${dl.level}">${dl.level ? esc(dl.name) : "&ndash;"}</span>`, title);
  });

  app.innerHTML = `
    <div class="panel">
      <div class="stats">
        <div class="stat-card"><div class="num">${num(seen)}</div><div class="lbl">Seen</div></div>
        <div class="stat-card"><div class="num">${pct(totalCorrect, totalAns)}%</div><div class="lbl">Accuracy</div></div>
        <div class="stat-card"><div class="num">${pct(mastered, qs.length)}%</div><div class="lbl">Mastered</div></div>
      </div>
    </div>

    <div class="panel">
      <h2>Start a quiz</h2>
      <div class="field">
        <label>Mode</label>
        <div class="seg" id="modeSeg">
          <button data-mode="practice" class="${state.settings.mode!=="test"?"on":""}">Practice<span class="small">answers as you go</span></button>
          <button data-mode="test" class="${state.settings.mode==="test"?"on":""}">Quiz<span class="small">answers at the end</span></button>
        </div>
      </div>
      <label class="check" for="fillChk">
        <input type="checkbox" id="fillChk" ${state.settings.fillMode ? "checked" : ""}>
        <span><b>Fill in the blank</b><span class="small">Type the answer to the ${num(nFill)} fill-in questions. Off: they're multiple choice like the rest.</span></span>
      </label>
      <div class="field"><label for="domSel">Topic</label><select id="domSel">${domSel}</select></div>
      <div class="field"><label for="lenSel">Length</label>
        <select id="lenSel">${lengths.map(o=>`<option value="${o[0]}" ${state.settings.length===o[0]?"selected":""}>${o[1]}</option>`).join("")}</select>
      </div>
      <button class="btn primary" id="startBtn">Start</button>
      <button class="btn" id="smartBtn">Smart practice<span class="small">starts at Core, steps up to Advanced as you improve</span></button>
      <div class="row">
        <button class="btn ghost" id="missedBtn" ${missed?"":"disabled"}>Review missed${missed?` (${num(missed)})`:""}</button>
        <button class="btn ghost" id="markedBtn" ${marked?"":"disabled"}>Bookmarked${marked?` (${num(marked)})`:""}</button>
      </div>
      <p class="note">Missed questions come back: once soon, then ${REPEAT_PER_MISS - 1} more times spread through the bank.${owed ? ` Repeats owed: ${num(owed)}${due ? `, ${num(due)} due now (served first)` : ""}.` : ""}</p>
    </div>

    <div class="panel">
      <h2>Progress by topic</h2>
      <p class="legend"><span><i class="key m"></i>Mastered: last answer right, no repeats owed</span>
        <span><i class="key w"></i>In progress: missed, or repeats still owed</span></p>
      ${domRows}
      <p class="note">The badge is your difficulty level in the topic (Foundation &rarr; Proficient &rarr; Advanced &rarr; Expert), from your accuracy on Core, Medium and Advanced questions.</p>
    </div>

    <div class="panel"><button class="btn ghost" id="resetBtn">Reset all progress</button></div>`;

  document.getElementById("domSel").value = "all";
  document.querySelectorAll("#modeSeg button").forEach(b => b.onclick = () => {
    state.settings.mode = b.getAttribute("data-mode"); saveState();
    document.querySelectorAll("#modeSeg button").forEach(x => x.classList.remove("on"));
    b.classList.add("on");
  });
  document.getElementById("fillChk").onchange = e => { state.settings.fillMode = e.target.checked; saveState(); };
  document.getElementById("startBtn").onclick = () => {
    const dom = document.getElementById("domSel").value;
    const len = document.getElementById("lenSel").value;
    state.settings.length = len; saveState();
    if (len === "full") startSession({ mode: "test", domain: "all", length: "full", full: true });
    else startSession({ mode: state.settings.mode, domain: dom, length: len });
  };
  document.getElementById("smartBtn").onclick = () => startSession({ mode: state.settings.mode, domain: document.getElementById("domSel").value, length: document.getElementById("lenSel").value === "full" ? "20" : document.getElementById("lenSel").value, smart: true });
  document.getElementById("missedBtn").onclick = () => startSession({ mode: state.settings.mode, mode2: "missed", domain: "all", length: "all" });
  document.getElementById("markedBtn").onclick = () => startSession({ mode: state.settings.mode, mode2: "marked", domain: "all", length: "all" });
  document.getElementById("resetBtn").onclick = () => {
    if (confirm("Erase all progress, accuracy, difficulty levels, repeats, missed and bookmarked questions?")) {
      state = JSON.parse(JSON.stringify(DEFAULT_STATE)); saveState(); renderHome();
    }
  };
}

/* ---------- build + start session ---------- */
function buildFullQueue() {
  // proportional to topic weights, total FULL.questions
  let out = [];
  const totalW = Object.values(FULL.weights).reduce((a, b) => a + b, 0);
  Object.keys(FULL.weights).forEach(dom => {
    const n = Math.round(FULL.questions * FULL.weights[dom] / totalW);
    out = out.concat(shuffle(domQs(dom)).slice(0, n));
  });
  out = shuffle(out);
  if (out.length > FULL.questions) out = out.slice(0, FULL.questions);
  return out;
}
function smartPool(domain) {
  const base = domain === "all" ? BANK.questions : domQs(domain);
  const wanted = base.filter(q => tier(q) === targetTier(q.domain));
  const rank = q => { const h = peek(q.id); if (h.seen === 0) return 0; if (owesWork(h)) return 1; return 2 + h.correct; };
  return wanted.slice().sort((a, b) => rank(a) - rank(b) || Math.random() - 0.5);
}
function inScope(cfg, q) { return !cfg.domain || cfg.domain === "all" || String(q.domain) === String(cfg.domain); }

function startSession(cfg) {
  let pool, ordered = false;
  if (cfg.full) pool = buildFullQueue();
  else if (cfg.mode2 === "missed") pool = BANK.questions.filter(q => owesWork(peek(q.id)));
  else if (cfg.mode2 === "marked") pool = BANK.questions.filter(q => peek(q.id).bookmarked);
  else if (cfg.smart) { pool = smartPool(cfg.domain); ordered = true; }
  else pool = cfg.domain === "all" ? BANK.questions.slice() : domQs(cfg.domain);

  if (!pool.length) { alert(cfg.smart ? "No questions to serve right now." : "No questions available for that selection."); return; }

  let queue = cfg.full ? pool : (ordered ? pool : shuffle(pool));
  // Repeats that are due come first (not in the timed full-length review or the bookmarked list).
  const repeats = cfg.full || cfg.mode2 === "marked" ? [] : dueRepeats(BANK.questions.filter(q => inScope(cfg, q)), Date.now());
  if (repeats.length) { const ids = new Set(repeats.map(q => q.id)); queue = repeats.concat(queue.filter(q => !ids.has(q.id))); }
  let cap = 0;
  if (!cfg.full && cfg.length && cfg.length !== "all") {
    cap = parseInt(cfg.length, 10);
    if (queue.length > cap) queue = queue.slice(0, cap);
  }
  queue = queue.map(makeItem);

  session = { cfg, queue, cap, idx: 0, answers: new Array(queue.length), submitted: false, timerId: null, startAt: Date.now() };
  if (cfg.full) { session.endsAt = Date.now() + FULL.minutes * 60000; startTimer(); }
  renderQuiz();
}
function startTimer() {
  session.timerId = setInterval(() => {
    const el = document.getElementById("timer");
    const left = session.endsAt - Date.now();
    if (el) el.textContent = fmtTime(left);
    if (left <= 0) { endTimer(); submitTest(true); }
  }, 1000);
}
/* Practice mode: once a missed question (or a repeat) is due again, it is served next. A fixed-length session keeps
   its length (the last new question makes room); "Full selection" grows. */
function insertDueRepeat() {
  const cfg = session.cfg;
  if (cfg.full || isTest() || cfg.mode2 === "marked") return;
  const skip = new Set(session.queue.slice(session.idx).map(it => it.q.id));
  const due = dueRepeats(BANK.questions.filter(q => inScope(cfg, q)), Date.now(), skip);
  if (!due.length) return;
  session.queue.splice(session.idx + 1, 0, makeItem(due[0]));
  session.answers.splice(session.idx + 1, 0, undefined);
  if (session.cap && session.queue.length > session.cap) {
    for (let i = session.queue.length - 1; i > session.idx + 1; i--) {
      if (!session.queue[i].tag) { session.queue.splice(i, 1); session.answers.splice(i, 1); break; }
    }
  }
}

/* ---------- QUIZ ---------- */
function isTest() { return session.cfg.mode === "test" || session.cfg.full; }

function renderQuiz() {
  homeBtn.hidden = false;
  const total = session.queue.length;
  const item = session.queue[session.idx];
  const { q, v, display, label } = item;
  const ans = session.answers[session.idx];           // {chosenKey (bank letters, sorted) or typed text, correct, done}
  const reveal = !isTest() && ans && ans.done;         // practice: show feedback once every letter is picked
  const ch = ans && ans.chosenKey ? ans.chosenKey : "";
  const dname = BANK.domains[String(q.domain)] ? BANK.domains[String(q.domain)].name : "";
  const bk = peek(q.id).bookmarked;
  const labels = ["A", "B", "C", "D", "E", "F"];
  const fill = v.kind === "fill";

  let optsHtml = "";
  if (fill) {   // a text box; once checked, each blank's answer marked right or missed
    optsHtml = `<input id="fillIn" class="fill-in" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
        placeholder="Type your answer" value="${esc(ans && ans.skipped ? "" : ch)}" ${reveal ? "disabled" : ""}>`;
    if (reveal) {
      const hits = gradeFill(v.answers, ch);
      optsHtml += v.answers.map((accs, i) => `<div class="opt locked ${hits[i] ? "correct" : "chosen-wrong"}"><span class="ltr">${i + 1}</span>
        <span>${esc(accs[0])}${accs.length > 1 ? ` <span class="muted">(also accepted: ${esc(accs.slice(1, 4).join(", "))})</span>` : ""}</span></div>`).join("");
    } else if (!isTest()) optsHtml += `<div class="row"><button class="btn primary" id="fillBtn">Check</button><button class="btn ghost" id="skipBtn">I don't know</button></div>`;
  }
  display.forEach((e, i) => {
    let cls = "opt";
    if (reveal) { cls += " locked"; if (v.correct.includes(e.key)) cls += " correct"; else if (ch.includes(e.key)) cls += " chosen-wrong"; }
    else if (ch.includes(e.key)) cls += " selected";
    optsHtml += `<div class="${cls}" data-key="${e.key}"><span class="ltr">${labels[i]}</span><span>${esc(e.text)}</span></div>`;
  });

  let below = "";
  if (reveal) {
    const note = ans.repeat ? repeatNote(ans.repeat) : "";
    below = `<div class="explain"><div class="verdict ${ans.correct?"ok":"no"}">${ans.correct?"&#10003; Correct":"&#10007; Not quite"}</div>
        <div>${esc(fillExpl(q.explanation, label))}</div>${q.source?`<div class="src">Topic: ${esc(q.source)}</div>`:""}
        ${note ? `<div class="rep">${esc(note)}</div>` : ""}</div>
      <button class="btn primary" id="nextBtn">${session.idx+1<total?"Next question":"See results"}</button>`;
  } else if (isTest()) {
    const answered = session.answers.filter(a => a && a.chosenKey).length;
    below = `<div class="nav">
        <button class="btn ghost navb" id="prevBtn" ${session.idx===0?"disabled":""}>&#8592; Prev</button>
        <button class="btn ghost navb" id="nextBtn2" ${session.idx+1>=total?"disabled":""}>Next &#8594;</button>
      </div>
      <button class="btn primary" id="submitBtn">Submit answers (${answered}/${total})</button>`;
  }

  const timer = session.cfg.full ? `<span class="timer" id="timer">${fmtTime(session.endsAt-Date.now())}</span>` : "";
  app.innerHTML = `
    <div class="qbar">
      <span>${session.idx+1} / ${total}</span>
      <span class="progress"><div style="width:${pct(session.idx+(reveal?1:0), total)}%"></div></span>
      ${isTest() ? timer : `<span>${sessionScore()} &#10003;</span>`}
    </div>
    <div class="panel">
      <div class="chips">
        <span class="chip">D${q.domain} &middot; ${esc(dname)}</span>
        <span class="chip ${["","chip-core","chip-med","chip-adv"][tier(q)]}">${["","Core","Medium","Advanced"][tier(q)]}</span>
        ${item.tag ? `<span class="chip chip-rep">${esc(item.tag)}</span>` : ""}
        <button class="bookmark ${bk?"on":""}" id="bkBtn" title="Bookmark">${bk?"&#9733;":"&#9734;"}</button>
      </div>
      <p class="qstem">${esc(v.question + chooseNote(v))}</p>
      <div id="opts">${optsHtml}</div>
      ${below}
    </div>`;

  document.getElementById("bkBtn").onclick = () => { const h = hist(q.id); h.bookmarked = !h.bookmarked; saveState(); renderQuiz(); };
  if (!reveal) document.querySelectorAll("#opts .opt").forEach(el => el.onclick = () => selectOption(el.getAttribute("data-key")));
  if (fill && !reveal) {
    const box = document.getElementById("fillIn");
    if (isTest()) box.oninput = () => {      // test mode: keep the typing, scored at submit
      const text = box.value.trim();
      session.answers[session.idx] = { id: q.id, chosenKey: text || null, correct: !!fillTokens(text).length && gradeFill(v.answers, text).every(Boolean) };
    };
    else {
      const check = () => submitFill(box.value);
      document.getElementById("fillBtn").onclick = check;
      document.getElementById("skipBtn").onclick = () => submitFill("", true);
      box.onkeydown = e => { if (e.key === "Enter") check(); };
      if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) box.focus();
    }
  }

  if (reveal) document.getElementById("nextBtn").onclick = () => { if (session.idx+1<session.queue.length) { session.idx++; renderQuiz(); } else renderResults(); };
  if (isTest()) {
    document.getElementById("prevBtn").onclick = () => { if (session.idx>0){session.idx--; renderQuiz();} };
    document.getElementById("nextBtn2").onclick = () => { if (session.idx+1<total){session.idx++; renderQuiz();} };
    document.getElementById("submitBtn").onclick = () => {
      const answered = session.answers.filter(a => a && a.chosenKey).length;
      if (answered < total && !confirm(`${total-answered} unanswered. Submit anyway?`)) return;
      submitTest(false);
    };
  }
}

function sessionScore() { return session.answers.filter(a => a && a.correct).length; }

function answerPractice(q, entry) {
  entry.repeat = record(q.id, entry.correct);
  session.answers[session.idx] = entry;
  insertDueRepeat();
  renderQuiz();
}
function submitFill(raw, skipped) {
  const { q, v } = session.queue[session.idx];
  const text = String(raw || "").trim();
  if (!skipped && !fillTokens(text).length) return;          // nothing typed yet
  const correct = !skipped && gradeFill(v.answers, text).every(Boolean);
  answerPractice(q, { id: q.id, chosenKey: skipped ? "(skipped)" : text, skipped: !!skipped, correct, done: true });
}

function selectOption(key) {
  const { q, v } = session.queue[session.idx];
  const need = v.correct.length;                        // "Choose two" questions need two letters
  const prev = session.answers[session.idx];
  let chosen = prev && prev.chosenKey ? prev.chosenKey : "";
  if (need === 1) chosen = key;
  else if (chosen.includes(key)) chosen = chosen.replace(key, "");
  else if (chosen.length < need) chosen += key;
  chosen = chosen.split("").sort().join("");
  const correct = chosen === v.correct;
  if (isTest()) {
    session.answers[session.idx] = { id: q.id, chosenKey: chosen || null, correct };
    renderQuiz(); // re-render to show selection + updated answered count
  } else if (chosen.length === need) {
    answerPractice(q, { id: q.id, chosenKey: chosen, correct, done: true });
  } else {
    session.answers[session.idx] = { id: q.id, chosenKey: chosen || null, correct, done: false };
    renderQuiz();
  }
}

function submitTest(timedOut) {
  endTimer();
  session.submitted = true;
  // commit results to history now (test mode deferred scoring); unanswered questions are not counted
  session.queue.forEach((item, i) => {
    const a = session.answers[i];
    if (a && a.chosenKey) a.repeat = record(item.q.id, a.correct);
  });
  saveState();
  session.timedOut = timedOut;
  renderResults();
}

/* ---------- RESULTS ---------- */
function renderResults() {
  homeBtn.hidden = false;
  const test = isTest();
  // Array.from, not map: unanswered questions are holes in the array, and map would skip them
  const answeredArr = Array.from(session.queue, (it, i) => session.answers[i] || { id: it.q.id, chosenKey: null, correct: false });
  const total = session.queue.length;
  const correct = answeredArr.filter(a => a.correct).length;
  const p = pct(correct, total);

  const byDom = {};
  session.queue.forEach((item, i) => { const d = item.q.domain; (byDom[d] = byDom[d] || {c:0,t:0}).t++; if (answeredArr[i].correct) byDom[d].c++; });
  let domHtml = "";
  Object.keys(byDom).sort().forEach(d => { const o = byDom[d]; domHtml += `<div class="res-row"><span class="nm">D${d}. ${esc(BANK.domains[String(d)].name)}</span><span class="bar"><div style="width:${pct(o.c,o.t)}%"></div></span><span class="pct">${o.c}/${o.t}</span></div>`; });

  let head;
  if (session.cfg.full) {
    const met = p >= FULL.goal;
    const used = fmtTime((session.timedOut ? FULL.minutes*60000 : Date.now()-session.startAt));
    head = `<div class="score-big">${p}%</div>
      <div class="verdict-big ${met?"ok":"no"}">${met?`Met the ${FULL.goal}% goal`:`Below the ${FULL.goal}% goal`}</div>
      <div class="score-sub">${correct} of ${total} correct &middot; time ${used}${session.timedOut?" (time expired)":""}</div>`;
  } else {
    const msg = p>=80?"Strong work.":p>=65?"Getting there.":"Keep drilling.";
    head = `<div class="score-big">${p}%</div><div class="score-sub">${correct} of ${total} correct &middot; ${esc(msg)}</div>`;
  }
  const ids = new Set(session.queue.map(it => it.q.id));
  const owedNow = Array.from(ids).reduce((s, id) => s + (peek(id).owed || 0), 0);
  if (owedNow) head += `<div class="score-sub">Missed questions come back once soon, then twice more spread through the bank ` +
    `(${owedNow} repeat${owedNow === 1 ? "" : "s"} owed on these).</div>`;

  // review list (quiz / full review): every question, your answer vs correct
  let review = "";
  if (test) {
    review = `<div class="panel"><h2>Review</h2><div id="reviewList">` + session.queue.map((item, i) => {
      const q = item.q, v = item.v, a = answeredArr[i], ch = a.chosenKey || "";
      const hits = v.kind === "fill" ? gradeFill(v.answers, ch) : [];
      const opts = v.kind === "fill"
        ? `<div class="ropt">Your answer: ${ch ? esc(ch) : "<em>skipped</em>"}</div>` + v.answers.map((accs, j) =>
            `<div class="ropt ${hits[j] ? "correct" : "chosen-wrong"}">${j + 1}) ${esc(accs[0])}</div>`).join("")
        : item.display.map(e => {
            let c = "ropt"; if (v.correct.includes(e.key)) c+=" correct"; else if (ch.includes(e.key)) c+=" chosen-wrong";
            return `<div class="${c}">${item.label[e.key]}) ${esc(e.text)}</div>`;
          }).join("");
      return `<details class="rev ${a.correct?"ok":"no"}">
          <summary><span class="rmark">${a.correct?"&#10003;":"&#10007;"}</span> Q${i+1}. ${esc(v.question + chooseNote(v))}</summary>
          <div class="revbody">${opts}<div class="explain"><div>${esc(fillExpl(q.explanation, item.label))}</div>${q.source?`<div class="src">Topic: ${esc(q.source)}</div>`:""}</div></div>
        </details>`;
    }).join("") + `</div></div>`;
  }

  const missedThis = answeredArr.filter(a => !a.correct).length;
  app.innerHTML = `
    <div class="panel center">${head}</div>
    <div class="panel"><h2>By domain</h2>${domHtml}</div>
    ${review}
    <div class="panel">
      <button class="btn primary" id="againBtn">New session (same setup)</button>
      <button class="btn ghost" id="reviewBtn" ${missedThis?"":"disabled"}>Drill the ${missedThis} you missed</button>
      <button class="btn ghost" id="homeBtn2">Home</button>
    </div>`;

  document.getElementById("againBtn").onclick = () => startSession(session.cfg);
  document.getElementById("reviewBtn").onclick = () => {
    const wrongIds = new Set(answeredArr.filter(a => !a.correct).map(a => a.id));
    const pool = BANK.questions.filter(q => wrongIds.has(q.id));
    const queue = shuffle(pool).map(makeItem);
    session = { cfg: { mode: "practice", domain: "all", length: "all", mode2: "drill" }, queue, cap: 0, idx: 0, answers: new Array(queue.length), submitted: false, timerId: null, startAt: Date.now() };
    renderQuiz();
  };
  document.getElementById("homeBtn2").onclick = () => { session = null; renderHome(); };
}

/* ---------- service worker + update prompt ---------- */
let swUpdating = false;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (swUpdating) location.reload(); });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      // a new version was already waiting from a previous visit
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      // a new version is downloaded while the app is open
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) showUpdate(nw);
        });
      });
      // re-check for a new version each time the app comes back to the foreground
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  });
}
function showUpdate(worker) {
  if (document.getElementById("updateBar")) return;
  const bar = document.createElement("div");
  bar.id = "updateBar";
  bar.className = "update-bar";
  bar.innerHTML = '<span>New version available</span><button id="updateBtn">Refresh</button>';
  document.body.appendChild(bar);
  document.getElementById("updateBtn").onclick = () => {
    document.getElementById("updateBtn").textContent = "Updating…";
    swUpdating = true;
    // Ask the waiting worker to take over. Re-fetch reg.waiting in case `worker` is stale.
    try { if (worker) worker.postMessage({ type: "SKIP_WAITING" }); } catch (e) {}
    if (navigator.serviceWorker) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && reg.waiting) { try { reg.waiting.postMessage({ type: "SKIP_WAITING" }); } catch (e) {} }
      }).catch(() => {});
    }
    // Fallback: some browsers (notably iOS standalone PWAs) don't fire
    // `controllerchange`, which would leave the button stuck on "Updating…".
    // Reload anyway after a short delay so it can never hang.
    setTimeout(() => location.reload(), 2000);
  };
}
