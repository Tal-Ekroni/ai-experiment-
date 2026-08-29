/** Kupa — one process, node:http, server-rendered, RTL-first. */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { openDb, getSetting, setSetting, CATEGORIES, OTHER } from '../lib/db.ts';
import { fmt } from '../lib/money.ts';
import { h, raw, escape, render, page, type Html } from './html.ts';
import { heroBlock, monthBars, catRows, statusChips, categoryChips } from './views.ts';
import { retrospect, monthOverMonth } from '../lib/retrospect.ts';
import { reviewQueue, explainability, categorizeAll, makeLlmCategorizer } from '../lib/categorize.ts';
import { reconciliationCoverage, classifyAll } from '../lib/ledger.ts';
import { importBuffer } from '../lib/ingest.ts';
import { hasPasscode, setPasscode, checkPasscode, makeSession, checkSession } from './auth.ts';
import { runSelfCheck } from '../jobs/selfcheck.ts';

const DB_PATH = process.env.KUPA_DB ?? './data/kupa.db';
const PORT = Number(process.env.PORT ?? 3000);
const db = openDb(DB_PATH);
const css = readFileSync(new URL('../../public/kupa.css', import.meta.url), 'utf8');

type Ctx = { req: IncomingMessage; res: ServerResponse; url: URL; body: URLSearchParams | null };
const send = (res: ServerResponse, status: number, body: string, type = 'text/html; charset=utf-8', extra: Record<string, string> = {}) => {
  res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff', ...extra });
  res.end(body);
};
const redirect = (res: ServerResponse, to: string, extra: Record<string, string> = {}) => {
  res.writeHead(303, { location: to, ...extra }); res.end();
};

async function readBody(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 8_000_000) throw new Error('body too large'); chunks.push(c); }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

// ---------- screens ----------

function loginScreen(err = false): string {
  return page('כניסה', '', h`<div class="card" style="max-width:380px;margin-inline:auto">
    <h1>קופה</h1><p class="sub">הזינו את קוד הבית</p>
    ${err ? h`<p style="color:var(--crit)">קוד שגוי</p>` : ''}
    <form method="post" action="/login"><input type="password" name="passcode" autofocus required>
    <button class="primary">כניסה</button></form></div>`, { nav: false });
}

function setupScreen(): string {
  return page('התקנה', '', h`<div class="card">
    <h1>ברוכים הבאים לקופה</h1>
    <p>שלב 1 מתוך 3: קובץ אחד מהבנק — בלי סיסמאות, בלי דומיין, בלי בוט.</p>
    <p class="sub">ייצאו קובץ תנועות (CSV או "אקסל") מאתר הבנק או חברת האשראי וגררו אותו לכאן.
    התוצאה: השנה האחרונה שלכם, בעוד כרבע שעה.</p>
    <form id="up"><input type="text" name="account_name" placeholder="שם החשבון (למשל: עו״ש לאומי)" required>
      <select name="kind"><option value="bank">בנק</option><option value="card">כרטיס אשראי</option></select>
      <input type="file" id="file" required>
      <button class="primary">העלאה</button></form>
    <p class="sub" id="msg"></p></div>
  <script>
  document.getElementById('up').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = document.getElementById('file').files[0];
    if (!f) return;
    document.getElementById('msg').textContent = 'מעלה…';
    // Read base64 via FileReader — spreading a large byte array into fromCharCode overflows the stack.
    const b64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',', 2)[1]);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(f);
    });
    const fd = new FormData(ev.target);
    const resp = await fetch('/setup/upload', { method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({ name: f.name, account_name: fd.get('account_name'), kind: fd.get('kind'), data: b64 }) });
    const j = await resp.json();
    if (j.next) location.href = j.next;
    else document.getElementById('msg').textContent = j.error || 'שגיאה';
  });
  </script>`, { nav: false });
}

