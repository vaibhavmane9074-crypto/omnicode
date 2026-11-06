/* OmniCode — free, offline, no API key. Runs languages locally + SQLite terminal. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const RUN_DIR = '/tmp/opencode/omnicode-run';
const DB_DIR = path.join(__dirname, 'data');
const { spawnSync } = require('child_process');
let ACTIVE_DB = 'playground';
const DEFAULT_DB = 'playground';
for (const d of [RUN_DIR, DB_DIR]) fs.mkdirSync(d, { recursive: true });
function dbPath(name) {
  const safe = String(name || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40).replace(/^\.+|\.+$/, '');
  if (!safe) return null;
  return { name: safe, path: path.join(DB_DIR, safe + '.sqlite') };
}
function seedIfMissing(file, sqlText) {
  if (!fs.existsSync(file)) spawnSync('sqlite3', [file], { input: sqlText, timeout: 10000 });
}
const DB_FILE = () => path.join(DB_DIR, ACTIVE_DB + '.sqlite');
// migrate legacy "playground.db" file to the standard ".sqlite" layout
{
  const legacy = path.join(DB_DIR, 'playground.db');
  if (fs.existsSync(legacy) && !fs.existsSync(DB_FILE())) {
    try { fs.renameSync(legacy, DB_FILE()); } catch {}
  }
}

const LANGS = {
  python:     { name: 'Python 3',        ext: 'py',  cmd: ['python3'],                                     type: 'interp' },
  javascript: { name: 'JavaScript',      ext: 'js',  cmd: ['node'],                                        type: 'interp' },
  typescript: { name: 'TypeScript',      ext: 'ts',  cmd: ['node', '--experimental-strip-types'],          type: 'interp' },
  c:          { name: 'C (gcc)',         ext: 'c',   cmd: [], compiler: 'gcc', cflags: ['-O2', '-Wall'],    type: 'compile' },
  cpp:        { name: 'C++ (g++)',       ext: 'cpp', cmd: [], compiler: 'g++', cflags: ['-O2', '-Wall'],    type: 'compile' },
  bash:       { name: 'Bash',            ext: 'sh',  cmd: ['bash'],                                        type: 'interp' },
  perl:       { name: 'Perl',            ext: 'pl',  cmd: ['perl'],                                        type: 'interp' },
  awk:        { name: 'AWK',             ext: 'awk', cmd: ['awk', '-f'],                                   type: 'interp' },
};

function runProc(cmd, { input = '', timeout = 12000, cwd } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd[0], cmd.slice(1), { cwd, env: { ...process.env, FORCE_COLOR: '0' } });
    let out = '', err = '', done = false;
    const finish = (code) => { if (!done) { done = true; clearTimeout(timer); resolve({ code, out, err }); } };
    const timer = setTimeout(() => { if (!done) { err += '\n⏱ Timed out after ' + timeout / 1000 + 's'; try { p.kill('SIGKILL'); } catch {} finish(-9); } }, timeout);
    // stream errors must never escape the promise (EPIPE, kill races, etc.)
    const swallow = () => {};
    p.on('error', e => { err += String(e); finish(-1); });
    if (p.stdout)  { p.stdout.setMaxListeners(0);  p.stdout.on('error', swallow);  p.stdout.on('data', d => { out += d; if (out.length > 512000) { out = out.slice(0, 512000) + '\n...output truncated'; try { p.kill('SIGKILL'); } catch {} } }); }
    if (p.stderr)  { p.stderr.setMaxListeners(0);  p.stderr.on('error', swallow);  p.stderr.on('data', d => err += d); }
    if (p.stdin)   { p.stdin.on('error', swallow); p.stdin.end(input || undefined); }
    p.on('close', code => finish(code === null ? 1 : code));
    // guarantee resolution even if 'close' is missed
    setTimeout(() => finish(-9), timeout + 5000);
  });
}

function json(res, code, obj) {
  if (!res || res.headersSent || res.destroyed) return;
  try {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  } catch { /* client already gone — nothing to do */ }
}

function json(res, code, obj) {
  if (!res || res.headersSent || res.destroyed) return;
  try {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  } catch { /* client already gone — nothing to do */ }
}

