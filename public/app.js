/* ========= language setup ========= */
const LANGS = {
  python: { name: 'Python 3', mode: 'python', ext: 'py', tmpl: `# Python demo — reads stdin if any
import sys

name = input("Your name: ").strip() or "World"
print(f"Hello, {name}! 🐍")

# quickFizz demo
for i in range(1, 16):
    out = "FizzBuzz"*(i%15==0) or "Fizz"*(i%3==0) or "Buzz"*(i%5==0) or str(i)
    print(out, end=" ")
print()` },
  javascript: { name: 'JavaScript (Node)', mode: 'javascript', ext: 'js', tmpl: `// JavaScript demo
const name = "World";
console.log(\`Hello, \${name}! 🟨\`);

const nums = [1, 2, 3, 4, 5];
console.log("Squares:", nums.map(n => n * n).join(" "));
console.log("Sum:", nums.reduce((a, b) => a + b, 0));` },
  typescript: { name: 'TypeScript (Node)', mode: 'text/javascript', ext: 'ts', tmpl: `// TypeScript demo — runs natively with Node's type stripping
interface Person { name: string; tags: string[] }

const p: Person = { name: "Ada", tags: ["computing", "pioneer"] };
console.log(\`Hello, \${p.name}! 🟦 (\${p.tags.join(", ")})\`);

function total(...nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}
console.log("total(1..10) =", total(1,2,3,4,5,6,7,8,9,10));` },
  c: { name: 'C (gcc)', mode: 'text/x-csrc', ext: 'c', tmpl: `#include <stdio.h>
#include <string.h>

int main(void) {
    char name[64] = "World";
    printf("Hello, %s! 🅒\\n", name);

    for (int i = 1; i <= 10; i++)
        printf("%d squared = %d\\n", i, i * i);
    return 0;
}` },
  cpp: { name: 'C++ (g++)', mode: 'text/x-c++src', ext: 'cpp', tmpl: `#include <iostream>
#include <vector>
using namespace std;

int main() {
    string name = "World";
    cout << "Hello, " << name << "! ➕\\n";

    vector<int> v{5, 3, 9, 1, 7};
    sort(v.begin(), v.end());
    for (int x : v) cout << x << " ";
    return 0;
}` },
  bash: { name: 'Bash', mode: 'shell', ext: 'sh', tmpl: `#!/usr/bin/env bash
echo "Hello, Bash! 🐚"
echo "This machine is: $(uname -sm)"

echo "-- counting to 5 --"
for i in {1..5}; do echo "line $i"; done

echo "-- disk usage --"
df -h / | tail -1` },
  perl: { name: 'Perl', mode: 'perl', ext: 'pl', tmpl: `# Perl demo
use strict; use warnings;
print "Hello, Perl! 🐪\\n";

foreach my $i (1..5) {
    printf "%d! = %d\\n", $i, factorial($i);
}

sub factorial { my $n = shift; return $n <= 1 ? 1 : $n * factorial($n - 1); }` },
  awk: { name: 'AWK', mode: 'shell', ext: 'awk', tmpl: `# AWK demo — paste your own stdin on the "Input" tab
BEGIN {
    nums = "7 2 9 4 11 3"; n = split(nums, a, " ")
    total = 0
    for (i = 1; i <= n; i++) total += a[i]
    printf "values : %s\\n", nums
    printf "count  : %d\\n", n
    printf "sum    : %d\\n", total
    printf "average: %.2f\\n", total / n
}` },
};
const START_LANG = 'python';

/* ========= editor ========= */
const langSel = document.getElementById('lang');
for (const [id, l] of Object.entries(LANGS)) {
  const o = document.createElement('option');
  o.value = id; o.textContent = l.name;
  langSel.appendChild(o);
}
const CM = CodeMirror.fromTextArea(document.getElementById('code'), {
  theme: 'material-darker', lineNumbers: true, indentUnit: 4, autoCloseBrackets: true,
  matchBrackets: true, lineWrapping: false, extraKeys: { 'Ctrl-Enter': runCode, 'Ctrl-Space': 'autocomplete' },
});
const STDIN_CM = CodeMirror.fromTextArea(document.getElementById('stdin'), {
  theme: 'material-darker', lineNumbers: true, lineWrapping: true,
});

function loadTemplate(id, force) {
  const key = 'oc_last_' + id;
  const saved = localStorage.getItem(key);
  CM.setValue(force || !saved ? LANGS[id].tmpl : saved);
  CM.setOption('mode', LANGS[id].mode);
}
loadTemplate(START_LANG);
langSel.addEventListener('change', () => { loadTemplate(langSel.value); });
CM.on('change', () => localStorage.setItem('oc_last_' + langSel.value, CM.getValue()));

