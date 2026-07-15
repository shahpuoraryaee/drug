/* Arya Pharma Manager — SALES MODULE (v1.1) front-end.
   Registers SCREENS.sales in the existing router. Two sub-views:
   the POS itself and the sales history list. All server calls go
   through the shared api() wrapper (api.php?action=sales.*). */
'use strict';

/* Parse a discount entry: "12" = fixed amount, "5%" = percent of base (§8). */
function parseDisc(raw, base) {
  raw = String(raw ?? '').trim();
  if (!raw) return 0;
  if (raw.endsWith('%')) {
    const pct = Math.max(0, Math.min(100, parseFloat(raw) || 0));
    return Math.round(base * pct) / 100;
  }
  return Math.max(0, parseFloat(raw) || 0);
}

SCREENS.sales = {
  claimKeys: ['F2', 'F3', 'F4'],          // POS spec §17: F2 search · F3 phone scan
  view: 'pos',                      // 'pos' | 'list'
  cart: [],                         // {product_id, name, code, unit, base_price, unit_price, quantity, discount, batch_id, batch_label, stock}
  heldId: 0,
  scan: { timer: null, token: null },

  /* ================= render ================= */
  async render(el) {
    this.el = el;
    if (!APP.can('sales', 'add')) this.view = 'list';
    el.innerHTML = `
      ${screenHead('h_sales', 'sub_sales', `
        <button class="btn btn-ghost" id="posHistory">${ic('ledger')} ${t('a_all').replace('→ ', '')}</button>
        ${APP.can('sales','return') ? `<button class="btn btn-ghost" id="posReturn">${ic('upload')} ${t('b_return')}</button>` : ''}
        ${APP.can('sales','add') ? `<button class="btn btn-brand" id="posNew">${ic('plus')} ${t('b_newsale')} <span class="keycap-inverse">Ctrl N</span></button>` : ''}`)}
      <div id="posBody"></div>`;
    $('#posHistory', el).addEventListener('click', () => { this.view = this.view === 'list' ? 'pos' : 'list'; this.paintView(); });
    const rt = $('#posReturn', el); if (rt) rt.addEventListener('click', () => this.returnFlow());
    const nw = $('#posNew', el); if (nw) nw.addEventListener('click', () => this.newSale());
    this.paintView();
  },

  paintView() {
    if (this.view === 'pos' && APP.can('sales', 'add')) this.paintPos();
    else { this.view = 'list'; this.paintList(); }
  },

  /* ================= POS view ================= */
  paintPos() {
    const box = $('#posBody', this.el);
    box.innerHTML = `
      <div class="pos">
        <div class="pos-cart">
          <div class="filterbar">
            <div class="autocomplete grow" style="max-width:none">
              <input type="search" id="posQ" placeholder="${t('searchph')}  ·  F2" autocomplete="off">
              <div class="acl" hidden></div>
            </div>
            <button class="btn btn-ghost" id="posScan">${ic('cap')} ${t('b_scanphone')} <span class="kbd">F3</span></button>
            <button class="btn btn-ghost" id="posHeld">${ic('box')} ${t('b_held')}</button>
          </div>
          <div class="tablewrap"><table class="grid"><thead><tr>
            <th style="min-width:180px">${t('t_medicine')}</th><th>${t('t_batch')}</th><th>${t('t_expiry')}</th>
            <th class="num" style="min-width:106px">${t('t_qty')}</th><th class="num">${t('t_price')}</th>
            <th class="num" title="12 or 5%">${t('t_disc')}</th><th class="num">${t('t_line')}</th><th style="width:30px"></th>
          </tr></thead><tbody id="posRows">
            <tr><td colspan="7"><div class="empty">${t('cart_empty')}</div></td></tr>
          </tbody></table></div>
        </div>

        <div class="card-a cardpad pos-sum">
          <div class="row"><span class="mut">${t('walkin')}</span>
            <span class="mono small">${esc(APP.user.name)}</span></div>
          <div class="row"><span>${t('t_items')}</span><b class="money" id="sumItems">0</b></div>
          <div class="row"><span>Subtotal</span><b class="money" id="sumSub">0</b></div>
          <div class="row"><span>${t('invdisc')} <span class="mut small">(12 or 5%)</span></span>
            <input type="text" inputmode="decimal" value="" placeholder="0" id="sumDisc"></div>
          <div class="row total"><span>${t('total')}</span><b id="sumTotal">0</b></div>
          <div id="payLines"></div>
          <button class="btn btn-ghost btn-sm mt" id="payAdd">${ic('plus')} ${t('pm_mixed')}</button>
          <div class="row change"><span>${t('t_change')}</span><b class="money pos" id="sumChange">0</b></div>
          <div class="pos-actions">
            <button class="btn btn-brand" id="posComplete">${t('b_complete')} <span class="keycap-inverse">Ctrl S</span></button>
            <button class="btn btn-ghost" id="posHold">${ic('box')} ${t('b_hold')}</button>
            <button class="btn btn-ghost" id="posCancel">${t('b_cancel')} <span class="kbd">Esc</span></button>
          </div>
        </div>
      </div>`;

    /* search + autocomplete + barcode-wedge Enter */
    const q = $('#posQ', box);
    productAutocomplete(q, box.querySelector('.acl'), p => { this.addProduct(p); q.value = ''; q.focus(); });
    q.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const code = q.value.trim();
      if (!code) return;
      // USB/Bluetooth scanners type the code and send Enter — try exact barcode first
      try {
        const p = await api('sales.barcode', { code });
        this.addProduct(p); q.value = '';
      } catch { /* not a barcode — leave autocomplete to handle it */ }
    });

    $('#posScan', box).addEventListener('click', () => this.phoneScan());
    $('#posHeld', box).addEventListener('click', () => this.heldList());
    $('#sumDisc', box).addEventListener('input', () => this.recalc());
    $('#payAdd', box).addEventListener('click', () => this.addPayLine());
    $('#posComplete', box).addEventListener('click', () => this.complete(false));
    $('#posHold', box).addEventListener('click', () => this.complete(true));
    $('#posCancel', box).addEventListener('click', () => this.newSale(true));

    this.addPayLine('cash');
    this.paintCart();
    q.focus();
  },

  addPayLine(method = 'cash') {
    const wrap = $('#payLines', this.el);
    const div = document.createElement('div');
    div.className = 'payline';
    div.innerHTML = `
      <select class="payM">
        ${['cash','card','bank','mobile'].map(m => `<option value="${m}" ${m === method ? 'selected' : ''}>${t('pm_' + m)}</option>`).join('')}
      </select>
      <input type="number" min="0" step="0.01" class="payA" value="0">
      ${wrap.children.length ? `<button class="btn btn-ghost btn-sm payX">${ic('x', 13)}</button>` : ''}`;
    wrap.appendChild(div);
    $('.payA', div).addEventListener('input', () => this.recalc());
    const x = $('.payX', div);
    if (x) x.addEventListener('click', () => { div.remove(); this.recalc(); });
    if (wrap.children.length === 1) $('.payA', div).select?.();
  },

  async addProduct(p) {
    if (p.status && p.status !== 'active') { toast(`'${p.medicine_name}' is not active.`, 'warn'); return; }
    const found = this.cart.find(c => c.product_id === +p.id && !c.batch_id);
    if (found) { found.quantity += 1; this.paintCart(); return; }
    const line = {
      product_id: +p.id, name: p.medicine_name, code: p.product_code, unit: p.unit || '',
      base_price: +p.selling_price, unit_price: +p.selling_price,
      quantity: 1, discount: 0, discRaw: '', batch_id: 0, batch_label: 'FEFO',
      stock: +p.quantity, expiry: null,
    };
    this.cart.push(line);
    this.paintCart();
    // lazily fetch sellable batches: shows the FEFO expiry and true sellable stock (§3/§5)
    api('sales.batches', { product_id: line.product_id }).then(bs => {
      if (!this.cart.includes(line)) return;
      line.expiry = bs.length ? bs[0].expiry_date : null;
      line.stock = bs.reduce((a, b) => a + +b.quantity, 0);
      this.paintCart();
    }).catch(() => {});
  },

  paintCart() {
    const tbody = $('#posRows', this.el);
    if (!tbody) return;
    const canOverride = APP.can('sales', 'override');
    tbody.innerHTML = this.cart.length ? this.cart.map((c, i) => `
      <tr data-i="${i}">
        <td><b>${esc(c.name)}</b><div class="mut small mono">${esc(c.code)} · ${fmt.num(c.stock)} ${esc(c.unit)}</div></td>
        <td><button class="btn btn-ghost btn-sm cBatch" ${canOverride ? '' : 'disabled'}>${esc(c.batch_label)}</button></td>
        <td class="small">${c.expiry ? `${expPill(c.expiry)} <span class="mut">${fmt.date(c.expiry)}</span>` : '<span class="mut">—</span>'}</td>
        <td class="num" style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm cMinus" tabindex="-1">−</button><input type="number" min="1" class="cQty" value="${c.quantity}" style="width:52px"><button class="btn btn-ghost btn-sm cPlus" tabindex="-1">+</button></td>
        <td class="num"><input type="number" min="0" step="0.01" class="cPrice" value="${c.unit_price}" ${canOverride ? '' : 'readonly'}></td>
        <td class="num"><input type="text" inputmode="decimal" class="cDisc" value="${c.discRaw || (c.discount || '')}" placeholder="0"></td>
        <td class="num money"><b>${fmt.money(c.quantity * c.unit_price - c.discount)}</b></td>
        <td><button class="btn btn-ghost btn-sm cDel" tabindex="-1">${ic('x', 13)}</button></td>
      </tr>`).join('')
      : `<tr><td colspan="7"><div class="empty">${t('cart_empty')}</div></td></tr>`;

    $$('#posRows tr[data-i]', this.el).forEach(tr => {
      const i = +tr.dataset.i, c = this.cart[i];
      $('.cQty', tr).addEventListener('input', e => { c.quantity = Math.max(1, +e.target.value || 1); this.recalc(); });
      $('.cMinus', tr).addEventListener('click', () => {
        if (c.quantity <= 1) return; c.quantity--; $('.cQty', tr).value = c.quantity; this.recalc();
      });
      $('.cPlus', tr).addEventListener('click', () => { c.quantity++; $('.cQty', tr).value = c.quantity; this.recalc(); });
      $('.cPrice', tr).addEventListener('input', e => { c.unit_price = Math.max(0, +e.target.value || 0); this.recalc(); });
      $('.cDisc', tr).addEventListener('input', e => {
        c.discRaw = e.target.value;
        c.discount = parseDisc(c.discRaw, c.quantity * c.unit_price);
        this.recalc();
      });
      $('.cDel', tr).addEventListener('click', () => { this.cart.splice(i, 1); this.paintCart(); });
      $('.cBatch', tr).addEventListener('click', () => this.pickBatch(i));
    });
    this.recalc();
  },

  recalc() {
    // repaint line totals in place (no full re-render, keeps focus in inputs)
    $$('#posRows tr[data-i]', this.el).forEach(tr => {
      const c = this.cart[+tr.dataset.i];
      if (c.discRaw && String(c.discRaw).trim().endsWith('%')) {
        c.discount = parseDisc(c.discRaw, c.quantity * c.unit_price); // % follows the line
      }
      tr.children[6].innerHTML = `<b>${fmt.money(c.quantity * c.unit_price - c.discount)}</b>`;
    });
    const sub = this.cart.reduce((a, c) => a + c.quantity * c.unit_price - c.discount, 0);
    const disc = parseDisc($('#sumDisc', this.el)?.value, sub);
    const total = Math.max(0, sub - disc);
    const paid = $$('.payA', this.el).reduce((a, f) => a + (+f.value || 0), 0);
    $('#sumItems', this.el).textContent = fmt.num(this.cart.reduce((a, c) => a + c.quantity, 0));
    $('#sumSub', this.el).textContent = fmt.money(sub);
    $('#sumTotal', this.el).textContent = fmt.money(total) + ' ' + CUR();
    $('#sumChange', this.el).textContent = fmt.money(Math.max(0, paid - total));
    // convenience: single cash line auto-fills to the total until the cashier edits it
    const pays = $$('.payA', this.el);
    if (pays.length === 1 && document.activeElement !== pays[0]) pays[0].value = total.toFixed(2);
  },

  async pickBatch(i) {
    const c = this.cart[i];
    const batches = await api('sales.batches', { product_id: c.product_id });
    const back = openModal({
      title: `${t('t_batch')} — ${c.name}`,
      body: `<div class="tablewrap" style="box-shadow:none"><table class="grid"><thead>
        <tr><th></th><th>${t('t_batch')}</th><th>${t('t_expiry')}</th><th class="num">${t('t_qty')}</th></tr></thead><tbody>
        <tr data-b="0"><td><input type="radio" name="pb" ${!c.batch_id ? 'checked' : ''}></td>
          <td><b>FEFO</b> <span class="mut small">(auto — first expiry first)</span></td><td></td><td></td></tr>
        ${batches.map(b => `<tr data-b="${b.id}" data-l="${esc(b.batch_number)}">
          <td><input type="radio" name="pb" ${+c.batch_id === +b.id ? 'checked' : ''}></td>
          <td class="mono">${esc(b.batch_number)}</td>
          <td>${expPill(b.expiry_date)} <span class="mut small">${fmt.date(b.expiry_date)}</span></td>
          <td class="num">${fmt.num(b.quantity)}</td></tr>`).join('')}
      </tbody></table></div>`,
      footer: `<button class="btn btn-brand" id="pbOk">${t('b_save')}</button>`,
    });
    $$('tbody tr', back).forEach(tr => tr.addEventListener('click', () => { $('input', tr).checked = true; }));
    $('#pbOk', back).addEventListener('click', () => {
      const sel = $$('tbody tr', back).find(tr => $('input', tr).checked);
      c.batch_id = +sel.dataset.b || 0;
      c.batch_label = c.batch_id ? sel.dataset.l : 'FEFO';
      const chosen = c.batch_id ? batches.find(b => +b.id === c.batch_id) : batches[0];
      c.expiry = chosen ? chosen.expiry_date : c.expiry;
      closeModal(back); this.paintCart();
    });
  },

  newSale(confirmFirst = false) {
    if (confirmFirst && this.cart.length && !confirm(t('confirm_del'))) return;
    this.cart = []; this.heldId = 0; this.view = 'pos'; this.paintView();
    audit && 0; // (server audits; client just resets)
  },

  /* ================= complete / hold ================= */
  async complete(hold) {
    if (!this.cart.length) { toast(t('cart_empty'), 'warn'); return; }
    const payments = $$('.payline', this.el).map(div => ({
      method: $('.payM', div).value, amount: +$('.payA', div).value || 0,
    })).filter(p => p.amount > 0);
    const payload = {
      items: this.cart.map(c => ({
        product_id: c.product_id, quantity: c.quantity,
        unit_price: c.unit_price, discount: c.discount,
        batch_id: c.batch_id || 0,
      })),
      discount: parseDisc($('#sumDisc', this.el)?.value,
        this.cart.reduce((a, c) => a + c.quantity * c.unit_price - c.discount, 0)),
      payments, hold: hold ? 1 : 0, held_id: this.heldId,
    };
    const btn = $('#posComplete', this.el); btn.disabled = true;
    try {
      const r = await api('sales.save', payload);
      if (hold) { toast(`${t('b_hold')} ✓`); this.newSale(); }
      else {
        toast(`${r.invoice_number} — ${t('t_change')}: ${fmt.money(r.change)} ${CUR()}`);
        this.lastSaleId = r.id; // Ctrl+P reprints this one
        this.newSale();
        this.printReceipt(r.id); // print right after completion
      }
    } catch (e) { toast(e.message, 'err'); }
    btn.disabled = false;
  },

  /* Optional QR data-URL via the qrcodejs vendor lib (returns '' without it). */
  qrDataUrl(text) {
    if (!window.QRCode) return '';
    try {
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(div);
      new QRCode(div, { text, width: 96, height: 96 });
      const cv = div.querySelector('canvas');
      const url = cv ? cv.toDataURL('image/png') : (div.querySelector('img')?.src || '');
      div.remove();
      return url;
    } catch { return ''; }
  },

  /* ================= receipt ================= */
  async printReceipt(saleId) {
    let d;
    try { d = await api('sales.receipt', { id: saleId }); } catch (e) { toast(e.message, 'err'); return; }
    const s = d.sale, S = APP.settings;
    // group FEFO slices back into product lines for the customer
    const lines = {};
    d.items.forEach(it => {
      const k = it.product_id + '@' + it.unit_price;
      lines[k] ??= { name: it.medicine_name, qty: 0, price: +it.unit_price, disc: 0, total: 0 };
      lines[k].qty += +it.quantity; lines[k].disc += +it.discount; lines[k].total += +it.line_total;
    });
    const w = window.open('', '_blank', 'width=380,height=640');
    if (!w) { toast('Pop-up blocked — allow pop-ups to print receipts.', 'warn'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.invoice_number)}</title>
      <style>
        @page{ size:80mm auto; margin:4mm; }
        body{ font:12px/1.4 "Courier New",monospace; color:#000; width:72mm; margin:0 auto; }
        h1{ font-size:15px; text-align:center; margin:2px 0; }
        .c{ text-align:center; } .r{ text-align:right; }
        table{ width:100%; border-collapse:collapse; }
        td{ padding:1px 0; vertical-align:top; }
        .rule{ border-top:1px dashed #000; margin:5px 0; }
        .tot td{ font-weight:700; font-size:14px; }
      </style></head><body>
      ${S.logo_path ? `<div class="c"><img src="${location.origin + location.pathname.replace(/[^/]*$/, '') + S.logo_path}" style="max-height:48px;max-width:60mm"></div>` : ''}
      <h1>${esc(S.pharmacy_name || 'Arya Pharma')}</h1>
      ${S.pharmacy_name_fa ? `<div class="c">${esc(S.pharmacy_name_fa)}</div>` : ''}
      ${S.pharmacy_address ? `<div class="c">${esc(S.pharmacy_address)}</div>` : ''}
      ${S.pharmacy_phone ? `<div class="c">${esc(S.pharmacy_phone)}</div>` : ''}
      <div class="rule"></div>
      <table>
        <tr><td>${esc(s.invoice_number)}</td><td class="r">${esc(String(s.created_at).slice(0, 16))}</td></tr>
        <tr><td>${t('t_cashier')}: ${esc(s.cashier || '')}</td><td class="r">${t('walkin')}</td></tr>
      </table>
      <div class="rule"></div>
      <table>
        ${Object.values(lines).map(l => `
          <tr><td colspan="2">${esc(l.name)}</td></tr>
          <tr><td>&nbsp;&nbsp;${l.qty} × ${fmt.money(l.price)}${l.disc ? ` −${fmt.money(l.disc)}` : ''}</td>
              <td class="r">${fmt.money(l.total)}</td></tr>`).join('')}
      </table>
      <div class="rule"></div>
      <table>
        <tr><td>Subtotal</td><td class="r">${fmt.money(s.subtotal)}</td></tr>
        ${+s.discount ? `<tr><td>${t('invdisc')}</td><td class="r">−${fmt.money(s.discount)}</td></tr>` : ''}
        <tr class="tot"><td>${t('total')}</td><td class="r">${fmt.money(s.grand_total)} ${CUR()}</td></tr>
        <tr><td>${t('paid_short')} (${d.payments.map(p => t('pm_' + p.method)).join('+') || t('pm_cash')})</td>
            <td class="r">${fmt.money(s.paid_amount)}</td></tr>
        <tr><td>${t('t_change')}</td><td class="r">${fmt.money(s.change_amount)}</td></tr>
      </table>
      <div class="rule"></div>
      ${(() => { const q = this.qrDataUrl(s.invoice_number); return q ? `<div class="c"><img src="${q}" style="width:22mm;height:22mm"></div>` : ''; })()}
      <div class="c">${esc(S.receipt_footer || 'Thank you — get well soon!')}</div>
      <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 400); };<\/script>
      </body></html>`);
    w.document.close();
  },

  /* ================= held sales ================= */
  async heldList() {
    const rows = await api('sales.held');
    const back = openModal({
      title: t('b_held'),
      body: rows.length ? `<div class="tablewrap" style="box-shadow:none"><table class="grid"><thead>
        <tr><th>#</th><th>${t('t_date')}</th><th class="num">${t('t_items')}</th>
        <th class="num">${t('t_total')}</th><th class="actions"></th></tr></thead><tbody>
        ${rows.map(h => `<tr data-id="${h.id}">
          <td class="mono">${esc(h.invoice_number)}</td>
          <td class="mono small">${esc(String(h.created_at).slice(5, 16))}</td>
          <td class="num">${fmt.num(h.item_count)}</td>
          <td class="num money">${fmt.money(h.grand_total)}</td>
          <td class="actions"><button class="btn btn-ghost btn-sm hOpen">${t('hint_open')}</button>
            <button class="btn btn-ghost btn-sm hDel">${ic('trash')}</button></td></tr>`).join('')}
        </tbody></table></div>` : `<div class="empty"><b>${t('nothing')}</b></div>`,
      footer: `<button class="btn btn-brand" onclick="closeModal()">${t('b_close')}</button>`,
    });
    $$('tbody tr[data-id]', back).forEach(tr => {
      $('.hOpen', tr).addEventListener('click', async () => {
        const d = await api('sales.get', { id: +tr.dataset.id });
        this.cart = d.items.map(it => ({
          product_id: +it.product_id, name: it.medicine_name, code: it.product_code,
          unit: it.unit || '', base_price: +it.unit_price, unit_price: +it.unit_price,
          quantity: +it.quantity, discount: +it.discount, batch_id: 0, batch_label: 'FEFO',
          stock: 0,
        }));
        this.heldId = +tr.dataset.id;
        closeModal(back); this.view = 'pos'; this.paintView();
      });
      $('.hDel', tr).addEventListener('click', async () => {
        try { await api('sales.deleteHeld', { id: +tr.dataset.id }); tr.remove(); toast(t('deleted')); }
        catch (e) { toast(e.message, 'err'); }
      });
    });
  },

  /* §10: full-page A4 invoice (print → Windows "Save as PDF" gives the PDF copy) */
  async printA4(saleId) {
    let d;
    try { d = await api('sales.receipt', { id: saleId }); } catch (e) { toast(e.message, 'err'); return; }
    const s = d.sale, S = APP.settings;
    const lines = {};
    d.items.forEach(it => {
      const k = it.product_id + '@' + it.unit_price;
      lines[k] ??= { name: it.medicine_name, code: it.product_code, qty: 0, price: +it.unit_price, disc: 0, total: 0 };
      lines[k].qty += +it.quantity; lines[k].disc += +it.discount; lines[k].total += +it.line_total;
    });
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { toast('Pop-up blocked — allow pop-ups to print.', 'warn'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.invoice_number)}</title>
      <style>
        @page{ size:A4; margin:16mm; }
        body{ font:13px/1.5 system-ui,sans-serif; color:#111; }
        header{ display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:10px; }
        h1{ font-size:20px; margin:0 0 2px; } .mut{ color:#555; font-size:12px; }
        table{ width:100%; border-collapse:collapse; margin-top:14px; }
        th{ text-align:left; border-bottom:1.5px solid #111; padding:6px 4px; font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
        td{ border-bottom:1px solid #ddd; padding:6px 4px; } .r{ text-align:right; }
        tfoot td{ border:0; padding:3px 4px; } tfoot tr.g td{ font-weight:700; font-size:15px; border-top:2px solid #111; padding-top:8px; }
      </style></head><body>
      <header>
        <div>
          ${S.logo_path ? `<img src="${location.origin + location.pathname.replace(/[^/]*$/, '') + S.logo_path}" style="max-height:52px"><br>` : ''}
          <h1>${esc(S.pharmacy_name || 'Arya Pharma')}</h1>
          <div class="mut">${esc(S.pharmacy_address || '')} ${S.pharmacy_phone ? '· ' + esc(S.pharmacy_phone) : ''}</div>
        </div>
        <div class="r">
          <h1>${esc(s.invoice_number)}</h1>
          <div class="mut">${esc(String(s.created_at).slice(0, 16))}<br>${t('t_cashier')}: ${esc(s.cashier || '')}<br>${t('walkin')}</div>
        </div>
      </header>
      <table>
        <thead><tr><th>#</th><th>${t('t_medicine')}</th><th class="r">${t('t_qty')}</th>
          <th class="r">${t('t_price')}</th><th class="r">${t('t_disc')}</th><th class="r">${t('total')}</th></tr></thead>
        <tbody>${Object.values(lines).map((l, i) => `<tr>
          <td>${i + 1}</td><td><b>${esc(l.name)}</b> <span class="mut">${esc(l.code)}</span></td>
          <td class="r">${fmt.num(l.qty)}</td><td class="r">${fmt.money(l.price)}</td>
          <td class="r">${l.disc ? fmt.money(l.disc) : '—'}</td><td class="r"><b>${fmt.money(l.total)}</b></td></tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="5" class="r">Subtotal</td><td class="r">${fmt.money(s.subtotal)}</td></tr>
          ${+s.discount ? `<tr><td colspan="5" class="r">${t('invdisc')}</td><td class="r">−${fmt.money(s.discount)}</td></tr>` : ''}
          <tr class="g"><td colspan="5" class="r">${t('total')}</td><td class="r">${fmt.money(s.grand_total)} ${CUR()}</td></tr>
          <tr><td colspan="5" class="r">${t('paid_short')} (${d.payments.map(p => t('pm_' + p.method)).join(' + ') || t('pm_cash')})</td><td class="r">${fmt.money(s.paid_amount)}</td></tr>
          <tr><td colspan="5" class="r">${t('t_change')}</td><td class="r">${fmt.money(s.change_amount)}</td></tr>
        </tfoot>
      </table>
      <p class="mut" style="margin-top:26px">${esc(S.receipt_footer || '')}</p>
      <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 400); };<\/script>
      </body></html>`);
    w.document.close();
  },

  /* §14: 80mm return receipt */
  printReturnReceipt(sale, ret, lines) {
    const S = APP.settings;
    const w = window.open('', '_blank', 'width=380,height=560');
    if (!w) { toast('Pop-up blocked — allow pop-ups to print.', 'warn'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(ret.return_number)}</title>
      <style>@page{ size:80mm auto; margin:4mm; }
        body{ font:12px/1.4 "Courier New",monospace; color:#000; width:72mm; margin:0 auto; }
        h1{ font-size:15px; text-align:center; margin:2px 0; } .c{ text-align:center; } .r{ text-align:right; }
        table{ width:100%; border-collapse:collapse; } td{ padding:1px 0; vertical-align:top; }
        .rule{ border-top:1px dashed #000; margin:5px 0; } .tot td{ font-weight:700; font-size:14px; }
      </style></head><body>
      <h1>${esc(S.pharmacy_name || 'Arya Pharma')}</h1>
      <div class="c"><b>*** ${t('b_return').toUpperCase()} ***</b></div>
      <div class="rule"></div>
      <table>
        <tr><td>${esc(ret.return_number)}</td><td class="r">${new Date().toISOString().slice(0, 16).replace('T', ' ')}</td></tr>
        <tr><td colspan="2">${t('t_invoice')}: ${esc(sale.invoice_number)}</td></tr>
      </table>
      <div class="rule"></div>
      <table>${lines.map(l => `
        <tr><td colspan="2">${esc(l.name)}</td></tr>
        <tr><td>&nbsp;&nbsp;${l.qty} ×</td><td class="r">−${fmt.money(l.refund)}</td></tr>`).join('')}
      </table>
      <div class="rule"></div>
      <table><tr class="tot"><td>Refund</td><td class="r">−${fmt.money(ret.refund_total)} ${CUR()}</td></tr></table>
      <div class="rule"></div>
      <div class="c">${esc(S.receipt_footer || '')}</div>
      <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 400); };<\/script>
      </body></html>`);
    w.document.close();
  },

  /* ================= phone scan ================= */
  async phoneScan() {
    let d;
    try { d = await api('sales.scanStart'); } catch (e) { toast(e.message, 'err'); return; }
    const back = openModal({
      title: t('b_scanphone'),
      body: `<div class="qrbox" id="qrHere"></div>
        <div class="qrurl">${esc(d.url)}</div>
        <p class="mut small center">${t('scan_hint')}</p>
        ${d.note ? `<p class="small center" style="color:var(--warn)">${esc(d.note)}</p>` : ''}
        <p class="mut small center" id="scanStatus">…</p>`,
      footer: `<button class="btn btn-brand" id="scanClose">${t('b_close')}</button>`,
    });
    $('#scanClose', back).addEventListener('click', () => {
      clearInterval(this.scan.timer);
      api('sales.scanStop', { token: d.token }).catch(() => {});
      closeModal(back);
    });
    const qrBox = $('#qrHere', back);
    if (window.QRCode) new QRCode(qrBox, { text: d.url, width: 190, height: 190 });
    else qrBox.innerHTML = `<div class="mut small center">QR library not installed
      (run download-vendors.ps1) — open the address on the phone by hand.</div>`;

    let got = 0;
    const poll = async () => {
      if (!document.body.contains(back)) { clearInterval(this.scan.timer); return; }
      try {
        const r = await api('sales.scanPoll', { token: d.token });
        if (r.expired) { $('#scanStatus', back).textContent = 'Session expired.'; clearInterval(this.scan.timer); return; }
        for (const code of r.barcodes) {
          try { const p = await api('sales.barcode', { code }); this.addProduct(p); got++; }
          catch { toast(`? ${code}`, 'warn'); }
        }
        $('#scanStatus', back).textContent = got ? `✓ ${got}` : 'Waiting for the phone…';
      } catch { /* transient */ }
    };
    clearInterval(this.scan.timer);
    this.scan.timer = setInterval(poll, 1200);
    poll();
  },

  /* ================= history list ================= */
  listState: { page: 1, q: '', status: '', from: '', to: '', cashier_id: 0, payment: '' },
  async paintList() {
    const box = $('#posBody', this.el);
    const s = this.listState;
    if (this.cashiers === undefined) {
      try { this.cashiers = await api('sales.cashiers'); } catch { this.cashiers = []; }
    }
    const d = await api('sales.list', { page: s.page, per: 25, q: s.q, status: s.status,
      from: s.from, to: s.to, cashier_id: s.cashier_id, payment: s.payment });
    box.innerHTML = `
      <div class="filterbar">
        <input type="search" id="slQ" placeholder="${t('t_invoice')}…" value="${esc(s.q)}">
        <input type="date" id="slFrom" value="${s.from}"> <input type="date" id="slTo" value="${s.to}">
        ${this.cashiers.length ? `<select id="slCash"><option value="0">${t('t_cashier')}</option>
          ${this.cashiers.map(u => `<option value="${u.id}" ${+s.cashier_id === +u.id ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select>` : ''}
        <select id="slPm"><option value="">${t('t_method')}</option>
          ${['cash','card','bank','mobile','mixed'].map(m => `<option value="${m}" ${s.payment === m ? 'selected' : ''}>${t('pm_' + m)}</option>`).join('')}
        </select>
        <select id="slSt"><option value="">${t('t_status')}</option>
          ${['completed','held','cancelled'].map(x => `<option value="${x}" ${s.status === x ? 'selected' : ''}>${t(x)}</option>`).join('')}
        </select>
      </div>
      <div class="tablewrap"><table class="grid"><thead><tr>
        <th>${t('t_invoice')}</th><th>${t('t_date')}</th><th>${t('t_cashier')}</th>
        <th class="num">${t('t_items')}</th><th class="num">${t('t_total')}</th>
        <th class="num">${t('t_profit')}</th><th>${t('t_method')}</th><th>${t('t_status')}</th><th class="actions"></th>
      </tr></thead><tbody>
        ${d.rows.map(r => `<tr data-id="${r.id}">
          <td class="mono">${esc(r.invoice_number)}${+r.returned_units ? ` <span class="badge warn">${t('b_return')}</span>` : ''}</td>
          <td class="mono small">${esc(String(r.created_at).slice(0, 16))}</td>
          <td class="small">${esc(r.cashier || '')}</td>
          <td class="num">${fmt.num(r.item_count)}</td>
          <td class="num"><b class="money">${fmt.money(r.grand_total)}</b></td>
          <td class="num money ${+r.gross_profit >= 0 ? 'pos' : 'neg'}">${fmt.money(r.gross_profit)}</td>
          <td><span class="badge mut">${t('pm_' + r.payment_method) || esc(r.payment_method)}</span></td>
          <td><span class="badge ${r.status === 'completed' ? 'ok' : r.status === 'held' ? 'warn' : 'bad'}">${t(r.status)}</span></td>
          <td class="actions">
            <button data-act="view" title="${t('hint_open')}">${ic('eye')}</button>
            ${APP.can('sales','add') ? `<button data-act="dup" title="${t('b_duplicate')}">${ic('copy')}</button>` : ''}
            ${APP.can('sales','print') && r.status === 'completed' ? `<button data-act="print" title="${t('receipt')}">${ic('print')}</button>` : ''}
            ${APP.can('sales','return') && r.status === 'completed' ? `<button data-act="ret" title="${t('b_return')}">${ic('upload')}</button>` : ''}
            ${APP.can('sales','cancel') && r.status === 'completed' ? `<button class="danger" data-act="cancel" title="${t('cancelled')}">${ic('x')}</button>` : ''}
          </td></tr>`).join('') ||
          `<tr><td colspan="9"><div class="empty"><b>${t('nothing')}</b></div></td></tr>`}
      </tbody></table></div>
      <div class="row-flex mt" style="justify-content:flex-end">
        <b class="money">${t('total')}: ${fmt.money(d.sum)} ${CUR()}</b></div>
      ${pagerHtml(d)}`;
    bindPager(box, p => { s.page = p; this.paintList(); });
    let deb;
    $('#slQ', box).addEventListener('input', e => { clearTimeout(deb); deb = setTimeout(() => { s.q = e.target.value.trim(); s.page = 1; this.paintList(); }, 220); });
    $('#slSt', box).addEventListener('change', e => { s.status = e.target.value; s.page = 1; this.paintList(); });
    $('#slFrom', box).addEventListener('change', e => { s.from = e.target.value; s.page = 1; this.paintList(); });
    $('#slTo', box).addEventListener('change', e => { s.to = e.target.value; s.page = 1; this.paintList(); });
    const sc = $('#slCash', box);
    if (sc) sc.addEventListener('change', e => { s.cashier_id = +e.target.value; s.page = 1; this.paintList(); });
    $('#slPm', box).addEventListener('change', e => { s.payment = e.target.value; s.page = 1; this.paintList(); });
    $$('tbody tr[data-id]', box).forEach(tr => {
      tr.addEventListener('dblclick', () => this.viewSale(+tr.dataset.id));
      $$('button[data-act]', tr).forEach(b => b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = +tr.dataset.id;
        if (b.dataset.act === 'view') this.viewSale(id);
        if (b.dataset.act === 'print') this.printReceipt(id);
        if (b.dataset.act === 'dup') this.duplicateSale(id);
        if (b.dataset.act === 'ret') this.returnFlow(id);
        if (b.dataset.act === 'cancel') {
          if (!await confirmBox(t('cancelled') + '?', 'Stock is restored and income reversed. This cannot be undone.')) return;
          try { await api('sales.cancel', { id }); toast(t('saved')); this.paintList(); }
          catch (e2) { toast(e2.message, 'err'); }
        }
      }));
    });
  },

  async viewSale(id) {
    const d = await api('sales.get', { id });
    const s = d.sale;
    openModal({
      title: `${s.invoice_number} — ${t(s.status)}`,
      wide: true,
      body: `
        <div class="row-flex mb small">
          <span class="mut">${esc(String(s.created_at).slice(0, 16))}</span>
          <span class="mut">${t('t_cashier')}: <b>${esc(s.cashier || '')}</b></span>
          <span class="badge mut">${t('pm_' + s.payment_method) || esc(s.payment_method)}</span>
        </div>
        <div class="tablewrap" style="box-shadow:none"><table class="grid"><thead><tr>
          <th>${t('t_medicine')}</th><th>${t('t_batch')}</th><th class="num">${t('t_qty')}</th>
          <th class="num">${t('t_price')}</th><th class="num">${t('t_disc')}</th>
          <th class="num">${t('t_line')}</th></tr></thead><tbody>
          ${d.items.map(it => `<tr>
            <td><b>${esc(it.medicine_name)}</b>${+it.returned_quantity ? ` <span class="badge warn">−${fmt.num(it.returned_quantity)}</span>` : ''}</td>
            <td class="mono small">${esc(it.batch_number || '—')}</td>
            <td class="num">${fmt.num(it.quantity)}</td>
            <td class="num">${fmt.money(it.unit_price)}</td>
            <td class="num">${+it.discount ? fmt.money(it.discount) : '—'}</td>
            <td class="num"><b>${fmt.money(it.line_total)}</b></td></tr>`).join('')}
        </tbody></table></div>
        <div class="right mt small">
          Subtotal <b class="money">${fmt.money(s.subtotal)}</b>
          ${+s.discount ? ` · ${t('invdisc')} −<b class="money">${fmt.money(s.discount)}</b>` : ''}
          · <b>${t('total')} ${fmt.money(s.grand_total)} ${CUR()}</b>
          · ${t('paid_short')} <b class="money pos">${fmt.money(s.paid_amount)}</b>
          · ${t('t_change')} <b class="money">${fmt.money(s.change_amount)}</b>
        </div>
        ${d.returns.length ? `<p class="small mut mt"><b>${t('b_return')}:</b> ${d.returns.map(r =>
          `${esc(r.return_number)} (${t('r_' + { wrong_medicine:'wrong', damaged:'damaged', expired:'expired', changed_mind:'mind', duplicate:'dup', other:'other' }[r.reason]) || esc(r.reason)}: ${fmt.money(r.refund_total)})`).join(' · ')}</p>` : ''}`,
      footer: `${APP.can('sales','print') && s.status === 'completed'
          ? `<button class="btn btn-ghost" onclick="SCREENS.sales.printReceipt(${s.id})">${ic('print')} ${t('receipt')} 80mm</button>
             <button class="btn btn-ghost" onclick="SCREENS.sales.printA4(${s.id})">${ic('print')} A4</button>` : ''}
        <button class="btn btn-brand" onclick="closeModal()">${t('b_close')}</button>`,
    });
  },

  /* §13: duplicate — start a new cart with the same products/quantities.
     Prices reset to the product's current price server-side rules still apply. */
  async duplicateSale(id) {
    let d;
    try { d = await api('sales.get', { id }); } catch (e) { toast(e.message, 'err'); return; }
    const byProduct = {};
    d.items.forEach(it => {
      byProduct[it.product_id] ??= {
        product_id: +it.product_id, name: it.medicine_name, code: it.product_code,
        unit: it.unit || '', base_price: +it.unit_price, unit_price: +it.unit_price,
        quantity: 0, discount: 0, discRaw: '', batch_id: 0, batch_label: 'FEFO',
        stock: 0, expiry: null,
      };
      byProduct[it.product_id].quantity += +it.quantity;
    });
    this.cart = Object.values(byProduct);
    this.heldId = 0; this.view = 'pos'; this.paintView();
    this.cart.forEach(line => api('sales.batches', { product_id: line.product_id }).then(bs => {
      line.expiry = bs.length ? bs[0].expiry_date : null;
      line.stock = bs.reduce((a, b) => a + +b.quantity, 0);
      this.paintCart();
    }).catch(() => {}));
    toast(`${d.sale.invoice_number} → ${t('b_newsale')}`);
  },

  /* ================= returns ================= */
  async returnFlow(saleId = null) {
    let d = null;
    if (saleId) { try { d = await api('sales.get', { id: saleId }); } catch (e) { toast(e.message, 'err'); return; } }
    const REASONS = [['wrong_medicine','r_wrong'],['damaged','r_damaged'],['expired','r_expired'],
                     ['changed_mind','r_mind'],['duplicate','r_dup'],['other','r_other']];
    const back = openModal({
      title: t('b_return'),
      wide: true,
      body: `
        ${!d ? `<div class="row-flex mb">
          <input class="grow" id="retInv" placeholder="${t('t_invoice')} — SAL-…" style="height:36px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface);color:var(--ink);padding:0 10px;font:600 14px var(--font-data)">
          <button class="btn btn-ghost" id="retFind">${ic('search')} ${t('b_search')}</button></div>` : ''}
        <div id="retBody">${d ? '' : `<div class="empty small">${t('t_invoice')}?</div>`}</div>
        <div class="formgrid mt">
          <label class="fld"><span>${t('reason')} <span class="req">*</span></span>
            <select id="retReason">${REASONS.map(([v, k]) => `<option value="${v}">${t(k)}</option>`).join('')}</select></label>
          <label class="fld"><span>Note</span><input id="retNote"></label>
        </div>`,
      footer: `<button class="btn btn-ghost" onclick="closeModal()">${t('b_cancel')}</button>
               <button class="btn btn-brand" id="retSave" disabled>${t('b_save')}</button>`,
    });

    const paintItems = (dd) => {
      d = dd;
      const items = dd.items.filter(it => +it.quantity > +it.returned_quantity);
      $('#retBody', back).innerHTML = dd.sale.status !== 'completed'
        ? `<div class="empty small"><b>${t(dd.sale.status)}</b> — only completed sales can be returned.</div>`
        : items.length ? `
        <p class="small mut">${esc(dd.sale.invoice_number)} · ${esc(String(dd.sale.created_at).slice(0, 16))} · ${t('t_cashier')}: ${esc(dd.sale.cashier || '')}</p>
        <div class="tablewrap" style="box-shadow:none"><table class="grid"><thead><tr>
          <th>${t('t_medicine')}</th><th>${t('t_batch')}</th><th class="num">Sold</th>
          <th class="num" style="width:110px">${t('b_return')}</th></tr></thead><tbody>
          ${items.map(it => `<tr data-item="${it.id}" data-max="${it.quantity - it.returned_quantity}">
            <td><b>${esc(it.medicine_name)}</b></td>
            <td class="mono small">${esc(it.batch_number || '—')}</td>
            <td class="num">${fmt.num(it.quantity - it.returned_quantity)}</td>
            <td class="num"><input type="number" min="0" max="${it.quantity - it.returned_quantity}" value="0"
                 style="height:30px;width:80px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);padding:0 7px;font:600 13px var(--font-data);text-align:end"></td>
          </tr>`).join('')}
        </tbody></table></div>` : `<div class="empty small">Everything on this invoice was already returned.</div>`;
      $('#retSave', back).disabled = !(dd.sale.status === 'completed' && items.length);
    };
    if (d) paintItems(d);

    const find = $('#retFind', back);
    if (find) {
      const doFind = async () => {
        try { paintItems(await api('sales.findInvoice', { invoice: $('#retInv', back).value.trim() })); }
        catch (e) { $('#retBody', back).innerHTML = `<div class="empty small"><b>${esc(e.message)}</b></div>`; }
      };
      find.addEventListener('click', doFind);
      $('#retInv', back).addEventListener('keydown', e => { if (e.key === 'Enter') doFind(); });
    }

    $('#retSave', back).addEventListener('click', async () => {
      const lines = $$('#retBody tr[data-item]', back)
        .map(tr => ({ sale_item_id: +tr.dataset.item, quantity: Math.min(+tr.dataset.max, +$('input', tr).value || 0) }))
        .filter(l => l.quantity > 0);
      if (!lines.length) { toast(t('b_return') + '?', 'warn'); return; }
      try {
        const picked = $$('#retBody tr[data-item]', back)
          .filter(tr => +$('input', tr).value > 0)
          .map(tr => ({
            name: tr.children[0].textContent.trim(),
            qty: Math.min(+tr.dataset.max, +$('input', tr).value || 0),
          }));
        const r = await api('sales.return', {
          sale_id: +d.sale.id, reason: $('#retReason', back).value,
          note: $('#retNote', back).value.trim(), items: lines,
        });
        closeModal(back);
        toast(`${r.return_number} · ${fmt.money(r.refund_total)} ${CUR()}`);
        if (APP.can('sales', 'print')) {
          const per = r.refund_total / Math.max(1, picked.reduce((a, l) => a + l.qty, 0));
          this.printReturnReceipt(d.sale, r, picked.map(l => ({ ...l, refund: l.qty * per })));
        }
        if (this.view === 'list') this.paintList();
      } catch (e) { toast(e.message, 'err'); }
    });
  },

  /* ================= keyboard (spec §17) ================= */
  onKey(e) {
    if (e.key === 'F2') { e.preventDefault(); const q = $('#posQ', this.el); if (q) q.focus(); return; }
    if (e.key === 'F3') { e.preventDefault(); if (APP.can('sales', 'add')) this.phoneScan(); return; }
    if (e.key === 'F4') { e.preventDefault(); const p = $('.payA', this.el); if (p) { p.focus(); p.select?.(); } return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault(); const q = $('#posQ', this.el); if (q) q.focus(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && APP.can('sales', 'add')) {
      e.preventDefault(); this.newSale(true); this.view = 'pos'; this.paintView(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && this.view === 'pos') {
      e.preventDefault(); this.complete(false); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p' && this.view === 'pos') {
      e.preventDefault();
      if (this.lastSaleId && APP.can('sales', 'print')) this.printReceipt(this.lastSaleId); // reprint (§10)
      else toast(t('nothing'), 'warn');
      return;
    }
    if (e.key === 'Escape' && this.view === 'pos' && this.cart.length) {
      this.newSale(true); return;
    }
    if (this.view === 'list') tableNav(e, $('#posBody', this.el), tr => this.viewSale(+tr.dataset.id));
  },

  openItem(id) { this.view = 'list'; this.paintView(); this.viewSale(id); },
};