function confirmScreen(): string {
  const top = db.prepare(`SELECT id, display, default_category, volume, tx_count FROM merchants
    WHERE confirmed = 0 ORDER BY volume DESC LIMIT 20`).all() as any[];
  if (top.length === 0) return page('אישור', '', h`<div class="card"><p>אין ספקים לאישור.</p>
    <a href="/passcode">המשך ←</a></div>`, { nav: false });
  const preCategorized = top.filter(m => m.default_category !== OTHER).length;
  return page('אישור ספקים', '', h`<div class="card">
    <h1>סיווג — לא חובה</h1>
    ${preCategorized > 0
      ? h`<p class="sub">הבנק כבר סיווג את רוב העסקאות, והקטגוריות מסומנות למטה. אפשר לתקן מה שלא מדויק, או פשוט <a href="/passcode"><b>להמשיך ←</b></a></p>`
      : h`<p class="sub">אלה הספקים הגדולים שלכם. סיווג מהיר כאן מסווג מאות תנועות בבת אחת — או <a href="/passcode">לדלג ←</a></p>`}
    ${raw(top.map(m => h`<form method="post" action="/setup/confirm" class="merchant-row">
      <input type="hidden" name="merchant_id" value="${m.id}">
      <span style="min-inline-size:180px"><span class="desc">${m.display}</span><br>
      <span class="sub">${m.tx_count} תנועות · ${fmt(m.volume)}</span></span>
      ${raw(categoryChips('category', m.default_category))}
    </form>`).join(''))}
    <p><a href="/passcode">סיימתי — המשך ←</a></p></div>`, { nav: false });
}

function passcodeScreen(): string {
  return page('קוד בית', '', h`<div class="card" style="max-width:420px;margin-inline:auto">
    <h1>קבעו קוד בית</h1>
    <p class="sub">קוד משותף אחד לשניכם. הרשת הביתית אינה גדר — יש בה טלוויזיה חכמה ומדפסת.</p>
    <form method="post" action="/passcode"><input type="password" name="passcode" minlength="6" required>
    <button class="primary">שמירה והמשך</button></form></div>`, { nav: false });
}

function dashboard(): string {
  const mom = monthOverMonth(db);
  const retro = retrospect(db);
  if (!retro) return page('ראשי', '/', h`<div class="empty"><h1>אין נתונים עדיין</h1>
    <p><a href="/setup">התחילו בהתקנה ←</a></p></div>`);
  const month = new Date().toISOString().slice(0, 7);
  const ex = explainability(db, mom?.curMonth ?? month);
  const cov = reconciliationCoverage(db, mom?.curMonth ?? month);
  const exTotal = ex.explainedPct + ex.attributedPct;
  const catOk = exTotal >= 95;
  const chips = statusChips([
    { cls: catOk ? 'good' : 'warn',
      label: catOk ? `${exTotal}% מההוצאות מסווגות` : `${100 - exTotal}% עדיין לא מסווג` },
    { cls: cov.spendSharePct >= 80 ? 'good' : 'warn',
      label: cov.spendSharePct >= 80 ? 'הנתונים תואמים ליתרות' : `${cov.reconcilableAccounts}/${cov.totalAccounts} חשבונות מאומתים` },
  ]);
  const thisMonth = new Date().toISOString().slice(0, 7);
  let hero: Html, follow: Html | string = '';
  if (mom) {
    hero = heroBlock(mom.delta, mom.delta > 0 ? 'יותר מהחודש הקודם' : 'פחות מהחודש הקודם',
      `${mom.prevMonth} ← ${mom.curMonth} · חודש מול חודש, לא מגמה`);
    const movers = mom.deltas.filter(d => Math.abs(d.delta) >= 100).slice(0, 3);
    follow = h`<div class="card"><h2>השינויים הגדולים</h2>
      ${movers.map(d => h`<div class="cat"><span class="name">${d.category}</span>
        <span class="track"><span class="fill" style="inline-size:${Math.min(100, Math.round(Math.abs(d.delta) / Math.abs(movers[0].delta) * 100))}%;background:${d.delta > 0 ? 'var(--over)' : 'var(--under)'}"></span></span>
        <span class="val ${d.delta > 0 ? 'delta-pos' : 'delta-neg'}">${fmt(d.delta, { sign: true })}</span></div>`)}</div>`;
  } else {
    hero = h`<div class="hero"><div class="amount">${escape(fmt(retro.net, { sign: true }))}</div>
      <div class="label">נשאר לכם השנה</div><div class="sub">עדיין אין חודשיים מלאים להשוואה</div></div>`;
  }
  return page('ראשי', '/', h`<div class="card hero-card">${hero}<div class="pill-row">${chips}</div></div>${follow}
    <div class="card"><div class="card-head"><h2>12 חודשים</h2><span class="sub">הוצאה חודשית</span></div>
      ${monthBars(retro.months.map(r => ({ m: r.m, expense: r.expense })), thisMonth)}</div>`);
}