/* ========= run ========= */
const out = document.getElementById('output');
const status = document.getElementById('status');
let busy = false;

async function runCode() {
  if (busy) return;
  busy = true;
  const langId = langSel.value;
  status.textContent = 'running…'; status.className = 'status busy';
  out.textContent = `⏳ Compiling/running ${LANGS[langId].name}…\n`;
  try {
    const r = await fetch('/api/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: langId, code: CM.getValue(), stdin: STDIN_CM.getValue() }),
    });
    const raw = await r.text();
    let j;
    try { j = JSON.parse(raw); }
    catch {
      j = { code: -1, stdout: '', stderr: `Server returned an invalid response (HTTP ${r.status}). ${raw.slice(0, 200)}\nTip: the local server may have restarted — reload the page (Ctrl+R).` };
    }
    let text = '';
    if (j.stdout) text += j.stdout;
    if (j.stderr) text += '\n' + (text ? '\n' : '') + j.stderr;
    out.textContent = text.trim() || '(no output)';
    out.className = 'term' + (j.code === 0 ? (j.stderr ? '' : ' term-ok') : '');
    status.textContent = j.code === 0 ? `✓ exit 0 • ${j.stdout.length + j.stderr.length} bytes` : `✗ exit ${j.code}`;
    status.className = 'status ' + (j.code === 0 ? 'ok' : 'err');
  } catch (e) {
    out.textContent = 'Network/server error: ' + e.message; out.className = 'term';
    status.textContent = 'failed'; status.className = 'status err';
  }
  busy = false;
}
document.getElementById('run').addEventListener('click', runCode);

document.getElementById('clear').onclick = () => CM.setValue('');
document.getElementById('clearout').onclick = () => { out.textContent = ''; status.textContent = 'ready'; status.className = 'status'; };
document.getElementById('copy').onclick = async () => { await navigator.clipboard.writeText(out.textContent); status.textContent = 'copied ✓'; };
out.addEventListener('click', focusPanel);

/* mini tabs — Output vs stdin */
document.querySelectorAll('.mini-tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.mini-tab').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  const panel = t.dataset.panel;
  out.style.display = panel === 'output' ? '' : 'none';
  document.getElementById('stdin-wrap').classList.toggle('hidden', panel !== 'input');
  if (panel === 'input') STDIN_CM.refresh();
}));
function focusPanel() {
  const active = document.querySelector('.mini-tab.active').dataset.panel;
  if (active === 'input') STDIN_CM.focus();
}

/* ========= view switching ========= */
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById('view-editor').classList.toggle('hidden', t.dataset.view !== 'editor');
  document.getElementById('view-sql').classList.toggle('hidden', t.dataset.view !== 'sql');
  if (t.dataset.view === 'editor') CM.refresh(); else { initSqlTerm(); setTimeout(focusTerm, 50); }
}));

/* ========= SQL TERMINAL (real sqlite shell behaviour) ========= */
const term = document.getElementById('term');
const sqlInput = document.getElementById('sql-input');
let sqlHistory = JSON.parse(localStorage.getItem('oc_sqlhist') || '[]');
let histIdx = sqlHistory.length;
let curLine = '';        // what's typed on the current prompt
let pendingSql = '';     // multi-line buffer
let started = false;

