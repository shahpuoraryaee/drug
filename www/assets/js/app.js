/* Arya Pharma Manager — core runtime
   api() · router · keyboard shortcuts · modal / confirm / toast ·
   global search overlay · dependency-free SVG chart.
   Works with zero vendor libraries; uses SweetAlert2 / Chart.js if present. */
'use strict';

/* ================= API ================= */
async function api(action, data = {}) {
  let r;
  try {
    r = await fetch('api.php?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    throw new Error(t('err_net'));
  }
  if (r.status === 401) { location.href = 'login.php'; throw new Error('Signed out'); }
  const j = await r.json().catch(() => ({ ok: false, error: 'Bad response' }));
  if (!j.ok) throw new Error(j.error || 'Request failed');
  return j.data;
}

/* Multipart upload to api.php (v1.2). fields: plain values; files: {field: File} */
async function apiUpload(action, fields = {}, files = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
  Object.entries(files).forEach(([k, f]) => fd.append(k, f));
  const res = await fetch('api.php?action=' + action, { method: 'POST', body: fd });
  if (res.status === 401) { location.href = 'login.php'; throw new Error('Signed out'); }
  const j = await res.json().catch(() => ({ ok: false, error: 'Bad server response' }));
  if (!j.ok) throw new Error(j.error || 'Upload failed');
  return j.data;
}

/* ================= tiny DOM helpers ================= */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

/* Inline SVG icon set (no icon-font dependency) */
const ICONS = {
  dash:'<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  pill:'<rect x="3" y="8.5" width="18" height="7" rx="3.5"/><path d="M12 8.5v7"/>',
  box:'<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>',
  cart:'<circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 4h2l2.4 11h10.2L20 7H6"/>',
  wallet:'<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M16 12.5h5M3 10h18"/>',
  coins:'<circle cx="9" cy="9" r="5.5"/><path d="M14 6.5a5.5 5.5 0 1 1-4 9.4"/>',
  chart:'<path d="M4 20V6M4 20h16M8 16v-5M12 16V8M16 16v-3"/>',
  truck:'<path d="M2 6h11v10H2zM13 10h4l3 3v3h-7z"/><circle cx="6.5" cy="17.5" r="1.6"/><circle cx="16.5" cy="17.5" r="1.6"/>',
  tags:'<path d="M3 11l8-8h6a2 2 0 0 1 2 2v6l-8 8a2 2 0 0 1-2.8 0L3 13.8A2 2 0 0 1 3 11z"/><circle cx="15" cy="7" r="1.4"/>',
  users:'<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.4 3.4 0 0 1 0 6.4M21.5 20a6.5 6.5 0 0 0-4.5-6.2"/>',
  shield:'<path d="M12 3l8 3v6c0 4.5-3.4 7.7-8 9-4.6-1.3-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.8-3.8"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  edit:'<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14 6l3 3"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>',
  download:'<path d="M12 4v11M7 11l5 5 5-5M4 20h16"/>',
  upload:'<path d="M12 20V9M7 13l5-5 5 5M4 4h16"/>',
  print:'<path d="M7 8V3h10v5M7 17h10v4H7zM4 8h16a1.5 1.5 0 0 1 1.5 1.5V16H2.5V9.5A1.5 1.5 0 0 1 4 8z"/>',
  money:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/>',
  ledger:'<path d="M5 3h13a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 18 21H5zM5 3v18M9 8h7M9 12h7M9 16h4"/>',
  eye:'<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8"/>',
  moon:'<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  logout:'<path d="M15 4h4a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20h-4M10 8l-4 4 4 4M6 12h10"/>',
  warn:'<path d="M12 3l10 17.5H2z"/><path d="M12 10v4.5M12 17.8v.2"/>',
  cap:'<path d="M7 14.5l-3.5-3.5 8-8L15 6.5zM15 6.5l3.5 3.5-8 8L7 14.5z"/>',
};
function ic(name, size = 16) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

/* ================= app state ================= */
const APP = {
  user: window.APP_USER || {},
  settings: window.APP_SETTINGS || {},
  screen: 'dash',
  can(module, act) {
    const role = APP.user.role;
    if (role === 'owner') return true;
    const M = APP.user.perms || {};
    return !!(M[module] && M[module].includes(act));
  },
};
const CUR = () => APP.settings.currency_symbol || '؋';

/* ================= toasts ================= */
function toast(msg, kind = 'ok') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'err' ? ' err' : kind === 'warn' ? ' warn' : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

/* ================= modal ================= */
let modalStack = [];
function openModal({ title, body, footer, wide = false, onOpen }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">
      <header><h2>${esc(title)}</h2>
        <button class="x" data-close aria-label="Close">${ic('x', 18)}</button></header>
      <div class="body">${body}</div>
      <footer>
        <span class="hintline"><span><span class="kbd">Esc</span> ${t('hint_close')}</span>
        <span><span class="kbd">Ctrl</span><span class="kbd">S</span> ${t('hint_save')}</span></span>
        ${footer ?? ''}
      </footer>
    </div>`;
  back.addEventListener('mousedown', e => { if (e.target === back) closeModal(back); });
  back.querySelector('[data-close]').addEventListener('click', () => closeModal(back));
  document.body.appendChild(back);
  modalStack.push(back);
  const f = back.querySelector('input,select,textarea');
  if (f) setTimeout(() => f.focus(), 40);
  if (onOpen) onOpen(back);
  return back;
}
function closeModal(back) {
  const m = back || modalStack[modalStack.length - 1];
  if (!m) return;
  modalStack = modalStack.filter(x => x !== m);
  m.remove();
}

async function confirmBox(title, sub) {
  if (window.Swal) {
    const r = await Swal.fire({ title, text: sub || '', icon: 'warning',
      showCancelButton: true, confirmButtonText: t('b_delete'), cancelButtonText: t('b_cancel'),
      confirmButtonColor: '#B23A22' });
    return r.isConfirmed;
  }
  return new Promise(res => {
    const back = openModal({
      title,
      body: `<p class="mut">${esc(sub || '')}</p>`,
      footer: `<button class="btn btn-ghost" data-no>${t('b_cancel')}</button>
               <button class="btn btn-danger" data-yes>${t('b_delete')}</button>`,
    });
    back.querySelector('[data-no]').onclick  = () => { closeModal(back); res(false); };
    back.querySelector('[data-yes]').onclick = () => { closeModal(back); res(true); };
  });
}

/* ================= router ================= */
const SCREENS = {}; // registered by screens.js: {name: {render(el), onKey?}}
function canOpen(name) {
  // Cashiers (sales-only) never see the business dashboard — sales is their whole world.
  if (name === 'dash') return APP.user.role !== 'cashier';
  return APP.can(name, 'view');
}
function go(name) {
  if (!SCREENS[name]) return;
  if (!canOpen(name)) name = APP.user.role === 'cashier' ? 'sales' : 'dash';
  if (!SCREENS[name] || !canOpen(name)) return;
  APP.screen = name;
  $$('.navitem[data-screen]').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
  $$('.fkey[data-screen]').forEach(b => b.classList.toggle('on', b.dataset.screen === name));
  const main = $('#main');
  main.innerHTML = '<div class="spin" role="status" aria-label="Loading"></div>';
  main.scrollTop = 0;
  Promise.resolve(SCREENS[name].render(main)).catch(e => {
    main.innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`;
  });
}