function retrospectScreen(): string {
  const r = retrospect(db);
  if (!r) return page('השנה', '/retrospect', h`<div class="empty">אין נתונים עדיין</div>`);
  return page('השנה האחרונה שלכם', '/retrospect', h`
    <div class="card"><h1>השנה האחרונה שלכם</h1>
    <div class="grid3">
      <div class="stat"><div class="k">נכנס</div><div class="v">${fmt(r.totalIn)}</div></div>
      <div class="stat"><div class="k">יצא</div><div class="v">${fmt(r.totalOut)}</div></div>
      <div class="stat accent"><div class="k">נשאר</div><div class="v" style="color:${r.net >= 0 ? 'var(--under)' : 'var(--over)'}">${fmt(r.net, { sign: true })}</div></div>
    </div>
    ${monthBars(r.months.map(m => ({ m: m.m, expense: m.expense })), new Date().toISOString().slice(0,7))}</div>
    <div class="card"><h2>לאן הלך הכסף</h2>${raw(catRows(r.mix))}</div>
    <div class="grid2">
      ${r.largest ? h`<div class="card"><h2>ההוצאה הגדולה של השנה</h2>
        <div class="big">${raw(escape(fmt(-r.largest.amount)))}</div>
        <p><span class="desc">${r.largest.raw_descriptor}</span><br><span class="sub">${r.largest.booking_date}</span></p></div>` : ''}
      ${r.topMerchant ? h`<div class="card"><h2>הספק שביקרתם בו הכי הרבה</h2>
        <p><span class="desc">${r.topMerchant.display}</span></p>
        <p class="sub">${r.topMerchant.tx_count} ביקורים · ${fmt(r.topMerchant.volume)} בסך הכל</p></div>` : ''}
    </div>`);
}

function reviewScreen(): string {
  const q = reviewQueue(db);
  if (q.links.length === 0 && q.cats.length === 0)
    return page('סקירה', '/review', h`<div class="empty"><h1>הכל מסודר ✓</h1><p class="sub">אין שאלות השבוע.</p></div>`);
  return page('סקירה שבועית', '/review', h`
    ${q.links.length ? h`<div class="card"><h2>שאלות קישור</h2>
      ${raw(q.links.map(l => {
        const ids = JSON.parse(l.tx_ids) as number[];
        const txs = ids.map(id => db.prepare('SELECT id, booking_date, amount, raw_descriptor FROM transactions WHERE id=?').get(id) as any).filter(Boolean);
        return h`<form method="post" action="/review/link" class="merchant-row">
          <input type="hidden" name="question_id" value="${l.id}">
          <span>${l.kind === 'transfer' ? 'העברה פנימית או הוצאה?' : 'התאמת חיוב'}</span>
          ${raw(txs.map(t => h`<label><input type="radio" name="internal_tx" value="${t.id}">
            <span class="desc">${t.raw_descriptor}</span> <span class="num">${fmt(t.amount)}</span> ${t.booking_date}</label>`).join('<br>'))}
          <button class="primary" name="action" value="internal">זו העברה פנימית</button>
          <button name="action" value="spend">הכל הוצאות</button></form>`;
      }).join(''))}</div>` : ''}
    ${q.cats.length ? h`<div class="card"><h2>ספקים לא ודאיים · ${q.cats.length} מתוך 12</h2>
      ${raw(q.cats.map(t => h`<form method="post" action="/review/categorize" class="merchant-row">
        <input type="hidden" name="tx_id" value="${t.id}"><input type="hidden" name="merchant_id" value="${t.merchant_id ?? ''}">
        <span style="min-inline-size:170px"><span class="desc">${t.raw_descriptor}</span><br>
        <span class="sub">${t.booking_date} · <span class="num">${fmt(t.amount)}</span></span></span>
        ${raw(categoryChips('category', t.category))}</form>`).join(''))}</div>` : ''}`);
}