function initSqlTerm() {
  if (started) { renderCurrent(); return; }
  started = true;
  banner();
  renderCurrent();
  (async () => {
    const saved = localStorage.getItem('oc_db');
    if (saved && saved !== 'playground') {
      try { await fetch('/api/db/use', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: saved }) }); } catch {}
    }
    term.querySelectorAll('.line').forEach(d => d.remove());
    banner();
    await refreshDbs();
    await sql('.tables', true);
    line('&nbsp;'); line('&nbsp;');
    renderCurrent();
  })();
}
function banner() {
  line(`<span class="result">OmniCode SQL Terminal — SQLite 3 shell emulation</span>`, 'result');
  line(`<span class="result">Database: <b>${(dbSel.dataset.active || 'playground')}</b>.sqlite • .tables .schema ; SQL ends with ";"</span>`, 'result');
  line(`<span class="result">Create tables: type CREATE TABLE …; or use the “New Table” button • New DBs via “New DB” or: sqlite3 otherdb</span>`, 'result');
  line(`<span class="result">↑/↓ history • Ctrl+L clear • .help</span>`, 'result');
}
function line(html, cls = '', beforeCurrent = true) {
  const div = document.createElement('div');
  div.className = 'line ' + cls;
  div.innerHTML = html;
  term.insertBefore(div, document.getElementById('cur') || null);
  term.scrollTop = term.scrollHeight;
}
function promptText() { return pendingSql ? '   ...> ' : 'sql> '; }
function renderCurrent() {
  let cur = document.getElementById('cur');
  if (!cur) {
    cur = document.createElement('div'); cur.id = 'cur'; cur.className = 'current';
    term.appendChild(cur);
  }
  cur.innerHTML = `<span class="ps1${pendingSql ? ' cont' : ''}">${promptText()}</span><span>${escapeHtml(curLine)}</span><span class="cursor"></span>`;
  term.scrollTop = term.scrollHeight;
}
function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
async function echoAndReset(prompt, typed) {
  line(`<span class="cmd-echo"><span class="ps1">${escapeHtml(prompt)}</span>${escapeHtml(typed)}</span>`, 'cmd-echo');
  curLine = ''; renderCurrent();
}
async function sql(stmt, quiet) {
  try {
    const r = await fetch('/api/sql', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: stmt }),
    });
    const raw = await r.text();
    let j;
    try { j = JSON.parse(raw); }
    catch {
      j = { out: '', err: `Server returned an invalid response (HTTP ${r.status}). Tip: reload the page (Ctrl+R) — the local server may have restarted.` };
    }
    if (j.out.trim()) j.out.split('\n').forEach(l => line(`<span class="result">${escapeHtml(l)}</span>`, 'result'));
    if (j.err.trim()) j.err.split('\n').forEach(l => line(`<span class="error">${escapeHtml(l)}</span>`, 'error'));
    if (!j.out.trim() && !j.err.trim() && !quiet) line(`<span class="error">${escapeHtml('(no result rows)')}</span>`, 'error');
  } catch (e) { line(`<span class="error">server error: ${escapeHtml(String(e))}</span>`, 'error'); }
}

term.addEventListener('keydown', e => {
  // desktop fallback: clicking/typing on the painted terminal also edits
  if (!e.ctrlKey && e.metaKey === false && e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'l') { focusTerm(); }
});
function focusTerm() {
  sqlInput.focus({ preventScroll: true });
  const len = sqlInput.value.length;
  sqlInput.setSelectionRange(len, len);
  renderCurrent();
}
sqlInput.addEventListener('input', () => { curLine = sqlInput.value; renderCurrent(); });