function handleRun(body, res) {
  const lang = LANGS[body.language];
  if (!lang) { json(res, 400, { code: -1, stdout: '', stderr: 'unknown language: ' + body.language }); return; }
  const id = crypto.randomBytes(6).toString('hex');
  const dir = path.join(RUN_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  (async () => {
    try {
      let code = 0, out = '', err = '';
      if (lang.type === 'compile') {
        fs.writeFileSync(path.join(dir, 'main.' + lang.ext), body.code || '');
        const comp = await runProc([lang.compiler, ...lang.cflags, 'main.' + lang.ext, '-o', 'main'], { cwd: dir, timeout: 20000 });
        if (comp.code !== 0) {
          json(res, 200, { code: comp.code, stdout: '', stderr: comp.err || 'compile failed' });
          return;
        }
        const r = await runProc([path.join(dir, 'main')], { cwd: dir, input: body.stdin || '', timeout: 12000 });
        code = r.code; out = r.out; err = r.err;
      } else {
        const file = path.join(dir, 'main.' + lang.ext);
        fs.writeFileSync(file, body.code || '');
        const r = await runProc([...lang.cmd, file], { cwd: dir, input: body.stdin || '', timeout: 12000 });
        code = r.code; out = r.out; err = r.err;
      }
      json(res, 200, { code, stdout: out, stderr: err });
    } catch (e) {
      json(res, 200, { code: -1, stdout: '', stderr: 'Server error while running: ' + (e && e.stack || e) });
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  })();
}

const SAMPLE_SQL = `
CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY, name TEXT, age INT, city TEXT);
CREATE TABLE IF NOT EXISTS courses  (id INTEGER PRIMARY KEY, title TEXT, credits INT);
CREATE TABLE IF NOT EXISTS enrollments (student_id INT, course_id INT, grade TEXT);

INSERT OR IGNORE INTO students VALUES
 (1,'Aarav',   20,'Delhi'),
 (2,'Mia',     22,'Chicago'),
 (3,'Kenji',   21,'Tokyo'),
 (4,'Lucia',   23,'Madrid'),
 (5,'Noah',    20,'Berlin'),
 (6,'Priya',   22,'Delhi');

INSERT OR IGNORE INTO courses VALUES
 (101,'Databases',   4),
 (102,'Algorithms',  3),
 (103,'Web Design',  2);

INSERT OR IGNORE INTO enrollments VALUES
 (1,101,'A'), (1,102,'B'), (2,101,'B'), (3,103,'A'),
 (4,102,'C'), (5,101,'B'), (6,103,'A'), (6,102,'B');
`;

// seed the default database synchronously so tables exist from the very first query
seedIfMissing(DB_FILE(), SAMPLE_SQL);
if (fs.statSync(DB_FILE()).size === 0) spawnSync('sqlite3', [DB_FILE()], { input: SAMPLE_SQL, timeout: 10000 });

function handleSql(body, res) {
  runProc(['sqlite3', '-header', '-column', DB_FILE()],
    { input: (body.sql || '') + '\n', timeout: 10000 }).then(r => json(res, 200, { ...r, db: ACTIVE_DB }));
}

function handleSeed(res) {
  try { fs.rmSync(DB_FILE(), { force: true }); } catch {}
  seedIfMissing(DB_FILE(), SAMPLE_SQL);
  if (fs.existsSync(DB_FILE()) && fs.statSync(DB_FILE()).size === 0) runProc(['sqlite3', DB_FILE()], { input: SAMPLE_SQL });
  json(res, 200, { ok: true });
}

function handleDbList(res) {
  const seen = new Set();
  const dbs = fs.readdirSync(DB_DIR).filter(f => f.endsWith('.sqlite'))
    .map(f => f.replace(/\.sqlite$/, ''))
    .filter(n => !seen.has(n) && seen.add(n));
  if (!dbs.includes(DEFAULT_DB)) dbs.unshift(DEFAULT_DB);
  json(res, 200, { dbs, active: ACTIVE_DB });
}

function handleDbCreate(body, res) {
  const p = dbPath(body && body.name);
  if (!p) { json(res, 200, { ok: false, err: 'Invalid database name (A–Z, 0–9, _ and - only).' }); return; }
  const existed = fs.existsSync(p.path);
  if (!existed) spawnSync('sqlite3', [p.path], { input: 'SELECT 1;', timeout: 10000 });
  json(res, 200, { ok: true, name: p.name, created: !existed });
}


const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  req.on('error', () => {});
  res.on('error', () => {});
  if (req.method === 'POST') {
    let body = '', killed = null;
    req.on('data', c => { body += c; if (body.length > 2e6) { killed = true; req.destroy(); } });
    req.on('end', () => {
      try {
        const j = body ? JSON.parse(body) : {};
        if (req.url === '/api/run') handleRun(j, res);
        else if (req.url === '/api/sql') handleSql(j, res);
        else if (req.url === '/api/sql/reset') handleSeed(res);
        else if (req.url === '/api/db/list') handleDbList(res);
        else if (req.url === '/api/db/create') handleDbCreate(j, res);
        else if (req.url === '/api/db/use') {
          const p = dbPath(j && j.name);
          if (!p || !fs.existsSync(p.path)) { json(res, 200, { ok: false, err: 'No such database: ' + (j && j.name) }); return; }
          ACTIVE_DB = p.name;
          json(res, 200, { ok: true, active: ACTIVE_DB });
        }
        else json(res, 404, { code: -1, stdout: '', stderr: 'unknown endpoint ' + req.url });
      } catch (e) {
        json(res, 200, { code: -1, stdout: '', stderr: 'Malformed request JSON: ' + e.message });
      }
    });
    req.on('aborted', () => console.log('[client aborted request]'));
    req.on('close', () => { if (killed) json(res, 200, { code: -1, stdout: '', stderr: 'Request too large (max 2 MB).' }); });
    return;
  }
  if (!fs.existsSync(DB_FILE())) {
    spawnSync('sqlite3', [DB_FILE()], { input: SAMPLE_SQL, timeout: 10000 });
  }
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';
  const file = path.join(__dirname, 'public', path.normalize(url).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
server.on('error', e => console.error('[server error]', e.message));
server.listen(PORT, () => console.log('OmniCode running → http://localhost:' + PORT));