function transactionsScreen(qstr: string | null): string {
  const where = qstr ? `AND (raw_descriptor LIKE ? OR category LIKE ?)` : '';
  const args = qstr ? [`%${qstr}%`, `%${qstr}%`] : [];
  const txs = db.prepare(`SELECT t.id, t.booking_date, t.amount, t.raw_descriptor, t.category, t.flow_class, t.status
    FROM transactions t WHERE t.status != 'superseded' ${where}
    ORDER BY t.booking_date DESC LIMIT 200`).all(...args) as any[];
  return page('תנועות', '/transactions', h`<div class="card">
    <form method="get"><input name="q" value="${qstr ?? ''}" placeholder="חיפוש"><button>חפש</button></form>
    <table><thead><tr><th>תאריך</th><th>תיאור</th><th>קטגוריה</th><th class="num">סכום</th></tr></thead><tbody>
    ${raw(txs.map(t => h`<tr><td>${t.booking_date}</td>
      <td><span class="desc">${t.raw_descriptor}</span>${t.flow_class === 'internal' ? h` <span class="sub">(פנימי)</span>` : ''}</td>
      <td>${t.category ?? ''}</td><td class="num">${fmt(t.amount)}</td></tr>`).join(''))}
    </tbody></table></div>`);
}

function healthScreen(): string {
  const checks = runSelfCheck(db, DB_PATH);
  const jobs = db.prepare(`SELECT job, MAX(started_at) AS last, ok FROM job_runs GROUP BY job ORDER BY job`).all() as any[];
  return page('תקינות', '/health', h`<div class="card"><h1>בדיקה עצמית</h1>
    ${raw(checks.map(c => h`<div class="cat"><span class="dot ${c.ok ? 'good' : 'crit'}" style="inline-size:10px;block-size:10px;border-radius:50%"></span>
      <span class="name">${c.name}</span><span class="sub">${c.detail}</span></div>`).join(''))}</div>
    <div class="card"><h2>ריצות אחרונות</h2>${jobs.length === 0 ? h`<p class="sub">אין עדיין</p>` :
    raw(jobs.map(j => h`<div class="cat"><span class="name">${j.job}</span><span class="sub">${j.last}</span></div>`).join(''))}</div>`);
}

function settingsScreen(): string {
  const tls = getSetting(db, 'tls_enabled') === '1';
  return page('הגדרות', '/settings', h`<div class="card"><h1>הגדרות</h1>
    ${tls ? '' : h`<p><span class="chip"><span class="dot warn"></span>שלב 4 טרם הושלם — קוד הבית עובר ברשת לא מוצפן. סיכון מוצהר וזמני.</span></p>`}
    <h2>קטגוריות</h2><p class="sub">${CATEGORIES.join(' · ')}</p>
    <h2>ייבוא נוסף</h2><p><a href="/setup">העלאת קובץ נוסף ←</a></p></div>`);
}