sqlInput.addEventListener('keydown', async e => {
  const v = sqlInput.value;
  if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); sqlInput.value = ''; term.querySelectorAll('.line').forEach(d => d.remove()); banner(); return; }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (histIdx > 0) { histIdx--; sqlInput.value = sqlHistory[histIdx] || ''; }
    focusTerm(); return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (histIdx < sqlHistory.length - 1) { histIdx++; sqlInput.value = sqlHistory[histIdx] || ''; }
    else { histIdx = sqlHistory.length; sqlInput.value = ''; }
    focusTerm(); return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    const typed = v; sqlInput.value = ''; curLine = '';
    await submitLine(typed);
    return;
  }
});
async function submitLine(typed) {
    // "sqlite3 file.db" typed at our prompt = user wants that database → switch/create it
    const sq = typed.match(/^\s*sqlite3?\s*(?:['"`])?([A-Za-z0-9_-]+)(?:['"`])?/);
    if (sq) {
      const name = sq[1].replace(/[.;]+$/, '');
      line(`<span class="error">💡 You're already inside SQLite — no need to launch sqlite3.</span>`, 'error');
      line(`<span class="result">→ Switching to database "${escapeHtml(name)}" (creating it if needed)…</span>`, 'result');
      await fetch('/api/db/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      await fetch('/api/db/use', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      localStorage.setItem('oc_db', name);
      cur.innerHTML = ''; term.querySelectorAll('.line').forEach(d => d.remove());
      banner();
      await refreshDbs(true);
      await sql('.tables', true);
      line('&nbsp;'); renderCurrent();
      return;
    }
    const isDot = /^\s*\./.test(typed);
    const isEnd = /;\s*$/.test(typed);
    if (!pendingSql && typed.trim() === '') { renderCurrent(); return; }

    if (!pendingSql && !isDot && !isEnd && typed.trim()) {
      pendingSql = typed;
      await echoAndReset(promptText(), typed);
      histIdx = sqlHistory.length; return;
    }
    const full = pendingSql ? pendingSql + '\n' + typed : typed;
    pendingSql = '';
    await echoAndReset(promptText(), typed);

    sqlHistory.push(full.trim());
    localStorage.setItem('oc_sqlhist', JSON.stringify(sqlHistory.slice(-200)));
    histIdx = sqlHistory.length;

    if (/^\s*\./.test(full)) {  // dot-command: run via sqlite3 shell too
      if (full.match(/^\s*\.help\b/)) { help(); return; }
      await sql(full);
    } else {
      await sql(full);
    }
    line('&nbsp;');
    renderCurrent();
    return;
  }
function help() {
  [' .tables            — list tables', ' .schema <name>     — show CREATE statements', ' .headers on|off',
   ' SQL statements end with ";" — multi-line supported (… wait for "…>")',
   ' CREATE TABLE mytable (id INTEGER PRIMARY KEY, name TEXT); — or the "New Table" button',
   ' sqlite3 other.db   — switches to (or creates) another database',
   ' You are always inside the database shown in the dropdown — never type a path to it in SQL.'].forEach(t => line(`<span class="result">${escapeHtml(t)}</span>`));
}

/* ========= database management ========= */
const dbSel = document.getElementById('dblist');
async function refreshDbs(announce) {
  try {
    const r = await fetch('/api/db/list');
    const j = await r.json();
    dbSel.innerHTML = '';
    j.dbs.forEach(name => {
      const o = document.createElement('option');
      o.value = name; o.textContent = name.replace(/\.sqlite$/, '') + '.sqlite';
      if (name === j.active) o.selected = true;
      dbSel.appendChild(o);
    });
    dbSel.dataset.active = j.active;
    if (announce) line(`<span class="result">✔ using database: ${escapeHtml(j.active)}.sqlite</span>`, 'result');
  } catch {}
}
dbSel.addEventListener('change', async () => {
  await fetch('/api/db/use', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: dbSel.value }) });
  term.querySelectorAll('.line').forEach(d => d.remove());
  pendingSql = ''; curLine = ''; sqlInput.value = '';
  banner();
  await refreshDbs(true);
  await sql('.tables', true);
  renderCurrent();
  localStorage.setItem('oc_db', dbSel.value);
});
document.getElementById('dbnew').addEventListener('click', async () => {
  const name = prompt('New database name (letters, digits, _ only):', 'mydb');
  if (!name) return;
  const r = await fetch('/api/db/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  const j = await r.json();
  if (!j.ok) { alert(j.err || 'Could not create database'); return; }
  await fetch('/api/db/use', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: j.name.replace(/\.sqlite$/, '') }) });
  localStorage.setItem('oc_db', j.name.replace(/\.sqlite$/, ''));
  await refreshDbs();
  term.querySelectorAll('.line').forEach(d => d.remove());
  pendingSql = ''; curLine = ''; sqlInput.value = '';
  banner();
  line(`<span class="result">✔ database created and selected: ${escapeHtml(j.name.replace(/\.sqlite$/, ''))}.sqlite</span>`, 'result');
  line(`<span class="result">Next: click “New Table” or type CREATE TABLE …;</span>`, 'result');
  line('&nbsp;'); renderCurrent();
});
document.getElementById('tablenew').addEventListener('click', async () => {
  const tname = (prompt('Table name:', 'mytable') || '').trim();
  if (!tname) return;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tname)) { alert('Invalid table name.'); return; }
  const cols = (prompt('Columns, SQL style:\ne.g. id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, age INT', 'id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT') || '').trim();
  if (!cols) return;
  const stmt = `CREATE TABLE IF NOT EXISTS ${tname} (${cols});`;
  line(`<span class="cmd-echo"><span class="ps1">sql&gt;</span> -- from “New Table” toolbar</span>`, 'cmd-echo');
  line(`<span class="cmd-echo">${escapeHtml(stmt)}</span>`, 'cmd-echo');
  await sql(stmt);
  line('&nbsp;');
  await sql('.tables', true);
  renderCurrent();
});
document.getElementById('sqlreset').onclick = async () => {
  await fetch('/api/sql/reset', { method: 'POST' });
  term.querySelectorAll('.line').forEach(d => d.remove());
  pendingSql = ''; curLine = '';
  banner(); line(`<span class="result">✔ sample database reset</span>`, 'result'); line('&nbsp;');
  await sql('SELECT * FROM students;', true);
  renderCurrent();
};
document.getElementById('sqlclear').onclick = () => {
  term.querySelectorAll('.line').forEach(d => d.remove()); pendingSql = ''; banner(); renderCurrent();
};
term.addEventListener('pointerdown', focusTerm);
term.addEventListener('click', focusTerm);
