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

const LEVEL_NAMES = ["Not started", "Foundation", "Proficient", "Advanced", "Mastered"];

/* ---------- persistent state ---------- */
const STORE_KEY = "spec_guide_v1";
const DEFAULT_STATE = { history: {}, settings: { mode: "practice", length: "20" } };

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { history: p.history || {}, settings: Object.assign({}, DEFAULT_STATE.settings, p.settings) };
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
const BLANK = { seen: 0, correct: 0, wrong: 0, bookmarked: false };
function peek(id) { return state.history[id] || BLANK; }
function hist(id) { return state.history[id] || (state.history[id] = { seen: 0, correct: 0, wrong: 0, bookmarked: false }); }
function esc(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
function tier(q) { return q.difficulty || (q.hard ? 3 : 1); }   // 1 = Core, 2 = Medium, 3 = Advanced
function domQs(dom) { return BANK.questions.filter(q => String(q.domain) === String(dom)); }

/* ---------- difficulty progression (3 tiers: Core / Medium / Advanced) ---------- */
function domainStats(dom) {
  const s = { t: { 1:{seen:0,correct:0}, 2:{seen:0,correct:0}, 3:{seen:0,correct:0} }, seen: 0, correct: 0 };
  domQs(dom).forEach(q => {
    const h = peek(q.id);
    const ans = h.correct + h.wrong;
    if (!ans) return;
    s.seen += ans; s.correct += h.correct;
    const t = s.t[tier(q)] || s.t[1];
    t.seen += ans; t.correct += h.correct;
  });
  return s;
}
function acc(c, s) { return s ? c / s : 0; }
function domainLevel(dom) {
  const s = domainStats(dom);
  const t1 = s.t[1], t2 = s.t[2], t3 = s.t[3];
  let level = 0;
  if (s.seen > 0) level = 1;
  const L2 = t1.correct >= 6 && acc(t1.correct, t1.seen) >= 0.70;   // mastered Core
  const L3 = L2 && t2.correct >= 6 && acc(t2.correct, t2.seen) >= 0.70;  // mastered Medium
  const L4 = L3 && t3.correct >= 6 && acc(t3.correct, t3.seen) >= 0.75;  // mastered Advanced
  if (L4) level = 4; else if (L3) level = 3; else if (L2) level = 2;
  let progress = 0, nextNeed = "";
  if (level === 0) { progress = 0; nextNeed = "Answer a few to begin"; }
  else if (level === 1) { progress = Math.min(1, t1.correct / 6); nextNeed = `${Math.min(t1.correct,6)}/6 Core correct → Proficient`; }
  else if (level === 2) { progress = Math.min(1, t2.correct / 6); nextNeed = `${Math.min(t2.correct,6)}/6 Medium correct → Advanced`; }
  else if (level === 3) { progress = Math.min(1, t3.correct / 6); nextNeed = `${Math.min(t3.correct,6)}/6 Advanced correct → Mastered`; }
  else { progress = 1; nextNeed = "Top level reached"; }
  return { level, name: LEVEL_NAMES[level], progress, nextNeed, accuracy: pct(s.correct, s.seen), seen: s.seen };
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

/* ---------- boot ---------- */
fetch("questions.json").then(r => r.json())
  .then(data => { BANK = data; renderHome(); })
  .catch(() => { app.innerHTML = '<div class="panel center muted">Could not load the question bank. Open the app once while online so it can cache for offline use.</div>'; });

/* ---------- HOME ---------- */
function renderHome() {
  homeBtn.hidden = true;
  const qs = BANK.questions;
  const seen = qs.filter(q => peek(q.id).seen > 0).length;
  const totalCorrect = qs.reduce((s, q) => s + peek(q.id).correct, 0);
  const totalAns = qs.reduce((s, q) => s + peek(q.id).correct + peek(q.id).wrong, 0);
  const missed = qs.filter(q => peek(q.id).wrong > 0 && peek(q.id).correct === 0).length;
  const marked = qs.filter(q => peek(q.id).bookmarked).length;
  const doms = BANK.domains;

  let domSel = `<option value="all">All domains (${qs.length})</option>`;
  Object.keys(doms).forEach(k => { domSel += `<option value="${k}">${k}. ${esc(doms[k].name)} (${doms[k].count})</option>`; });

  const lengths = [["10","10 questions"],["20","20 questions"],["50","50 questions"],["all","Full selection"],["full",`Full-length review (${FULL.questions} Q, timed)`]];

  // difficulty-by-domain rows
  let domRows = "";
  Object.keys(doms).forEach(k => {
    const dl = domainLevel(k);
    domRows += `<div class="dom-row">
        <span class="nm">${k}. ${esc(doms[k].name)}</span>
        <span class="lvl lvl-${dl.level}">${dl.level ? esc(dl.name) : "&ndash;"}</span>
        <span class="bar" title="${esc(dl.nextNeed)}"><div style="width:${Math.round(dl.progress*100)}%"></div></span>
        <span class="pct">${dl.seen ? dl.accuracy + "%" : ""}</span>
      </div>`;
  });

  app.innerHTML = `
    <div class="panel">
      <div class="stats">
        <div class="stat-card"><div class="num">${seen}</div><div class="lbl">Seen</div></div>
        <div class="stat-card"><div class="num">${pct(totalCorrect, totalAns)}%</div><div class="lbl">Accuracy</div></div>
        <div class="stat-card"><div class="num">${qs.length}</div><div class="lbl">Questions</div></div>
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
      <div class="field"><label for="domSel">Topic</label><select id="domSel">${domSel}</select></div>
      <div class="field"><label for="lenSel">Length</label>
        <select id="lenSel">${lengths.map(o=>`<option value="${o[0]}" ${state.settings.length===o[0]?"selected":""}>${o[1]}</option>`).join("")}</select>
      </div>
      <button class="btn primary" id="startBtn">Start</button>
      <button class="btn" id="smartBtn">Smart practice<span class="small">starts at Core, steps up to Advanced as you improve</span></button>
      <div class="row">
        <button class="btn ghost" id="missedBtn" ${missed?"":"disabled"}>Review missed${missed?` (${missed})`:""}</button>
        <button class="btn ghost" id="markedBtn" ${marked?"":"disabled"}>Bookmarked${marked?` (${marked})`:""}</button>
      </div>
    </div>

    <div class="panel">
      <h2>Difficulty level by topic</h2>
      <p class="muted" style="font-size:12px;margin:-4px 0 12px">Answer questions correctly to advance: Foundation &rarr; Proficient &rarr; Advanced &rarr; Mastered.</p>
      ${domRows}
    </div>

    <div class="panel"><button class="btn ghost" id="resetBtn">Reset all progress</button></div>`;

  document.getElementById("domSel").value = "all";
  document.querySelectorAll("#modeSeg button").forEach(b => b.onclick = () => {
    state.settings.mode = b.getAttribute("data-mode"); saveState();
    document.querySelectorAll("#modeSeg button").forEach(x => x.classList.remove("on"));
    b.classList.add("on");
  });
  document.getElementById("startBtn").onclick = () => {
    const dom = document.getElementById("domSel").value;
    const len = document.getElementById("lenSel").value;
    state.settings.length = len; saveState();
    if (len === "full") startSession({ mode: "test", domain: "all", length: "full", full: true });
    else startSession({ mode: state.settings.mode, domain: dom, length: len });
  };
  document.getElementById("smartBtn").onclick = () => startSession({ mode: state.settings.mode, domain: document.getElementById("domSel").value, length: document.getElementById("lenSel").value === "full" ? "20" : document.getElementById("lenSel").value, smart: true });
  document.getElementById("missedBtn").onclick = () => startSession({ mode: state.settings.mode, mode2: "missed", length: "all" });
  document.getElementById("markedBtn").onclick = () => startSession({ mode: state.settings.mode, mode2: "marked", length: "all" });
  document.getElementById("resetBtn").onclick = () => {
    if (confirm("Erase all progress, accuracy, difficulty levels, missed and bookmarked questions?")) {
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
  // trim to exact count
  out = shuffle(out);
  if (out.length > FULL.questions) out = out.slice(0, FULL.questions);
  return out;
}
function smartPool(domain) {
  const base = domain === "all" ? BANK.questions : domQs(domain);
  const wanted = base.filter(q => tier(q) === targetTier(q.domain));
  const rank = q => { const h = peek(q.id); if (h.seen === 0) return 0; if (h.wrong > 0 && h.correct === 0) return 1; return 2 + h.correct; };
  return wanted.slice().sort((a, b) => rank(a) - rank(b) || Math.random() - 0.5);
}

function startSession(cfg) {
  let pool, ordered = false;
  if (cfg.full) pool = buildFullQueue();
  else if (cfg.mode2 === "missed") pool = BANK.questions.filter(q => peek(q.id).wrong > 0 && peek(q.id).correct === 0);
  else if (cfg.mode2 === "marked") pool = BANK.questions.filter(q => peek(q.id).bookmarked);
  else if (cfg.smart) { pool = smartPool(cfg.domain); ordered = true; }
  else pool = cfg.domain === "all" ? BANK.questions.slice() : domQs(cfg.domain);

  if (!pool.length) { alert(cfg.smart ? "No questions to serve right now." : "No questions available for that selection."); return; }

  let queue = cfg.full ? pool : (ordered ? pool : shuffle(pool));
  if (!cfg.full && cfg.length && cfg.length !== "all") {
    const n = parseInt(cfg.length, 10);
    if (queue.length > n) queue = queue.slice(0, n);
  }
  queue = queue.map(q => ({ q, display: shuffle(Object.keys(q.options).map(k => ({ key: k, text: q.options[k] }))) }));

  session = { cfg, queue, idx: 0, answers: new Array(queue.length), submitted: false, timerId: null, startAt: Date.now() };
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

/* ---------- QUIZ ---------- */
function isTest() { return session.cfg.mode === "test" || session.cfg.full; }

function renderQuiz() {
  homeBtn.hidden = false;
  const total = session.queue.length;
  const { q, display } = session.queue[session.idx];
  const ans = session.answers[session.idx];           // {chosenKey, correct?}
  const reveal = !isTest() && ans;                     // practice: show feedback after answering
  const dname = BANK.domains[String(q.domain)] ? BANK.domains[String(q.domain)].name : "";
  const bk = peek(q.id).bookmarked;
  const labels = ["A", "B", "C", "D", "E", "F"];

  let optsHtml = "";
  display.forEach((e, i) => {
    let cls = "opt";
    if (reveal) { cls += " locked"; if (e.key === q.correct) cls += " correct"; else if (e.key === ans.chosenKey) cls += " chosen-wrong"; }
    else if (ans && ans.chosenKey === e.key) cls += " selected";
    optsHtml += `<div class="${cls}" data-key="${e.key}"><span class="ltr">${labels[i]}</span><span>${esc(e.text)}</span></div>`;
  });

  let below = "";
  if (reveal) {
    below = `<div class="explain"><div class="verdict ${ans.correct?"ok":"no"}">${ans.correct?"&#10003; Correct":"&#10007; Not quite"}</div>
        <div>${esc(q.explanation)}</div>${q.source?`<div class="src">Topic: ${esc(q.source)}</div>`:""}</div>
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
      <div style="display:flex;align-items:center;gap:8px">
        <span class="chip">D${q.domain} &middot; ${esc(dname)}</span>
        <span class="chip ${["","chip-core","chip-med","chip-adv"][tier(q)]}">${["","Core","Medium","Advanced"][tier(q)]}</span>
        <button class="bookmark ${bk?"on":""}" id="bkBtn" title="Bookmark">${bk?"&#9733;":"&#9734;"}</button>
      </div>
      <p class="qstem">${esc(q.question)}</p>
      <div id="opts">${optsHtml}</div>
      ${below}
    </div>`;

  document.getElementById("bkBtn").onclick = () => { const h = hist(q.id); h.bookmarked = !h.bookmarked; saveState(); renderQuiz(); };
  if (!reveal) document.querySelectorAll("#opts .opt").forEach(el => el.onclick = () => selectOption(el.getAttribute("data-key")));

  if (reveal) document.getElementById("nextBtn").onclick = () => { if (session.idx+1<total) { session.idx++; renderQuiz(); } else renderResults(); };
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

function selectOption(chosenKey) {
  const { q } = session.queue[session.idx];
  if (isTest()) {
    session.answers[session.idx] = { id: q.id, chosenKey, correct: chosenKey === q.correct };
    renderQuiz(); // re-render to show selection + updated answered count
  } else {
    const correct = chosenKey === q.correct;
    session.answers[session.idx] = { id: q.id, chosenKey, correct };
    const h = hist(q.id); h.seen++; correct ? h.correct++ : h.wrong++; saveState();
    renderQuiz();
  }
}

function submitTest(timedOut) {
  endTimer();
  session.submitted = true;
  // commit results to history now (test mode deferred scoring)
  session.queue.forEach((item, i) => {
    const a = session.answers[i];
    if (a && a.chosenKey) { const h = hist(item.q.id); h.seen++; a.correct ? h.correct++ : h.wrong++; }
  });
  saveState();
  session.timedOut = timedOut;
  renderResults();
}

/* ---------- RESULTS ---------- */
function renderResults() {
  homeBtn.hidden = false;
  const test = isTest();
  const answeredArr = session.answers.map((a, i) => a || { id: session.queue[i].q.id, chosenKey: null, correct: false });
  const total = session.queue.length;
  const correct = answeredArr.filter(a => a.correct).length;
  const p = pct(correct, total);

  const byDom = {};
  session.queue.forEach((item, i) => { const d = item.q.domain; (byDom[d] = byDom[d] || {c:0,t:0}).t++; if (answeredArr[i].correct) byDom[d].c++; });
  let domHtml = "";
  Object.keys(byDom).sort().forEach(d => { const o = byDom[d]; domHtml += `<div class="dom-row"><span class="nm">D${d}. ${esc(BANK.domains[String(d)].name)}</span><span class="bar"><div style="width:${pct(o.c,o.t)}%"></div></span><span class="pct">${o.c}/${o.t}</span></div>`; });

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

  // review list (quiz / full review): every question, your answer vs correct
  let review = "";
  if (test) {
    review = `<div class="panel"><h2>Review</h2><div id="reviewList">` + session.queue.map((item, i) => {
      const q = item.q, a = answeredArr[i], labels=["A","B","C","D"];
      const keys = Object.keys(q.options);
      const yourTxt = a.chosenKey ? esc(q.options[a.chosenKey]) : "<em>skipped</em>";
      const opts = keys.map(k => {
        let c = "ropt"; if (k===q.correct) c+=" correct"; else if (k===a.chosenKey) c+=" chosen-wrong";
        return `<div class="${c}">${esc(q.options[k])}</div>`;
      }).join("");
      return `<details class="rev ${a.correct?"ok":"no"}">
          <summary><span class="rmark">${a.correct?"&#10003;":"&#10007;"}</span> Q${i+1}. ${esc(q.question)}</summary>
          <div class="revbody">${opts}<div class="explain"><div>${esc(q.explanation)}</div>${q.source?`<div class="src">Topic: ${esc(q.source)}</div>`:""}</div></div>
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
    const queue = shuffle(pool).map(q => ({ q, display: shuffle(Object.keys(q.options).map(k => ({ key:k, text:q.options[k] }))) }));
    session = { cfg: { mode: "practice", domain: "all", length: "all" }, queue, idx: 0, answers: new Array(queue.length), submitted: false, timerId: null, startAt: Date.now() };
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
    worker.postMessage({ type: "SKIP_WAITING" });
  };
}