// ---------- routing ----------

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    if (path === '/kupa.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (path.startsWith('/fonts/') && !path.includes('..')) {
      try {
        const file = new URL('../../public' + path, import.meta.url);
        const body = readFileSync(file);
        const type = path.endsWith('.woff2') ? 'font/woff2' : 'text/css; charset=utf-8';
        res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=31536000, immutable' });
        return res.end(body);
      } catch { return send(res, 404, 'not found', 'text/plain'); }
    }

    const setupDone = hasPasscode(db);
    const authed = setupDone && checkSession(db, req.headers.cookie);

    // Setup flow (no auth until a passcode exists)
    if (!setupDone) {
      if (path === '/setup/upload' && req.method === 'POST') {
        const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
        const j = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const buf = Buffer.from(String(j.data ?? ''), 'base64');
        const isCard = j.kind === 'card';
        const bank = db.prepare(`SELECT id FROM accounts WHERE kind='bank' ORDER BY id LIMIT 1`).get() as { id: number } | undefined;
        const acct = db.prepare(`INSERT INTO accounts(name, institution, kind, settles_from) VALUES(?,?,?,?)`)
          .run(String(j.account_name ?? 'חשבון'), 'import', isCard ? 'card' : 'bank', isCard && bank ? bank.id : null);
        const r = importBuffer(db, Number(acct.lastInsertRowid), String(j.name ?? 'upload'), buf);
        if ('needsMapping' in r && r.needsMapping) return send(res, 200, JSON.stringify({ error: 'לא זוהה מבנה הקובץ — נסו קובץ אחר' }), 'application/json');
        const llm = await makeLlmCategorizer().catch(() => null);
        await categorizeAll(db, llm);
        // If the bank already categorized most of the spend, skip the manual confirm step.
        const top = db.prepare(`SELECT default_category, volume FROM merchants ORDER BY volume DESC LIMIT 20`).all() as { default_category: string; volume: number }[];
        const vol = top.reduce((s, m) => s + m.volume, 0) || 1;
        const knownVol = top.filter(m => m.default_category !== OTHER).reduce((s, m) => s + m.volume, 0);
        const next = knownVol / vol >= 0.7 ? '/passcode' : '/setup/confirm';
        return send(res, 200, JSON.stringify({ next, rows: r.rows }), 'application/json');
      }
      if (path === '/setup/confirm' && req.method === 'POST') {
        const body = await readBody(req);
        db.prepare(`UPDATE merchants SET default_category = ?, confirmed = 1 WHERE id = ?`)
          .run(body.get('category'), Number(body.get('merchant_id')));
        db.prepare(`UPDATE transactions SET category = ? WHERE merchant_id = ? AND category_confirmed = 0`)
          .run(body.get('category'), Number(body.get('merchant_id')));
        return redirect(res, '/setup/confirm');
      }
      if (path === '/setup/confirm') return send(res, 200, confirmScreen());
      if (path === '/passcode' && req.method === 'POST') {
        const body = await readBody(req);
        const pc = body.get('passcode') ?? '';
        if (pc.length >= 6) { setPasscode(db, pc); return redirect(res, '/retrospect', { 'set-cookie': `kupa=${makeSession(db)}; HttpOnly; SameSite=Strict; Path=/` }); }
        return send(res, 200, passcodeScreen());
      }
      if (path === '/passcode') return send(res, 200, passcodeScreen());
      return send(res, 200, setupScreen());
    }

    // Login
    if (path === '/login' && req.method === 'POST') {
      const body = await readBody(req);
      if (checkPasscode(db, body.get('passcode') ?? ''))
        return redirect(res, '/', { 'set-cookie': `kupa=${makeSession(db)}; HttpOnly; SameSite=Strict; Path=/` });
      return send(res, 401, loginScreen(true));
    }
    if (!authed) return send(res, 401, loginScreen());

    // Authed routes
    if (path === '/' ) return send(res, 200, dashboard());
    if (path === '/retrospect') return send(res, 200, retrospectScreen());
    if (path === '/review') return send(res, 200, reviewScreen());
    if (path === '/review/categorize' && req.method === 'POST') {
      const body = await readBody(req);
      const cat = body.get('category');
      if (cat && (CATEGORIES as readonly string[]).includes(cat)) {
        db.prepare(`UPDATE transactions SET category = ?, category_confirmed = 1 WHERE id = ?`).run(cat, Number(body.get('tx_id')));
        const mid = body.get('merchant_id');
        if (mid) db.prepare(`UPDATE merchants SET default_category = ?, confirmed = 1 WHERE id = ?`).run(cat, Number(mid));
      }
      return redirect(res, '/review');
    }
    if (path === '/review/link' && req.method === 'POST') {
      const body = await readBody(req);
      const qid = Number(body.get('question_id'));
      const q = db.prepare(`SELECT * FROM link_questions WHERE id = ?`).get(qid) as any;
      if (q) {
        if (body.get('action') === 'internal') {
          const chosen = Number(body.get('internal_tx'));
          const ids = JSON.parse(q.tx_ids) as number[];
          if (chosen && ids.includes(chosen)) {
            // the chosen tx and its opposite-side partner become internal
            const t = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(chosen) as any;
            const partner = ids.map(id => db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id) as any)
              .find(p => p && p.id !== chosen && p.amount === -t.amount);
            db.prepare(`UPDATE transactions SET flow_class='internal', link_id=? WHERE id=?`).run(`link:${qid}`, chosen);
            if (partner) db.prepare(`UPDATE transactions SET flow_class='internal', link_id=? WHERE id=?`).run(`link:${qid}`, partner.id);
          }
        }
        db.prepare(`UPDATE link_questions SET resolved = 1 WHERE id = ?`).run(qid);
      }
      return redirect(res, '/review');
    }
    if (path === '/transactions') return send(res, 200, transactionsScreen(url.searchParams.get('q')));
    if (path === '/health') return send(res, 200, healthScreen());
    if (path === '/settings') return send(res, 200, settingsScreen());
    if (path === '/setup') return send(res, 200, setupScreen());
    if (path === '/setup/upload' && req.method === 'POST') {
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
      const j = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const buf = Buffer.from(String(j.data ?? ''), 'base64');
      const isCard2 = j.kind === 'card';
      const bank2 = db.prepare(`SELECT id FROM accounts WHERE kind='bank' ORDER BY id LIMIT 1`).get() as { id: number } | undefined;
      const acct = db.prepare(`INSERT INTO accounts(name, institution, kind, settles_from) VALUES(?,?,?,?)`)
        .run(String(j.account_name ?? 'חשבון'), 'import', isCard2 ? 'card' : 'bank', isCard2 && bank2 ? bank2.id : null);
      const r = importBuffer(db, Number(acct.lastInsertRowid), String(j.name ?? 'upload'), buf);
      const llm = await makeLlmCategorizer().catch(() => null);
      await categorizeAll(db, llm);
      return send(res, 200, JSON.stringify({ next: '/', rows: r.rows }), 'application/json');
    }
    return send(res, 404, page('404', '', h`<div class="empty">אין כאן כלום</div>`));
  } catch (err) {
    console.error(err);
    return send(res, 500, page('שגיאה', '', h`<div class="empty">משהו השתבש</div>`));
  }
});

// In-process schedulers (stage-3 architecture: one process, jobs observable in job_runs)
import { startBot } from '../jobs/answerer.ts';
import { buildWeeklyDigest, buildMonthlyClose } from '../jobs/digest.ts';
function logRun(job: string, ok: boolean, detail = '') {
  db.prepare(`INSERT INTO job_runs(job, started_at, finished_at, ok, detail)
    VALUES(?, datetime('now'), datetime('now'), ?, ?)`).run(job, ok ? 1 : 0, detail);
}
setInterval(() => {                       // nightly-equivalent tick: self-check + digest evaluation
  try {
    const checks = runSelfCheck(db, DB_PATH);
    logRun('selfcheck', checks.every(c => c.ok), checks.filter(c => !c.ok).map(c => c.name).join(','));
    const w = buildWeeklyDigest(db);
    if (w) logRun('digest-weekly', true, w.slice(0, 200));
  } catch (e) { logRun('scheduler', false, String(e)); }
}, 6 * 60 * 60 * 1000).unref();
startBot(db).catch(err => logRun('bot', false, String(err)));

server.listen(PORT, () => console.log(`kupa listening on :${PORT} db=${DB_PATH}`));