/* ================= keyboard ================= */
const FKEYS = { F1:'dash', F2:'products', F3:'inventory', F4:'purchases', F5:'expenses',
                F6:'income', F7:'reports', F8:'suppliers', F9:'categories', F10:'backup',
                F11:'settings', F12:'sales' };
document.addEventListener('keydown', (e) => {
  // Ctrl+K → search
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return; }
  // Ctrl+S inside modal → click its primary button
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && modalStack.length) {
    e.preventDefault();
    const btn = modalStack[modalStack.length - 1].querySelector('footer .btn-brand');
    if (btn) btn.click();
    return;
  }
  if (e.key === 'Escape') {
    if ($('#overlay').style.display === 'flex') { closeSearch(); return; }
    if (modalStack.length) { closeModal(); return; }
  }
  if (FKEYS[e.key] !== undefined && !e.ctrlKey && !e.altKey) {
    // SALES MODULE (v1.1): the active screen may claim specific F-keys
    // (e.g. POS uses F2 = focus search, F3 = phone scan) — spec §17.
    const cur = SCREENS[APP.screen];
    if (cur && cur.claimKeys && cur.claimKeys.includes(e.key)
        && !modalStack.length && $('#overlay').style.display !== 'flex') {
      e.preventDefault(); cur.onKey(e); return;
    }
    e.preventDefault();
    go(FKEYS[e.key]);
    return;
  }
  // screen-level hooks (table row navigation etc.)
  const sc = SCREENS[APP.screen];
  if (sc && sc.onKey && !modalStack.length && $('#overlay').style.display !== 'flex') sc.onKey(e);
});

/* ================= global search overlay ================= */
let searchSel = 0, searchTimer = null, searchScope = 'all';
function openSearch() {
  $('#overlay').style.display = 'flex';
  const inp = $('#paletteInput');
  inp.value = '';
  $('#results').innerHTML = `<div class="empty small">${t('searchph')}</div>`;
  inp.focus();
}
function closeSearch() { $('#overlay').style.display = 'none'; }

function bindSearch() {
  const inp = $('#paletteInput');
  inp.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 160);
  });
  inp.addEventListener('keydown', (e) => {
    const rows = $$('#results .result[data-nav]');
    if (e.key === 'ArrowDown') { e.preventDefault(); searchSel = Math.min(searchSel + 1, rows.length - 1); paintSel(rows); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); searchSel = Math.max(searchSel - 1, 0); paintSel(rows); }
    if (e.key === 'Enter' && rows[searchSel]) rows[searchSel].click();
  });
  $$('#overlay .scope button').forEach(b => b.addEventListener('click', () => {
    searchScope = b.dataset.scope;
    $$('#overlay .scope button').forEach(x => x.classList.toggle('on', x === b));
    runSearch();
  }));
  $('#overlay').addEventListener('mousedown', e => { if (e.target === $('#overlay')) closeSearch(); });
}
function paintSel(rows) { rows.forEach((r, i) => r.classList.toggle('sel', i === searchSel)); }

async function runSearch() {
  const q = $('#paletteInput').value.trim();
  const box = $('#results');
  if (q.length < 1) { box.innerHTML = `<div class="empty small">${t('searchph')}</div>`; return; }
  let d;
  try { d = await api('search.global', { q, scope: searchScope }); }
  catch (e) { box.innerHTML = `<div class="empty small">${esc(e.message)}</div>`; return; }
  searchSel = 0;
  const parts = [];
  (d.products || []).forEach(p => parts.push(`
    <div class="result" data-nav data-go="products" data-id="${p.id}">
      <span class="ico">${ic('pill')}</span>
      <div><b>${esc(p.medicine_name)}</b>
        <span>${esc(p.generic_name || '')} · ${esc(p.product_code)} · ${esc(p.category_name || '')}</span></div>
      <span class="mono small">${fmt.money(p.selling_price)} ${CUR()} · ${fmt.num(p.quantity)}</span>
    </div>`));
  (d.suppliers || []).forEach(s => parts.push(`
    <div class="result" data-nav data-go="suppliers" data-id="${s.id}">
      <span class="ico">${ic('truck')}</span>
      <div><b>${esc(s.name)}</b><span>${esc(s.contact_person || '')} · ${esc(s.phone || '')}</span></div>
      <span class="mono small">${fmt.money(s.balance)} ${CUR()}</span>
    </div>`));
  (d.batches || []).forEach(b => parts.push(`
    <div class="result" data-nav data-go="inventory" data-id="${b.product_id}">
      <span class="ico">${ic('box')}</span>
      <div><b>${esc(b.batch_number)}</b><span>${esc(b.medicine_name)} · ${esc(b.product_code)}</span></div>
      <span class="exp-pill" style="background:${heatColor(b.expiry_date)}">${fmt.date(b.expiry_date)}</span>
    </div>`));
  box.innerHTML = parts.length ? parts.join('')
    : `<div class="empty small"><b>${t('nothing')}</b></div>`;
  const rows = $$('#results .result[data-nav]');
  paintSel(rows);
  rows.forEach(r => r.addEventListener('click', () => {
    closeSearch();
    const target = r.dataset.go;
    if (SCREENS[target] && SCREENS[target].openItem) { go(target); SCREENS[target].openItem(+r.dataset.id); }
    else go(target);
  }));
}

/* ================= expiry heat helpers ================= */
function daysTo(dateStr) {
  if (!dateStr) return null;
  return Math.floor((new Date(dateStr) - new Date().setHours(0, 0, 0, 0)) / 864e5);
}
function heatColor(dateStr) {
  const d = daysTo(dateStr);
  if (d === null) return 'var(--line-strong)';
  if (d < 0)    return 'var(--heat-x)';
  if (d <= 15)  return 'var(--heat-15)';
  if (d <= 30)  return 'var(--heat-30)';
  if (d <= 60)  return 'var(--heat-60)';
  if (d <= 90)  return 'var(--heat-90)';
  return 'var(--heat-180)';
}
function expPill(dateStr) {
  const d = daysTo(dateStr);
  if (d === null) return '<span class="mut">—</span>';
  const label = d < 0 ? `${fmt.num(d)} d` : `${fmt.num(d)} d`;
  return `<span class="exp-pill" style="background:${heatColor(dateStr)}" title="${fmt.date(dateStr)}">${label}</span>`;
}

/* ================= chart (Chart.js if present, else pure SVG) ================= */
function drawFlowChart(el, days) {
  // days: [{d:'2026-07-01', income: 12000, expense: 3000}, …]
  if (window.Chart) {
    el.innerHTML = '<canvas height="130"></canvas>';
    const css = getComputedStyle(document.documentElement);
    new Chart(el.firstChild, {
      type: 'bar',
      data: {
        labels: days.map(x => x.d.slice(5)),
        datasets: [
          { label: 'Income',  data: days.map(x => +x.income),  backgroundColor: css.getPropertyValue('--brand').trim() },
          { label: 'Expense', data: days.map(x => +x.expense), backgroundColor: css.getPropertyValue('--heat-60').trim() },
        ],
      },
      options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } } } },
    });
    return;
  }
  // SVG fallback — grouped bars
  const W = 640, H = 150, pad = 6, gw = W / days.length;
  const max = Math.max(1, ...days.map(x => Math.max(+x.income, +x.expense)));
  const bars = days.map((x, i) => {
    const ih = (+x.income  / max) * (H - 26);
    const eh = (+x.expense / max) * (H - 26);
    const x0 = i * gw + pad;
    const bw = (gw - pad * 2) / 2 - 1;
    return `
      <rect x="${x0}" y="${H - 18 - ih}" width="${bw}" height="${ih}" rx="2" fill="var(--brand)">
        <title>${x.d} income ${fmt.money(x.income)}</title></rect>
      <rect x="${x0 + bw + 2}" y="${H - 18 - eh}" width="${bw}" height="${eh}" rx="2" fill="var(--heat-60)">
        <title>${x.d} expense ${fmt.money(x.expense)}</title></rect>
      ${i % 2 === 0 ? `<text x="${x0 + bw}" y="${H - 4}" font-size="9" fill="var(--muted)"
        text-anchor="middle" font-family="var(--font-data)">${x.d.slice(5)}</text>` : ''}`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
    <line x1="0" y1="${H - 18}" x2="${W}" y2="${H - 18}" stroke="var(--line-strong)"/>${bars}</svg>`;
}

/* ================= pagination helper ================= */
function pagerHtml(p) {
  const pages = Math.max(1, Math.ceil(p.total / p.per));
  const from = p.total ? (p.page - 1) * p.per + 1 : 0;
  const to = Math.min(p.total, p.page * p.per);
  let btns = '';
  const around = [1, p.page - 1, p.page, p.page + 1, pages].filter((v, i, a) =>
    v >= 1 && v <= pages && a.indexOf(v) === i).sort((a, b) => a - b);
  let last = 0;
  for (const n of around) {
    if (n - last > 1) btns += '<span class="mut">…</span>';
    btns += `<button data-page="${n}" class="${n === p.page ? 'cur' : ''}">${fmt.num(n)}</button>`;
    last = n;
  }
  return `<div class="pager">
    <span>${t('showing')} ${fmt.num(from)}–${fmt.num(to)} ${t('of')} ${fmt.num(p.total)}</span>
    <div class="btns">
      <button data-page="${p.page - 1}" ${p.page <= 1 ? 'disabled' : ''}>‹</button>
      ${btns}
      <button data-page="${p.page + 1}" ${p.page >= pages ? 'disabled' : ''}>›</button>
    </div></div>`;
}
function bindPager(root, cb) {
  $$('.pager button[data-page]', root).forEach(b =>
    b.addEventListener('click', () => cb(+b.dataset.page)));
}

/* ================= table row keyboard nav ================= */
function tableNav(e, root, onOpen, onEdit) {
  const rows = $$('table.grid tbody tr', root);
  if (!rows.length) return;
  let i = rows.findIndex(r => r.classList.contains('sel'));
  if (e.key === 'ArrowDown') { e.preventDefault(); i = Math.min(i + 1, rows.length - 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); i = Math.max(i - 1, 0); }
  else if (e.key === 'Enter' && i >= 0 && onOpen) { e.preventDefault(); onOpen(rows[i]); return; }
  else if (e.key.toLowerCase() === 'e' && i >= 0 && onEdit && !e.ctrlKey) { onEdit(rows[i]); return; }
  else return;
  rows.forEach((r, k) => r.classList.toggle('sel', k === i));
  if (rows[i]) rows[i].scrollIntoView({ block: 'nearest' });
}

/* ================= boot ================= */
document.addEventListener('DOMContentLoaded', () => {
  applyLang(LANG);
  $('#langSel').value = LANG;
  $('#langSel').addEventListener('change', e => { applyLang(e.target.value); go(APP.screen); });

  const themeBtn = $('#themeBtn');
  const applyTheme = (dark) => {
    document.documentElement.classList.toggle('dark', dark);
    themeBtn.innerHTML = dark ? ic('sun') : ic('moon');
    localStorage.setItem('apm_theme', dark ? 'dark' : 'light');
  };
  applyTheme(localStorage.getItem('apm_theme') === 'dark');
  themeBtn.addEventListener('click', () =>
    applyTheme(!document.documentElement.classList.contains('dark')));

  $$('[data-screen]').forEach(b => b.addEventListener('click', () => go(b.dataset.screen)));
  $('#searchTrigger').addEventListener('focus', () => { $('#searchTrigger').blur(); openSearch(); });
  $('#searchTrigger').addEventListener('click', openSearch);
  bindSearch();

  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('auth.logout'); } catch {}
    location.href = 'login.php';
  });

  // status clock
  const clock = $('#stClock');
  setInterval(() => { clock.textContent = new Date().toTimeString().slice(0, 5); }, 10_000);
  clock.textContent = new Date().toTimeString().slice(0, 5);

  // Cashiers are sales-only: send them straight into New Sale instead of
  // the business dashboard, which they have no other use for.
  go(APP.user.role === 'cashier' ? 'sales' : 'dash');
});
