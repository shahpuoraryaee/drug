/* Arya Pharma Manager — screens
   Every screen registers itself in SCREENS = {name:{render, onKey?, openItem?}} */
'use strict';

/* ======================================================= helpers */
function screenHead(titleKey, subKey, actionsHtml = '') {
  return `<div class="screenhead">
    <div><h1 class="display-face">${t(titleKey)}</h1>
      ${subKey ? `<div class="sub">${t(subKey)}</div>` : ''}</div>
    <div class="row-flex">${actionsHtml}</div>
  </div>`;
}
function statusBadge(s) {
  const map = { paid: 'ok', partial: 'warn', unpaid: 'bad' };
  return `<span class="badge ${map[s] || 'mut'}">${t(s) || esc(s)}</span>`;
}
function dl(url) { const a = document.createElement('a'); a.href = url; a.download = ''; a.click(); }
async function loadSuppliers() { return api('suppliers.all'); }
async function loadCategories() { return api('categories.list'); }
function selOpts(list, valKey, labelKey, cur, first = '') {
  return (first ? `<option value="">${first}</option>` : '') +
    list.map(x => `<option value="${x[valKey]}" ${+cur === +x[valKey] ? 'selected' : ''}>${esc(x[labelKey])}</option>`).join('');
}
function catOpts(tree, cur) {
  // categories_list returns flat rows with depth
  return `<option value="">${t('f_allcat')}</option>` + tree.map(c =>
    `<option value="${c.id}" ${+cur === +c.id ? 'selected' : ''}>${'&nbsp;'.repeat((c.depth || 0) * 3)}${esc(c.name)}</option>`).join('');
}

/* ======================================================= DASHBOARD */
SCREENS.dash = {
  async render(el) {
    const d = await api('dashboard.stats');
    const inv = d.inventory, ex = d.expiry;
    const deltaY = d.income_yesterday > 0
      ? Math.round(((d.income_today - d.income_yesterday) / d.income_yesterday) * 100) : 0;
    const heat = [
      ['h180', 'e180', +ex.d180plus + +ex.d180], ['h90', 'e90', ex.d90], ['h60', 'e60', ex.d60],
      ['h30', 'e30', ex.d30], ['h15', 'e15', ex.d15], ['hx', 'ex', ex.expired],
    ];
    el.innerHTML = `
      ${screenHead('h_dash', 'sub_dash', `
        <button class="btn btn-ghost" onclick="openSearch()">${ic('search')} ${t('b_find')} <span class="kbd">Ctrl K</span></button>
        ${APP.can('products','add') ? `<button class="btn btn-brand" onclick="SCREENS.products.form()">${ic('plus')} ${t('b_addproduct')}</button>` : ''}`)}
      <div class="kpis">
        <div class="card-a kpi income"><div class="label">${ic('coins')} ${t('k_tincome')}</div>
          <div class="value">${fmt.money(d.income_today)}<small>${CUR()}</small></div>
          <div class="delta ${deltaY >= 0 ? 'up' : 'down'}">${deltaY >= 0 ? '▲' : '▼'} ${fmt.num(Math.abs(deltaY))}% ${t('vs_yday')}</div></div>
        <div class="card-a kpi expense"><div class="label">${ic('wallet')} ${t('k_texpense')}</div>
          <div class="value">${fmt.money(d.expense_today)}<small>${CUR()}</small></div>
          <div class="delta flat">${+d.purchases_today ? `${t('k_tpurch')}: ${fmt.money(d.purchases_today)} · ` : ''}${d.sales && d.sales.count_month
            ? `${t('k_month')}: ${fmt.num(d.sales.count_month)} · ${fmt.money(d.sales.total_month)} · ` : ''}${d.sales && d.sales.count_today
            ? `${fmt.num(d.sales.count_today)} ${t('m_sales').toLowerCase()} · +${fmt.money(d.sales.profit_today)} ${t('t_profit').replace(' (؋)','').toLowerCase()}`
            : `${fmt.num(d.recent_expenses.length)} ${t('entries')}`}</div></div>
        <div class="card-a kpi profit"><div class="label">${ic('chart')} ${t('k_mprofit')}</div>
          <div class="value">${fmt.money(d.net_profit_month)}<small>${CUR()}</small></div>
          <div class="delta ${d.net_profit_month >= 0 ? 'up' : 'down'}">${fmt.money(d.income_month)} − ${fmt.money(d.expense_month)}</div></div>
        <div class="card-a kpi stockval"><div class="label">${ic('box')} ${t('k_stockval')}</div>
          <div class="value">${fmt.money(inv.value)}<small>${CUR()}</small></div>
          <div class="delta flat">${fmt.num(inv.units)} ${t('units')} · ${fmt.num(inv.products)} ${t('products_w')}</div></div>
      </div>

      <div class="card-a expiry-ledger">
        <div class="head"><h2 class="display-face">${t('h_expiry')}</h2>
          <a href="#" onclick="go('reports');return false">${t('a_expiry')}</a></div>
        <div class="heatbar">
          ${heat.map(([cls, key, n]) => `
            <div class="heatseg ${cls}" style="flex:${Math.max(1, +n)}" onclick="go('inventory')">
              <span class="n">${fmt.num(n)}</span><span class="t">${t(key)}</span></div>`).join('')}
        </div>
      </div>

      <div class="dashgrid">
        <div>
          <div class="card-a cardpad">
            <div class="head row-flex" style="justify-content:space-between">
              <h2 class="display-face" style="font-size:14px;margin:0">${t('h_flow')}</h2></div>
            <div id="flowChart" class="mt"></div>
          </div>
          <div class="card-a cardpad mt">
            <div class="row-flex" style="justify-content:space-between">
              <h2 class="display-face" style="font-size:14px;margin:0">${t('h_recentpurch')}</h2>
              <a href="#" style="color:var(--brand);font-size:12.5px;text-decoration:none"
                 onclick="go('purchases');return false">${t('a_all')}</a></div>
            <div class="tablewrap mt" style="box-shadow:none">
              <table class="grid"><thead><tr>
                <th>${t('t_invoice')}</th><th>${t('t_supplier')}</th><th class="num">${t('t_items')}</th>
                <th class="num">${t('t_total')}</th><th>${t('t_status')}</th></tr></thead>
              <tbody>${d.recent_purchases.map(p => `
                <tr><td class="mono">${esc(p.invoice_number)}</td><td>${esc(p.supplier)}</td>
                <td class="num">${fmt.num(p.item_count)}</td><td class="num">${fmt.money(p.grand_total)}</td>
                <td>${statusBadge(p.payment_status)}</td></tr>`).join('') ||
                `<tr><td colspan="5" class="empty">${t('nothing')}</td></tr>`}</tbody></table>
            </div>
          </div>
        </div>
        <div>
          <div class="card-a cardpad">
            <h2 class="display-face" style="font-size:14px;margin:0 0 10px">${t('h_lowstock')}</h2>
            ${d.low_stock.map(p => `
              <div class="row-flex" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)">
                <div class="grow"><b style="font-size:13px">${esc(p.medicine_name)}</b></div>
                <span class="badge ${+p.quantity <= 0 ? 'bad' : 'warn'}">${fmt.num(p.quantity)} / ${t('min')} ${fmt.num(p.min_quantity)}</span>
              </div>`).join('') || `<div class="empty small">${t('nothing')}</div>`}
          </div>
          <div class="card-a cardpad mt">
            <h2 class="display-face" style="font-size:14px;margin:0 0 10px">${t('h_recentexp')}</h2>
            ${d.recent_expenses.map(x => `
              <div class="row-flex" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)">
                <div class="grow"><b style="font-size:13px">${esc(x.description || x.category)}</b>
                  <div class="mut small">${esc(x.category)} · ${fmt.date(x.expense_date)}</div></div>
                <span class="money">${fmt.money(x.amount)}</span>
              </div>`).join('') || `<div class="empty small">${t('nothing')}</div>`}
          </div>
        </div>
      </div>`;
    drawFlowChart($('#flowChart', el), d.chart.map(c => ({ d: c.date, income: c.income, expense: c.expense })));
  },
};

/* ======================================================= PRODUCTS */
SCREENS.products = {
  state: { page: 1, q: '', category_id: '', supplier_id: '', stock: '', expiry: 0 },
  async render(el) {
    const s = this.state;
    const [cats, sups] = await Promise.all([loadCategories(), loadSuppliers()]);
    this.cats = cats; this.sups = sups;
    el.innerHTML = `
      ${screenHead('m_products', null, `
        ${APP.can('products','export') ? `<button class="btn btn-ghost" id="pExport">${ic('download')} ${t('b_export')}</button>` : ''}
        ${APP.can('products','add') ? `<button class="btn btn-brand" onclick="SCREENS.products.form()">${ic('plus')} ${t('b_addproduct')} <span class="keycap-inverse">Ctrl N</span></button>` : ''}`)}
      <div class="filterbar">
        <input type="search" id="pQ" placeholder="${t('b_search')}…" value="${esc(s.q)}">
        <select id="pCat">${catOpts(cats, s.category_id)}</select>
        <select id="pSup">${selOpts(sups, 'id', 'name', s.supplier_id, t('f_allsup'))}</select>
        <select id="pStock">
          <option value="">${t('f_allstock')}</option>
          <option value="low" ${s.stock === 'low' ? 'selected' : ''}>${t('f_low')}</option>
          <option value="out" ${s.stock === 'out' ? 'selected' : ''}>${t('f_out')}</option></select>
        <select id="pExp">
          <option value="0">${t('f_anyexp')}</option>
          ${[90, 60, 30, 15].map(d => `<option value="${d}" ${+s.expiry === d ? 'selected' : ''}>≤ ${fmt.num(d)} d</option>`).join('')}
          <option value="-1" ${+s.expiry === -1 ? 'selected' : ''}>${t('ex')}</option></select>
      </div>
      <div id="pTable"><div class="spin"></div></div>`;

    const reload = () => { s.page = 1; this.loadTable(); };
    let deb;
    $('#pQ', el).addEventListener('input', e => { clearTimeout(deb); deb = setTimeout(() => { s.q = e.target.value.trim(); reload(); }, 220); });
    $('#pCat', el).addEventListener('change', e => { s.category_id = e.target.value; reload(); });
    $('#pSup', el).addEventListener('change', e => { s.supplier_id = e.target.value; reload(); });
    $('#pStock', el).addEventListener('change', e => { s.stock = e.target.value; reload(); });
    $('#pExp', el).addEventListener('change', e => { s.expiry = +e.target.value; reload(); });
    const ex = $('#pExport', el);
    if (ex) ex.addEventListener('click', () => dl('api.php?action=products.export'));
    await this.loadTable();
  },

  async loadTable() {
    const box = $('#pTable'); if (!box) return;
    const s = this.state;
    const d = await api('products.list', { page: s.page, per: 25, q: s.q,
      category_id: +s.category_id || 0, supplier_id: +s.supplier_id || 0, stock: s.stock, expiry: s.expiry });
    this.lastRows = d.rows;
    box.innerHTML = `
      <div class="tablewrap">
        <table class="grid"><thead><tr>
          <th>${t('t_code')}</th><th>${t('t_medicine')}</th><th>${t('t_cat')}</th>
          <th>${t('t_expiry')}</th><th class="num">${t('t_stock')}</th>
          <th class="num">${t('t_buy')}</th><th class="num">${t('t_sell')}</th><th class="actions"></th>
        </tr></thead><tbody>
        ${d.rows.map(p => `
          <tr data-id="${p.id}">
            <td class="mono small">${esc(p.product_code)}</td>
            <td><b>${esc(p.medicine_name)}</b><div class="mut small">${esc(p.generic_name || '')}${p.brand_name ? ' · ' + esc(p.brand_name) : ''}</div></td>
            <td class="small">${esc(p.category_name || '—')}</td>
            <td>${expPill(p.next_expiry)}</td>
            <td class="num">${+p.quantity <= 0 ? `<span class="badge bad">${t('out')}</span>`
              : +p.quantity <= +p.min_quantity ? `<span class="badge warn">${fmt.num(p.quantity)}</span>`
              : fmt.num(p.quantity)}</td>
            <td class="num mut">${fmt.money(p.purchase_price)}</td>
            <td class="num"><b>${fmt.money(p.selling_price)}</b></td>
            <td class="actions">
              ${APP.can('products','print') ? `<button title="${t('b_label')}" data-act="label">${ic('cap')}</button>` : ''}
              ${APP.can('products','edit') ? `<button title="${t('b_edit')}" data-act="edit">${ic('edit')}</button>
              <button title="${t('b_duplicate')}" data-act="dup">${ic('copy')}</button>` : ''}
              ${APP.can('products','delete') ? `<button class="danger" title="${t('b_delete')}" data-act="del">${ic('trash')}</button>` : ''}
            </td>
          </tr>`).join('') || `<tr><td colspan="8"><div class="empty"><b>${t('nothing')}</b></div></td></tr>`}
        </tbody></table>
      </div>
      ${pagerHtml(d)}`;
    bindPager(box, p => { s.page = p; this.loadTable(); });
    $$('tbody tr[data-id]', box).forEach(tr => {
      tr.addEventListener('dblclick', () => this.form(+tr.dataset.id));
      $$('button[data-act]', tr).forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = +tr.dataset.id;
        if (b.dataset.act === 'edit') this.form(id);
        if (b.dataset.act === 'dup') this.duplicate(id);
        if (b.dataset.act === 'del') this.remove(id);
        if (b.dataset.act === 'label') {
          const r = (this.lastRows || []).find(x => +x.id === id);
          if (r) this.labelDialog(r);
        }
      }));
    });
  },

  onKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && APP.can('products', 'add')) {
      e.preventDefault(); this.form(); return;
    }
    tableNav(e, $('#pTable'),
      tr => this.form(+tr.dataset.id),
      tr => this.form(+tr.dataset.id));
  },
  openItem(id) { this.form(id); },

  async form(id = null) {
    let p = { unit: 'pcs', min_quantity: 10, status: 'active' }, batches = [];
    if (id) { const d = await api('products.get', { id }); p = d.product; batches = d.batches; }
    const cats = this.cats || await loadCategories();
    const sups = this.sups || await loadSuppliers();
    const units = ['pcs', 'box', 'strip', 'bottle', 'vial', 'tube', 'sachet', 'amp'];
    const back = openModal({
      title: id ? `${t('b_edit')} — ${p.medicine_name}` : t('b_addproduct'),
      wide: true,
      body: `<div class="formgrid">
        <label class="fld"><span>${t('t_code')}</span>
          <input id="f_code" value="${esc(p.product_code || '')}" placeholder="auto" ${id ? 'readonly' : ''}></label>
        <label class="fld"><span>Barcode</span><input id="f_barcode" value="${esc(p.barcode || '')}"></label>
        <label class="fld full"><span>${t('t_medicine')} <span class="req">*</span></span>
          <input id="f_name" value="${esc(p.medicine_name || '')}" required></label>
        <label class="fld"><span>Generic</span><input id="f_generic" value="${esc(p.generic_name || '')}"></label>
        <label class="fld"><span>Brand</span><input id="f_brand" value="${esc(p.brand_name || '')}"></label>
        <label class="fld"><span>${t('t_cat')}</span><select id="f_cat">${catOpts(cats, p.category_id)}</select></label>
        <label class="fld"><span>${t('t_supplier')}</span>
          <select id="f_sup">${selOpts(sups, 'id', 'name', p.supplier_id, '—')}</select></label>
        <label class="fld"><span>${t('t_buy')}</span><input id="f_buy" type="number" step="0.01" min="0" value="${p.purchase_price ?? ''}"></label>
        <label class="fld"><span>${t('t_sell')} <span class="req">*</span></span>
          <input id="f_sell" type="number" step="0.01" min="0" value="${p.selling_price ?? ''}"></label>
        <label class="fld"><span>Unit</span>
          <select id="f_unit">${units.map(u => `<option ${p.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
        <label class="fld"><span>Min qty</span><input id="f_min" type="number" min="0" value="${p.min_quantity ?? 10}"></label>
        <label class="fld"><span>Location / shelf</span><input id="f_loc" value="${esc(p.location || '')}"></label>
        <label class="fld"><span>Description</span><input id="f_desc" value="${esc(p.description || '')}"></label>
        ${id ? `
        <div class="fld full"><span>Photo (v1.2)</span>
          <div class="row-flex" style="align-items:center">
            <img id="f_img" src="${p.image_path ? esc(p.image_path) : ''}" alt=""
                 style="width:54px;height:54px;object-fit:cover;border-radius:9px;border:1px solid var(--line);${p.image_path ? '' : 'display:none'}">
            <input type="file" id="f_imgfile" accept=".jpg,.jpeg,.png,.webp" style="border:0;padding:0">
            <button class="btn btn-ghost btn-sm" id="f_imgup">${ic('upload')} Upload</button>
            ${p.image_path ? `<button class="btn btn-ghost btn-sm" id="f_imgrm">${ic('trash')}</button>` : ''}
          </div></div>` : ''}
        ${!id ? `
        <div class="full" style="border-top:1px dashed var(--line-strong);margin:6px 0 10px;padding-top:12px">
          <b class="small" style="letter-spacing:.05em;text-transform:uppercase;color:var(--muted)">${t('opening')}</b></div>
        <label class="fld"><span>${t('t_qty')}</span><input id="f_oqty" type="number" min="0" value="0"></label>
        <label class="fld"><span>${t('t_batch')}</span><input id="f_obatch" placeholder="auto"></label>
        <label class="fld"><span>${t('t_expiry')}</span><input id="f_oexp" type="date"></label>
        <label class="fld"><span>Mfg date</span><input id="f_omfg" type="date"></label>` : `
        <div class="full">
          <b class="small" style="letter-spacing:.05em;text-transform:uppercase;color:var(--muted)">Batches</b>
          <div class="tablewrap mt" style="box-shadow:none;max-height:170px">
            <table class="grid"><thead><tr><th>${t('t_batch')}</th><th>${t('t_expiry')}</th><th class="num">${t('t_qty')}</th></tr></thead>
            <tbody>${batches.map(b => `<tr><td class="mono">${esc(b.batch_number)}</td>
              <td>${expPill(b.expiry_date)} <span class="mut small">${fmt.date(b.expiry_date)}</span></td>
              <td class="num">${fmt.num(b.quantity)}</td></tr>`).join('') ||
              `<tr><td colspan="3" class="mut center">${t('nothing')}</td></tr>`}</tbody></table></div>
        </div>`}
      </div>`,
      footer: `<button class="btn btn-ghost" onclick="closeModal()">${t('b_cancel')}</button>
               <button class="btn btn-brand" id="f_save">${t('b_save')}</button>`,
    });
    const up = $('#f_imgup', back);
    if (up) up.addEventListener('click', async () => {
      const f = $('#f_imgfile', back).files[0];
      if (!f) { toast('Choose an image file first.', 'warn'); return; }
      try {
        const r = await apiUpload('products.uploadImage', { id }, { image: f });
        const img = $('#f_img', back); img.src = r.image_path + '?' + Date.now(); img.style.display = '';
        toast(t('saved'));
      } catch (e2) { toast(e2.message, 'err'); }
    });
    const rm = $('#f_imgrm', back);
    if (rm) rm.addEventListener('click', async () => {
      try { await api('products.removeImage', { id }); $('#f_img', back).style.display = 'none'; toast(t('deleted')); }
      catch (e2) { toast(e2.message, 'err'); }
    });

    $('#f_save', back).addEventListener('click', async () => {
      const payload = {
        id: id || 0,
        product_code: $('#f_code', back).value.trim(),
        barcode: $('#f_barcode', back).value.trim(),
        medicine_name: $('#f_name', back).value.trim(),
        generic_name: $('#f_generic', back).value.trim(),
        brand_name: $('#f_brand', back).value.trim(),
        category_id: +$('#f_cat', back).value || 0,
        supplier_id: +$('#f_sup', back).value || 0,
        purchase_price: +$('#f_buy', back).value || 0,
        selling_price: +$('#f_sell', back).value || 0,
        unit: $('#f_unit', back).value,
        min_quantity: +$('#f_min', back).value || 0,
        location: $('#f_loc', back).value.trim(),
        description: $('#f_desc', back).value.trim(),
      };
      if (!id) {
        payload.opening_quantity = +$('#f_oqty', back).value || 0;
        payload.batch_number = $('#f_obatch', back).value.trim();
        payload.expiry_date = $('#f_oexp', back).value;
        payload.manufacturing_date = $('#f_omfg', back).value;
      }
      try {
        await api('products.save', payload);
        closeModal(back); toast(t('saved')); this.loadTable();
      } catch (e2) { toast(e2.message, 'err'); }
    });
  },

  async duplicate(id) {
    try { await api('products.duplicate', { id }); toast(t('saved')); this.loadTable(); }
    catch (e) { toast(e.message, 'err'); }
  },

  /* v1.2: printable CODE128 shelf/product labels */
  labelDialog(r) {
    const code = (r.barcode || r.product_code || '').trim();
    if (!code) { toast('This product has no barcode or code.', 'warn'); return; }
    const back = openModal({
      title: `${t('b_label')} — ${r.medicine_name}`,
      body: `<div class="center" id="lblPrev" style="padding:8px 0">${(() => {
          try { return Code128.svg(code, { height: 44 }); }
          catch (e) { return `<span class="mut small">${esc(e.message)}</span>`; }
        })()}</div>
        <label class="fld"><span>Copies</span>
          <input id="lblN" type="number" min="1" max="120" value="12"></label>
        <p class="mut small">Labels print on A4, 60 mm wide, with the price under the barcode.
          Verify one label with your scanner before printing many.</p>`,
      footer: `<button class="btn btn-ghost" onclick="closeModal()">${t('b_cancel')}</button>
               <button class="btn btn-brand" id="lblGo">${ic('print')} ${t('b_print')}</button>`,
    });
    $('#lblGo', back).addEventListener('click', () => {
      printLabels([{ code, name: r.medicine_name, price: r.selling_price }],
                  Math.max(1, Math.min(120, +$('#lblN', back).value || 1)));
      closeModal(back);
    });
  },
  async remove(id) {
    if (!await confirmBox(t('confirm_del'), t('confirm_del_sub'))) return;
    try { await api('products.delete', { id }); toast(t('deleted')); this.loadTable(); }
    catch (e) { toast(e.message, 'err'); }
  },
};

/* ======================================================= INVENTORY */
SCREENS.inventory = {
  state: { tab: 'expiry', page: 1, days: 90, type: '', q: '' },
  async render(el) {
    const s = this.state;
    el.innerHTML = `
      ${screenHead('m_inventory', null, APP.can('inventory','add') ?
        `<button class="btn btn-brand" onclick="SCREENS.inventory.adjustForm()">${ic('edit')} ${t('b_adjust')}</button>` : '')}
      <div class="tabs">
        <button data-tab="expiry" class="${s.tab === 'expiry' ? 'on' : ''}">${t('h_expiry')}</button>
        <button data-tab="movements" class="${s.tab === 'movements' ? 'on' : ''}">Movements</button>
      </div>
      <div id="invBody"><div class="spin"></div></div>`;
    $$('.tabs button', el).forEach(b => b.addEventListener('click', () => {
      s.tab = b.dataset.tab; s.page = 1;
      $$('.tabs button', el).forEach(x => x.classList.toggle('on', x === b));
      this.loadTab();
    }));
    await this.loadTab();
  },

  async loadTab() {
    const box = $('#invBody'); if (!box) return;
    const s = this.state;
    box.innerHTML = '<div class="spin"></div>';
    if (s.tab === 'expiry') {
      const d = await api('inventory.expiry', { page: s.page, per: 25, days: s.days });
      box.innerHTML = `
        <div class="filterbar">
          <select id="invDays">
            ${[[90, '≤ 90 d'], [60, '≤ 60 d'], [30, '≤ 30 d'], [15, '≤ 15 d'], [-1, t('ex')]].map(([v, l]) =>
              `<option value="${v}" ${+s.days === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="tablewrap"><table class="grid"><thead><tr>
          <th>${t('t_medicine')}</th><th>${t('t_batch')}</th><th>${t('t_expiry')}</th>
          <th class="num">${t('t_qty')}</th><th class="num">Value (${CUR()})</th></tr></thead><tbody>
          ${d.rows.map(r => `<tr>
            <td><b>${esc(r.medicine_name)}</b> <span class="mut small mono">${esc(r.product_code)}</span></td>
            <td class="mono">${esc(r.batch_number)}</td>
            <td>${expPill(r.expiry_date)} <span class="mut small">${fmt.date(r.expiry_date)}</span></td>
            <td class="num">${fmt.num(r.quantity)}</td>
            <td class="num">${fmt.money(r.value)}</td></tr>`).join('') ||
            `<tr><td colspan="5"><div class="empty"><b>${t('nothing')}</b></div></td></tr>`}
        </tbody></table></div>${pagerHtml(d)}`;
      $('#invDays', box).addEventListener('change', e => { s.days = +e.target.value; s.page = 1; this.loadTab(); });
    } else {
      const d = await api('inventory.movements', { page: s.page, per: 25, type: s.type, q: s.q });
      const types = ['', 'initial', 'purchase', 'adjustment', 'damage', 'expired', 'lost', 'return'];
      box.innerHTML = `
        <div class="filterbar">
          <input type="search" id="invQ" placeholder="${t('b_search')}…" value="${esc(s.q)}">
          <select id="invType">${types.map(x =>
            `<option value="${x}" ${s.type === x ? 'selected' : ''}>${x || t('t_type')}</option>`).join('')}</select>
        </div>
        <div class="tablewrap"><table class="grid"><thead><tr>
          <th>${t('t_date')}</th><th>${t('t_medicine')}</th><th>${t('t_type')}</th>
          <th class="num">±</th><th class="num">After</th><th>${t('t_user')}</th><th>Note</th></tr></thead><tbody>
          ${d.rows.map(r => `<tr>
            <td class="mono small">${esc(String(r.created_at).slice(0, 16))}</td>
            <td><b>${esc(r.medicine_name)}</b></td>
            <td><span class="badge ${+r.quantity_change >= 0 ? 'ok' : 'bad'}">${esc(r.movement_type)}</span></td>
            <td class="num ${+r.quantity_change >= 0 ? 'money pos' : 'money neg'}">${r.quantity_change > 0 ? '+' : ''}${fmt.num(r.quantity_change)}</td>
            <td class="num">${fmt.num(r.quantity_after)}</td>
            <td class="small">${esc(r.user_name || '')}</td>
            <td class="small mut">${esc(r.note || '')}</td></tr>`).join('') ||
            `<tr><td colspan="7"><div class="empty"><b>${t('nothing')}</b></div></td></tr>`}
        </tbody></table></div>${pagerHtml(d)}`;
      let deb;
      $('#invQ', box).addEventListener('input', e => { clearTimeout(deb); deb = setTimeout(() => { s.q = e.target.value.trim(); s.page = 1; this.loadTab(); }, 220); });
      $('#invType', box).addEventListener('change', e => { s.type = e.target.value; s.page = 1; this.loadTab(); });
    }
    bindPager(box, p => { s.page = p; this.loadTab(); });
  },

  openItem() { /* arrives from search — expiry tab already shows batches */ },

  async adjustForm() {
    const back = openModal({
      title: t('b_adjust'),
      body: `
        <div class="fld autocomplete"><span>${t('t_medicine')} <span class="req">*</span></span>
          <input id="a_prod" placeholder="${t('b_search')}…" autocomplete="off"><div class="acl" hidden></div></div>
        <div class="formgrid">
          <label class="fld"><span>${t('t_type')}</span>
            <select id="a_type">
              <option value="adjustment">adjustment</option><option value="damage">damage</option>
              <option value="expired">expired</option><option value="lost">lost</option></select></label>
          <label class="fld"><span>Direction</span>
            <select id="a_dir"><option value="out">out (−)</option><option value="in">in (+)</option></select></label>
          <label class="fld"><span>${t('t_qty')} <span class="req">*</span></span>
            <input id="a_qty" type="number" min="1" value="1"></label>
          <label class="fld"><span>${t('t_batch')}</span><select id="a_batch"><option value="">FEFO (auto)</option></select></label>
          <label class="fld full"><span>${t('reason')}</span><input id="a_note"></label>
        </div>`,
      footer: `<button class="btn btn-ghost" onclick="closeModal()">${t('b_cancel')}</button>
               <button class="btn btn-brand" id="a_save">${t('b_save')}</button>`,
    });
    let productId = 0;
    productAutocomplete($('#a_prod', back), back.querySelector('.acl'), async (p) => {
      productId = p.id;
      $('#a_prod', back).value = p.medicine_name;
      const batches = await api('inventory.batches', { product_id: p.id });
      $('#a_batch', back).innerHTML = '<option value="">FEFO (auto)</option>' +
        batches.map(b => `<option value="${b.id}">${esc(b.batch_number)} · ${fmt.date(b.expiry_date)} · ${fmt.num(b.quantity)}</option>`).join('');
    });
    $('#a_type', back).addEventListener('change', e => {
      const dirSel = $('#a_dir', back);
      dirSel.value = 'out';
      dirSel.disabled = e.target.value !== 'adjustment';
    });
    $('#a_save', back).addEventListener('click', async () => {
      if (!productId) { toast(t('t_medicine') + '?', 'warn'); return; }
      try {
        await api('inventory.adjust', {
          product_id: productId, quantity: +$('#a_qty', back).value || 0,
          type: $('#a_type', back).value, direction: $('#a_dir', back).value,
          batch_id: +$('#a_batch', back).value || 0, note: $('#a_note', back).value.trim(),
        });
        closeModal(back); toast(t('saved')); this.loadTab();
      } catch (e) { toast(e.message, 'err'); }
    });
  },
};

/* Product autocomplete used by inventory adjust + purchase items */
function productAutocomplete(input, listEl, onPick) {
  let deb, items = [], sel = 0;
  const paint = () => {
    listEl.hidden = !items.length;
    listEl.innerHTML = items.map((p, i) => `
      <div class="it ${i === sel ? 'sel' : ''}" data-i="${i}">
        <span><b>${esc(p.medicine_name)}</b> <span class="mut small">${esc(p.product_code)}</span></span>
        <span class="mono small">${fmt.num(p.quantity)} · ${fmt.money(p.selling_price)}</span></div>`).join('');
    $$('.it', listEl).forEach(el => el.addEventListener('mousedown', (e) => {
      e.preventDefault(); pick(+el.dataset.i);
    }));
  };
  const pick = (i) => { if (items[i]) { onPick(items[i]); listEl.hidden = true; } };
  input.addEventListener('input', () => {
    clearTimeout(deb);
    deb = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 1) { listEl.hidden = true; return; }
      try {
        const d = await api('search.global', { q, scope: 'products' });
        items = d.products || []; sel = 0; paint();
      } catch { listEl.hidden = true; }
    }, 180);
  });
  input.addEventListener('keydown', (e) => {
    if (listEl.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); paint(); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(); }
    if (e.key === 'Enter')     { e.preventDefault(); pick(sel); }
    if (e.key === 'Escape')    { listEl.hidden = true; e.stopPropagation(); }
  });
  input.addEventListener('blur', () => setTimeout(() => { listEl.hidden = true; }, 150));
}

/* ======================================================= PURCHASES */
SCREENS.purchases = {
  state: { page: 1, q: '', status: '', supplier_id: '' },
  async render(el) {
    const s = this.state;
    const sups = await loadSuppliers();
    this.sups = sups;
    el.innerHTML = `
      ${screenHead('m_purchases', null, APP.can('purchases','add') ?
        `<button class="btn btn-brand" onclick="SCREENS.purchases.form()">${ic('plus')} ${t('b_newpurch')} <span class="keycap-inverse">Ctrl N</span></button>` : '')}
      <div class="filterbar">
        <input type="search" id="puQ" placeholder="${t('t_invoice')} / ${t('t_supplier')}…" value="${esc(s.q)}">
        <select id="puSup">${selOpts(sups, 'id', 'name', s.supplier_id, t('f_allsup'))}</select>
        <select id="puSt">
          <option value="">${t('t_status')}</option>
          ${['paid','partial','unpaid'].map(x => `<option value="${x}" ${s.status===x?'selected':''}>${t(x)}</option>`).join('')}
        </select>
      </div>
      <div id="puTable"><div class="spin"></div></div>`;
    let deb;
    $('#puQ', el).addEventListener('input', e => { clearTimeout(deb); deb = setTimeout(() => { s.q = e.target.value.trim(); s.page = 1; this.loadTable(); }, 220); });
    $('#puSup', el).addEventListener('change', e => { s.supplier_id = e.target.value; s.page = 1; this.loadTable(); });
    $('#puSt', el).addEventListener('change', e => { s.status = e.target.value; s.page = 1; this.loadTable(); });
    await this.loadTable();
  },

  async loadTable() {
    const box = $('#puTable'); if (!box) return;
    const s = this.state;
    const d = await api('purchases.list', { page: s.page, per: 25, q: s.q,
      supplier_id: +s.supplier_id || 0, status: s.status });
    box.innerHTML = `
      <div class="tablewrap"><table class="grid"><thead><tr>
        <th>${t('t_invoice')}</th><th>${t('t_date')}</th><th>${t('t_supplier')}</th>
        <th class="num">${t('t_items')}</th><th class="num">${t('t_total')}</th>
        <th class="num">${t('due')}</th><th>${t('t_status')}</th><th class="actions"></th></tr></thead><tbody>
        ${d.rows.map(p => {
          const due = +p.grand_total - +p.paid_amount;
          return `<tr data-id="${p.id}">
          <td class="mono">${esc(p.invoice_number)}</td>
          <td class="small">${fmt.date(p.purchase_date)}</td>
          <td><b>${esc(p.supplier)}</b></td>
          <td class="num">${fmt.num(p.item_count)}</td>
          <td class="num"><b>${fmt.money(p.grand_total)}</b></td>
          <td class="num ${due > 0 ? 'money neg' : 'mut'}">${due > 0 ? fmt.money(due) : '—'}</td>
          <td>${statusBadge(p.payment_status)}</td>
          <td class="actions">
            <button title="open" data-act="view">${ic('eye')}</button>
            ${due > 0 && APP.can('purchases','edit') ? `<button title="${t('b_pay')}" data-act="pay">${ic('money')}</button>` : ''}
          </td></tr>`;}).join('') ||
          `<tr><td colspan="8"><div class="empty"><b>${t('nothing')}</b></div></td></tr>`}
      </tbody></table></div>${pagerHtml(d)}`;
    bindPager(box, p => { s.page = p; this.loadTable(); });
    $$('tbody tr[data-id]', box).forEach(tr => {
      tr.addEventListener('dblclick', () => this.view(+tr.dataset.id));
      $$('button[data-act]', tr).forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (b.dataset.act === 'view') this.view(+tr.dataset.id);
        if (b.dataset.act === 'pay') this.payForm(+tr.dataset.id);
      }));
    });
  },

  onKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && APP.can('purchases', 'add')) {
      e.preventDefault(); this.form(); return;
    }
    tableNav(e, $('#puTable'), tr => this.view(+tr.dataset.id));
  },

  async view(id) {
    const d = await api('purchases.get', { id });
    const p = d.purchase, due = +p.grand_total - +p.paid_amount;
    openModal({
      title: `${p.invoice_number} — ${p.supplier}`,
      wide: true,
      body: `
        <div class="row-flex mb small">
          <span class="mut">${fmt.date(p.purchase_date)}</span> ${statusBadge(p.payment_status)}
          ${due > 0 ? `<span class="money neg">${t('due')}: ${fmt.money(due)} ${CUR()}</span>` : ''}
        </div>
        <div class="tablewrap" style="box-shadow:none"><table class="grid"><thead><tr>
          <th>${t('t_medicine')}</th><th>${t('t_batch')}</th><th>${t('t_expiry')}</th>
          <th class="num">${t('t_qty')}</th><th class="num">Cost</th><th class="num">${t('total')}</th></tr></thead><tbody>
          ${d.items.map(it => `<tr>
            <td><b>${esc(it.medicine_name)}</b></td>
            <td class="mono small">${esc(it.batch_number || '—')}</td>
            <td class="small">${fmt.date(it.expiry_date)}</td>
            <td class="num">${fmt.num(it.quantity)}</td>
            <td class="num">${fmt.money(it.unit_cost)}</td>
            <td class="num"><b>${fmt.money(it.line_total)}</b></td></tr>`).join('')}
        </tbody></table></div>
        <div class="right mt small">
          Subtotal <b class="money">${fmt.money(p.subtotal)}</b>
          ${+p.discount ? ` · Discount −<b class="money">${fmt.money(p.discount)}</b>` : ''}
          ${+p.shipping ? ` · Shipping +<b class="money">${fmt.money(p.shipping)}</b>` : ''}
          ${+p.tax ? ` · Tax +<b class="money">${fmt.money(p.tax)}</b>` : ''}
          · <b>${t('total')} ${fmt.money(p.grand_total)} ${CUR()}</b>
          · ${t('paid')} <b class="money pos">${fmt.money(p.paid_amount)}</b>
        </div>
        ${p.notes ? `<p class="mut small mt">${esc(p.notes)}</p>` : ''}`,
      footer: `${APP.can('purchases','edit') ? `<button class="btn btn-ghost" id="pu_ret">${ic('upload')} ${t('b_return')}</button>` : ''}
               <button class="btn btn-ghost" onclick="window.print()">${ic('print')} ${t('b_print')}</button>
               <button class="btn btn-brand" onclick="closeModal()">${t('b_close')}</button>`,
    });
    const retBtn = document.querySelector('#pu_ret');
    if (retBtn) retBtn.addEventListener('click', () => { closeModal(); this.returnForm(id, d); });
  },

  /* v1.2 (SRS Module 5): send goods back to the supplier */
  async returnForm(id, d = null) {
    d = d || await api('purchases.get', { id });
    const p = d.purchase;
    const items = d.items.filter(it => +it.quantity > +(it.returned_quantity || 0));
    const REASONS = [['damaged','r_damaged'],['expired','r_expired'],['wrong_item','r_wrong'],
                     ['overstock','r_overstock'],['quality','r_quality'],['other','r_other']];
    const back = openModal({
      title: `${t('b_return')} — ${p.invoice_number}`,
      wide: true,
      body: items.length ? `
        <p class="small mut">${esc(p.supplier)} · ${fmt.date(p.purchase_date)} —
          stock goes back out of the batch this invoice created; the supplier balance is credited.</p>
        <div class="tablewrap" style="box-shadow:none"><table class="grid"><thead><tr>
          <th>${t('t_medicine')}</th><th>${t('t_batch')}</th><th class="num">Bought</th>
          <th class="num">Cost</th><th class="num" style="width:110px">${t('b_return')}</th></tr></thead><tbody>
          ${items.map(it => `<tr data-item="${it.id}" data-max="${it.quantity - (it.returned_quantity || 0)}">
            <td><b>${esc(it.medicine_name)}</b></td>
            <td class="mono small">${esc(it.batch_number || '—')}</td>
            <td class="num">${fmt.num(it.quantity - (it.returned_quantity || 0))}</td>
            <td class="num">${fmt.money(it.unit_cost)}</td>
            <td class="num"><input type="number" min="0" max="${it.quantity - (it.returned_quantity || 0)}" value="0"
              style="height:30px;width:80px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);padding:0 7px;font:600 13px var(--font-data);text-align:end"></td>
          </tr>`).join('')}
        </tbody></table></div>
        <div class="formgrid mt">
          <label class="fld"><span>${t('reason')} <span class="req">*</span></span>
            <select id="pr_reason">${REASONS.map(([v, k]) => `<option value="${v}">${t(k) || v}</option>`).join('')}</select></label>
          <label class="fld"><span>Note</span><input id="pr_note"></label>
        </div>` : `<div class="empty"><b>Everything on this invoice was already returned.</b></div>`,
      footer: `<button class="btn btn-ghost" onclick="closeModal()">${t('b_cancel')}</button>
               ${items.length ? `<button class="btn btn-brand" id="pr_save">${t('b_save')}</button>` : ''}`,
    });
    const save = $('#pr_save', back);
    if (save) save.addEventListener('click', async () => {
      const lines = $$('tr[data-item]', back)
        .map(tr => ({ purchase_item_id: +tr.dataset.item, quantity: Math.min(+tr.dataset.max, +$('input', tr).value || 0) }))
        .filter(l => l.quantity > 0);
      if (!lines.length) { toast(t('b_return') + '?', 'warn'); return; }
      try {
        const r = await api('purchases.return', {
          purchase_id: id, reason: $('#pr_reason', back).value,
          note: $('#pr_note', back).value.trim(), items: lines,
        });
        closeModal(back);
        toast(`${r.return_number} · ${fmt.money(r.total_value)} ${CUR()}`);
        this.loadTable();
      } catch (e) { toast(e.message, 'err'); }
    });
  },

  async payForm(id) {
    const d = await api('purchases.get', { id });
    const p = d.purchase, due = +p.grand_total - +p.paid_amount;
    const back = openModal({
      title: `${t('b_pay')} — ${p.invoice_number}`,
      body: `<p class="small mut">${p.supplier} · ${t('due')}: <b class="money neg">${fmt.money(due)} ${CUR()}</b></p>
        <label class="fld"><span>${t('t_amount')} <span class="req">*</span></span>
          <input id="pay_amt" type="number" min="0.01" step="0.01" max="${due}" value="${due}"></label>`,
      footer: `<button class="btn btn-ghost" onclick="closeModal()">${t('b_cancel')}</button>
               <button class="btn btn-brand" id="pay_go">${t('b_pay')}</button>`,
    });
    $('#pay_go', back).addEventListener('click', async () => {
      try {
        await api('purchases.pay', { id, amount: +$('#pay_amt', back).value || 0 });
        closeModal(back); toast(t('saved')); this.loadTable();
      } catch (e) { toast(e.message, 'err'); }
    });
  },

  async form() {
    const sups = this.sups || await loadSuppliers();
    const today = new Date().toISOString().slice(0, 10);
    const back = openModal({
      title: t('b_newpurch'),
      wide: true,
      body: `
        <div class="formgrid">
          <label class="fld"><span>${t('t_supplier')} <span class="req">*</span></span>
            <select id="np_sup">${selOpts(sups, 'id', 'name', 0, '—')}</select></label>
          <label class="fld"><span>${t('t_date')} <span class="req">*</span></span>
            <input id="np_date" type="date" value="${today}"></label>
          <label class="fld"><span>${t('t_invoice')}</span><input id="np_inv" placeholder="auto"></label>
          <label class="fld"><span>Notes</span><input id="np_notes"></label>
        </div>
        <div class="tablewrap mt" style="box-shadow:none"><table class="grid itemsgrid"><thead><tr>
          <th style="min-width:220px">${t('t_medicine')}</th><th>${t('t_batch')}</th><th>${t('t_expiry')}</th>
          <th style="width:80px">${t('t_qty')}</th><th style="width:100px">Cost</th>
          <th class="num" style="width:110px">${t('total')}</th><th style="width:30px"></th></tr></thead>
          <tbody id="np_items"></tbody></table></div>
        <button class="btn btn-ghost btn-sm mt" id="np_add">${ic('plus')} Item <span class="kbd">Ctrl ↵</span></button>
        <div class="formgrid mt">
          <label class="fld"><span>Discount</span><input id="np_disc" type="number" min="0" step="0.01" value="0"></label>
          <label class="fld"><span>Shipping</span><input id="np_ship" type="number" min="0" step="0.01" value="0"></label>
          <label class="fld"><span>Tax</span><input id="np_tax" type="number" min="0" step="0.01" value="0"></label>
          <label class="fld"><span>${t('paid')} (${CUR()})</span><input id="np_paid" type="number" min="0" step="0.01" value="0"></label>
        </div>
        <div class="right"><b style="font-size:17px" class="money">${t('total')}: <span id="np_total">0</span> ${CUR()}</b></div>`,
      footer: `<button class="btn btn-ghost" onclick="closeModal()">${t('b_cancel')}</button>
               <button class="btn btn-brand" id="np_save">${t('b_save')}</button>`,
    });

    const items = []; // {product_id, name, batch_number, expiry_date, quantity, unit_cost}
    const tbody = $('#np_items', back);
    const recalc = () => {
      const sub = items.reduce((a, it) => a + (it.quantity * it.unit_cost || 0), 0);
      const total = sub - (+$('#np_disc', back).value || 0) + (+$('#np_ship', back).value || 0) + (+$('#np_tax', back).value || 0);
      $('#np_total', back).textContent = fmt.money(total);
      $$('#np_items tr', back).forEach((tr, i) => {
        $('.linetotal', tr).textContent = fmt.money(items[i].quantity * items[i].unit_cost || 0);
      });
    };
    const addRow = () => {
      const i = items.length;
      items.push({ product_id: 0, quantity: 1, unit_cost: 0, batch_number: '', expiry_date: '' });
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><div class="autocomplete"><input class="np_prod" placeholder="${t('b_search')}…" autocomplete="off"><div class="acl" hidden></div></div></td>
        <td><input class="np_batch" placeholder="auto"></td>
        <td><input class="np_exp" type="date"></td>
        <td><input class="np_qty" type="number" min="1" value="1"></td>
        <td><input class="np_cost" type="number" min="0" step="0.01" value="0"></td>
        <td class="num linetotal">0</td>
        <td><button class="btn btn-ghost btn-sm np_del" tabindex="-1">${ic('x', 13)}</button></td>`;
      tbody.appendChild(tr);
      productAutocomplete($('.np_prod', tr), $('.acl', tr), (p) => {
        items[i].product_id = p.id;
        $('.np_prod', tr).value = p.medicine_name;
        if (!+$('.np_cost', tr).value) { $('.np_cost', tr).value = ''; }
        $('.np_qty', tr).focus(); $('.np_qty', tr).select();
      });
      $('.np_qty', tr).addEventListener('input', e => { items[i].quantity = +e.target.value || 0; recalc(); });
      $('.np_cost', tr).addEventListener('input', e => { items[i].unit_cost = +e.target.value || 0; recalc(); });
      $('.np_batch', tr).addEventListener('input', e => { items[i].batch_number = e.target.value.trim(); });
      $('.np_exp', tr).addEventListener('input', e => { items[i].expiry_date = e.target.value; });
      $('.np_del', tr).addEventListener('click', () => { items.splice(i, 1, { product_id: 0, quantity: 0, unit_cost: 0 }); tr.remove(); recalc(); });
      $('.np_prod', tr).focus();
    };
    $('#np_add', back).addEventListener('click', addRow);
    back.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); addRow(); }
    });
    ['np_disc', 'np_ship', 'np_tax'].forEach(id => $('#' + id, back).addEventListener('input', recalc));
    addRow();

    $('#np_save', back).addEventListener('click', async () => {
      const clean = items.filter(it => it.product_id > 0 && it.quantity > 0);
      try {
        await api('purchases.save', {
          supplier_id: +$('#np_sup', back).value || 0,
          purchase_date: $('#np_date', back).value,
          invoice_number: $('#np_inv', back).value.trim(),
          notes: $('#np_notes', back).value.trim(),
          discount: +$('#np_disc', back).value || 0,
          shipping: +$('#np_ship', back).value || 0,
          tax: +$('#np_tax', back).value || 0,
          paid_amount: +$('#np_paid', back).value || 0,
          items: clean,
        });
        closeModal(back); toast(t('saved')); this.loadTable();
        SCREENS.dash && go(APP.screen); // refresh current view
      } catch (e) { toast(e.message, 'err'); }
    });
  },
};

/* ======================================================= EXPENSES + INCOME (shared factory) */
function moneyScreen(kind) {
  // kind: 'expenses' | 'income'
  const isExp = kind === 'expenses';
  const isInc = kind === 'income';
  return {
    state: { page: 1, q: '', category_id: '', from: '', to: '' },
    async render(el) {
      const s = this.state;
      const cats = await api(`${kind}.categories`);
      this.cats = cats;
      el.innerHTML = `
        ${screenHead(isExp ? 'm_expenses' : 'm_income', null, APP.can(kind, 'add') ?
          `<button class="btn btn-brand" onclick="SCREENS.${kind}.form()">${ic('plus')} ${t(isExp ? 'b_newexp' : 'b_newincome')} <span class="keycap-inverse">Ctrl N</span></button>` : '')}
        <div class="filterbar">
          <input type="search" id="mQ" placeholder="${t('t_desc')}…" value="${esc(s.q)}">
          <select id="mCat">${selOpts(cats, 'id', 'name', s.category_id, t('f_allcat'))}</select>
          <input type="date" id="mFrom" value="${s.from}"> <input type="date" id="mTo" value="${s.to}">
        </div>
        <div id="mTable"><div class="spin"></div></div>`;
      let deb;
      $('#mQ', el).addEventListener('input', e => { clearTimeout(deb); deb = setTimeout(() => { s.q = e.target.value.trim(); s.page = 1; this.loadTable(); }, 220); });
      $('#mCat', el).addEventListener('change', e => { s.category_id = e.target.value; s.page = 1; this.loadTable(); });
      $('#mFrom', el).addEventListener('change', e => { s.from = e.target.value; s.page = 1; this.loadTable(); });
      $('#mTo', el).addEventListener('change', e => { s.to = e.target.value; s.page = 1; this.loadTable(); });
      await this.loadTable();
    },
    async loadTable() {
      const box = $('#mTable'); if (!box) return;
      const s = this.state;
      const d = await api(`${kind}.list`, { page: s.page, per: 25, q: s.q,
        category_id: +s.category_id || 0, from: s.from, to: s.to });
      const dateField = isExp ? 'expense_date' : 'income_date';
      box.innerHTML = `
        <div class="tablewrap"><table class="grid"><thead><tr>
          <th>${t('t_date')}</th><th>${t('t_cat')}</th><th>${t('t_desc')}</th>
          ${isExp ? `<th>${t('t_paidby')}</th>` : ''}
          <th class="num">${t('t_amount')}</th><th class="actions"></th></tr></thead><tbody>
          ${d.rows.map(r => `<tr data-id="${r.id}">
            <td class="mono small">${fmt.date(r[dateField])}</td>
            <td><span class="badge mut">${esc(r.category)}</span></td>
            <td><b>${esc(r.description || '—')}</b></td>
            ${isExp ? `<td class="small">${esc(r.paid_by || '—')}</td>` : ''}
            <td class="num"><b class="money ${isExp ? 'neg' : 'pos'}">${fmt.money(r.amount)}</b></td>
            <td class="actions">
              ${APP.can(kind,'edit') ? `<button data-act="edit" title="${t('b_edit')}">${ic('edit')}</button>` : ''}
              ${!isInc && APP.can(kind,'delete') ? `<button class="danger" data-act="del" title="${t('b_delete')}">${ic('trash')}</button>` : ''}
            </td></tr>`).join('') ||
            `<tr><td colspan="6"><div class="empty"><b>${t('nothing')}</b></div></td></tr>`}
        </tbody></table></div>
        <div class="row-flex mt" style="justify-content:flex-end">
          <b class="money">${t('total')}: ${fmt.money(d.sum)} ${CUR()}</b></div>
        ${pagerHtml(d)}`;
      bindPager(box, p => { s.page = p; this.loadTable(); });
      $$('tbody tr[data-id]', box).forEach(tr => {
        tr.addEventListener('dblclick', () => this.form(+tr.dataset.id, tr));
        $$('button[data-act]', tr).forEach(b => b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (b.dataset.act === 'edit') this.form(+tr.dataset.id);
          if (b.dataset.act === 'del') this.remove(+tr.dataset.id);
        }));
      });
      this.lastRows = d.rows;
    },
    onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && APP.can(kind, 'add')) {
        e.preventDefault(); this.form(); return;
      }
      tableNav(e, $('#mTable'), tr => this.form(+tr.dataset.id));
    },
    async form(id = null) {
      const row = id ? (this.lastRows || []).find(x => +x.id === id) || {} : {};
      const cats = this.cats;
      const today = new Date().toISOString().slice(0, 10);
      const dateField = isExp ? 'expense_date' : 'income_date';
      const catField = isExp ? 'expense_category_id' : 'income_category_id';
      const lockFields = isInc && id; // income: only the description can be changed once recorded
      const back = openModal({
        title: t(isExp ? 'b_newexp' : 'b_newincome'),
        body: `<div class="formgrid">
          ${lockFields ? `<p class="mut small full">This income entry is locked to keep the financial record accurate.
            Only the description can be changed — add a new entry instead if the amount or date was wrong.</p>` : ''}
          <label class="fld"><span>${t('t_cat')} <span class="req">*</span></span>
            <select id="e_cat" ${lockFields ? 'disabled' : ''}>${selOpts(cats, 'id', 'name', row[catField] || 0)}</select></label>
          <label class="fld"><span>${t('t_date')} <span class="req">*</span></span>
            <input id="e_date" type="date" value="${row[dateField] ? String(row[dateField]).slice(0,10) : today}" ${lockFields ? 'disabled' : ''}></label>
          <label class="fld"><span>${t('t_amount')} <span class="req">*</span></span>
            <input id="e_amt" type="number" min="0.01" step="0.01" value="${row.amount || ''}" ${lockFields ? 'disabled' : ''}></label>
          ${isExp ? `<label class="fld"><span>${t('t_paidby')}</span><input id="e_by" value="${esc(row.paid_by || '')}"></label>` : ''}
          <label class="fld full"><span>${t('t_desc')}</span><input id="e_desc" value="${esc(row.description || '')}"></label>
          ${isExp && id ? `
          <div class="fld full"><span>Attachment (v1.2 — receipt photo / PDF)</span>
            <div class="row-flex" style="align-items:center">
              ${row.attachment_path ? `<a class="btn btn-ghost btn-sm" href="${esc(row.attachment_path)}" target="_blank">${ic('eye')} ${t('hint_open')}</a>` : ''}
              <input type="file" id="e_att" accept=".jpg,.jpeg,.png,.webp,.pdf" style="border:0;padding:0">
              <button class="btn btn-ghost btn-sm" id="e_attup">${ic('upload')} Upload</button>
              ${row.attachment_path ? `<button class="btn btn-ghost btn-sm" id="e_attrm">${ic('trash')}</button>` : ''}
            </div></div>` : ''}
        </div>`,
        footer: `<button class="btn btn-ghost" onclick="closeModal()">${t('b_cancel')}</button>
                 <button class="btn btn-brand" id="e_save">${t('b_save')}</button>`,
      });
      const attUp = $('#e_attup', back);
      if (attUp) attUp.addEventListener('click', async () => {
        const f = $('#e_att', back).files[0];
        if (!f) { toast('Choose a file first.', 'warn'); return; }
        try { await apiUpload('expenses.uploadAttachment', { id }, { file: f }); toast(t('saved')); this.loadTable(); }
        catch (e2) { toast(e2.message, 'err'); }
      });
      const attRm = $('#e_attrm', back);
      if (attRm) attRm.addEventListener('click', async () => {
        try { await api('expenses.removeAttachment', { id }); toast(t('deleted')); closeModal(back); this.loadTable(); }
        catch (e2) { toast(e2.message, 'err'); }
      });

      $('#e_save', back).addEventListener('click', async () => {
        const payload = {
          id: id || 0,
          [catField]: +$('#e_cat', back).value || 0,
          [dateField]: $('#e_date', back).value,
          amount: +$('#e_amt', back).value || 0,
          description: $('#e_desc', back).value.trim(),
        };
        if (isExp) payload.paid_by = $('#e_by', back).value.trim();
        try {
          await api(`${kind}.save`, payload);
          closeModal(back); toast(t('saved')); this.loadTable();
        } catch (e) { toast(e.message, 'err'); }
      });
    },
    async remove(id) {
      if (!await confirmBox(t('confirm_del'), t('confirm_del_sub'))) return;
      try { await api(`${kind}.delete`, { id }); toast(t('deleted')); this.loadTable(); }
      catch (e) { toast(e.message, 'err'); }
    },
  };
}
SCREENS.expenses = moneyScreen('expenses');
SCREENS.income   = moneyScreen('income');

/* ======================================================= SUPPLIERS */
SCREENS.suppliers = {
  state: { page: 1, q: '' },
  async render(el) {
    const s = this.state;
    el.innerHTML = `
      ${screenHead('m_suppliers', null, APP.can('suppliers','add') ?
        `<button class="btn btn-brand" onclick="SCREENS.suppliers.form()">${ic('plus')} ${t('b_newsupplier')}</button>` : '')}
      <div class="filterbar">
        <input type="search" id="sQ" placeholder="${t('b_search')}…" value="${esc(s.q)}">
      </div>
      <div id="sTable"><div class="spin"></div></div>`;
    let deb;
    $('#sQ', el).addEventListener('input', e => { clearTimeout(deb); deb = setTimeout(() => { s.q = e.target.value.trim(); s.page = 1; this.loadTable(); }, 220); });
    await this.loadTable();
  },

  async loadTable() {
    const box = $('#sTable'); if (!box) return;
    const s = this.state;
    const d = await api('suppliers.list', { page: s.page, per: 25, q: s.q });
    box.innerHTML = `
      <div class="tablewrap"><table class="grid"><thead><tr>
        <th>${t('t_name')}</th><th>Contact</th><th>${t('t_phone')}</th>
        <th class="num">Purchases</th><th class="num">${t('t_balance')}</th><th class="actions"></th></tr></thead><tbody>
        ${d.rows.map(r => `<tr data-id="${r.id}">
          <td><b>${esc(r.name)}</b>${+r.status ? '' : ` <span class="badge mut">inactive</span>`}</td>
          <td class="small">${esc(r.contact_person || '—')}</td>
          <td class="mono small">${esc(r.phone || '—')}</td>
          <td class="num">${fmt.num(r.purchase_count)}</td>
          <td class="num"><b class="money ${+r.balance > 0 ? 'neg' : ''}">${fmt.money(r.balance)}</b></td>
          <td class="actions">
            <button data-act="ledger" title="Ledger">${ic('ledger')}</button>
            ${+r.balance > 0 && APP.can('suppliers','edit') ? `<button data-act="pay" title="${t('b_pay')}">${ic('money')}</button>` : ''}
            ${APP.can('suppliers','edit') ? `<button data-act="edit" title="${t('b_edit')}">${ic('edit')}</button>` : ''}
            ${APP.can('suppliers','delete') ? `<button class="danger" data-act="del" title="${t('b_delete')}">${ic('trash')}</button>` : ''}
          </td></tr>`).join('') ||
          `<tr><td colspan="6"><div class="empty"><b>${t('nothing')}</b></div></td></tr>`}
      </tbody></table></div>${pagerHtml(d)}`;
    bindPager(box, p => { s.page = p; this.loadTable(); });
    this.lastRows = d.rows;
    $$('tbody tr[data-id]', box).forEach(tr => {
      tr.addEventListener('dblclick', () => this.ledger(+tr.dataset.id));
      $$('button[data-act]', tr).forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = +tr.dataset.id;
        if (b.dataset.act === 'ledger') this.ledger(id);
        if (b.dataset.act === 'pay') this.payForm(id);
        if (b.dataset.act === 'edit') this.form(id);
        if (b.dataset.act === 'del') this.remove(id);
      }));
    });
  },

  onKey(e) { tableNav(e, $('#sTable'), tr => this.ledger(+tr.dataset.id)); },
  openItem(id) { this.ledger(id); },

  async form(id = null) {
    const r = id ? (this.lastRows || []).find(x => +x.id === id) || {} : {};
    const back = openModal({
      title: id ? `${t('b_edit')} — ${r.name}` : t('b_newsupplier'),
      body: `<div class="formgrid">
        <label class="fld full"><span>${t('t_name')} <span class="req">*</span></span>
          <input id="su_name" value="${esc(r.name || '')}"></label>
        <label class="fld"><span>Contact</span><input id="su_contact" value="${esc(r.contact_person || '')}"></label>
        <label class="fld"><span>${t('t_phone')}</span><input id="su_phone" value="${esc(r.phone || '')}"></label>
        <label class="fld"><span>Email</span><input id="su_email" type="email" value="${esc(r.email || '')}"></label>
        <label class="fld"><span>Status</span>
          <select id="su_status"><option value="1">active</option>
          <option value="0" ${r.status !== undefined && !+r.status ? 'selected' : ''}>inactive</option></select></label>
        <label class="fld full"><span>Address</span><input id="su_addr" value="${esc(r.address || '')}"></label>
        <label class="fld full"><span>Notes</span><input id="su_notes" value="${esc(r.notes || '')}"></label>
      </div>`,
      footer: `<button class="btn btn-ghost" onclick="closeModal()">${t('b_cancel')}</button>
               <button class="btn btn-brand" id="su_save">${t('b_save')}</button>`,
    });
    $('#su_save', back).addEventListener('click', async () => {
      try {
        await api('suppliers.save', {
          id: id || 0,
          name: $('#su_name', back).value.trim(),
          contact_person: $('#su_contact', back).value.trim(),
          phone: $('#su_phone', back).value.trim(),
          email: $('#su_email', back).value.trim(),
          address: $('#su_addr', back).value.trim(),
          notes: $('#su_notes', back).value.trim(),
          status: +$('#su_status', back).value,
        });
        closeModal(back); toast(t('saved')); this.loadTable();
      } catch (e) { toast(e.message, 'err'); }
    });
  },

  async ledger(id) {
    const r = (this.lastRows || []).find(x => +x.id === id) || {};
    const d = await api('suppliers.ledger', { id, page: 1, per: 50 });
    openModal({
      title: `Ledger — ${r.name || '#' + id}`,
      wide: true,
      body: `
        <p class="small mut">${t('t_balance')}: <b class="money ${+r.balance > 0 ? 'neg' : 'pos'}">${fmt.money(r.balance)} ${CUR()}</b></p>
        <div class="tablewrap" style="box-shadow:none;max-height:380px"><table class="grid"><thead><tr>
          <th>${t('t_date')}</th><th>${t('t_type')}</th><th>Note</th>
          <th class="num">Debit</th><th class="num">Credit</th><th class="num">${t('t_balance')}</th></tr></thead><tbody>
          ${d.rows.map(l => `<tr>
            <td class="mono small">${esc(String(l.created_at).slice(0, 16))}</td>
            <td><span class="badge ${l.entry_type === 'debit' ? 'bad' : 'ok'}">${esc(l.entry_type)}</span></td>
            <td class="small">${esc(l.note || '')}</td>
            <td class="num money neg">${l.entry_type === 'debit' ? fmt.money(l.amount) : ''}</td>
            <td class="num money pos">${l.entry_type === 'credit' ? fmt.money(l.amount) : ''}</td>
            <td class="num"><b>${fmt.money(l.balance_after)}</b></td></tr>`).join('') ||
            `<tr><td colspan="6"><div class="empty">${t('nothing')}</div></td></tr>`}
        </tbody></table></div>`,
      footer: `<button class="btn btn-brand" onclick="closeModal()">${t('b_close')}</button>`,
    });
  },

  async payForm(id) {
    const r = (this.lastRows || []).find(x => +x.id === id) || {};
    const back = openModal({
      title: `${t('b_pay')} — ${r.name}`,
      body: `<p class="small mut">${t('t_balance')}: <b class="money neg">${fmt.money(r.balance)} ${CUR()}</b></p>
        <label class="fld"><span>${t('t_amount')} <span class="req">*</span></span>
          <input id="sp_amt" type="number" min="0.01" step="0.01" max="${r.balance}" value="${r.balance}"></label>
        <label class="fld"><span>Note</span><input id="sp_note"></label>`,
      footer: `<button class="btn btn-ghost" onclick="closeModal()">${t('b_cancel')}</button>
               <button class="btn btn-brand" id="sp_go">${t('b_pay')}</button>`,
    });
    $('#sp_go', back).addEventListener('click', async () => {
      try {
        await api('suppliers.pay', { id, amount: +$('#sp_amt', back).value || 0, note: $('#sp_note', back).value.trim() });
        closeModal(back); toast(t('saved')); this.loadTable();
      } catch (e) { toast(e.message, 'err'); }
    });
  },

  async remove(id) {
    if (!await confirmBox(t('confirm_del'), t('confirm_del_sub'))) return;
    try { await api('suppliers.delete', { id }); toast(t('deleted')); this.loadTable(); }
    catch (e) { toast(e.message, 'err'); }
  },
};

/* ======================================================= CATEGORIES */
SCREENS.categories = {
  async render(el) {
    const cats = await loadCategories();
    this.cats = cats;
    el.innerHTML = `
      ${screenHead('m_categories', null, APP.can('categories','add') ?
        `<button class="btn btn-brand" onclick="SCREENS.categories.form()">${ic('plus')} ${t('b_newcategory')}</button>` : '')}
      <div class="tablewrap"><table class="grid"><thead><tr>
        <th>${t('t_name')}</th><th class="num">${t('products_w')}</th><th class="actions"></th></tr></thead><tbody>
        ${cats.map(c => `<tr data-id="${c.id}">
          <td style="padding-inline-start:${12 + (c.depth || 0) * 22}px">
            ${c.depth ? '<span class="mut">└ </span>' : ''}${c.color ? `<span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${esc(c.color)};margin-inline-end:6px"></span>` : ''}${c.icon && ICONS[c.icon] ? `<span style="color:var(--muted);vertical-align:-2px;margin-inline-end:4px">${ic(c.icon, 13)}</span>` : ''}<b>${esc(c.name)}</b>
            ${c.name_fa ? `<span class="mut small"> · ${esc(c.name_fa)}</span>` : ''}</td>
          <td class="num">${fmt.num(c.product_count)}</td>
          <td class="actions">
            ${APP.can('categories','edit') ? `<button data-act="edit" title="${t('b_edit')}">${ic('edit')}</button>` : ''}
            ${APP.can('categories','delete') ? `<button class="danger" data-act="del" title="${t('b_delete')}">${ic('trash')}</button>` : ''}
          </td></tr>`).join('') ||
          `<tr><td colspan="3"><div class="empty"><b>${t('nothing')}</b></div></td></tr>`}
      </tbody></table></div>`;
    $$('tbody tr[data-id]', el).forEach(tr => {
      $$('button[data-act]', tr).forEach(b => b.addEventListener('click', () => {
        if (b.dataset.act === 'edit') this.form(+tr.dataset.id);
        if (b.dataset.act === 'del') this.remove(+tr.dataset.id);
      }));
    });
  },

  form(id = null) {
    const c = id ? (this.cats || []).find(x => +x.id === id) || {} : {};
    const back = openModal({
      title: id ? `${t('b_edit')} — ${c.name}` : t('b_newcategory'),
      body: `<div class="formgrid">
        <label class="fld"><span>${t('t_name')} (EN) <span class="req">*</span></span>
          <input id="c_name" value="${esc(c.name || '')}"></label>
        <label class="fld"><span>${t('t_name')} (دری)</span>
          <input id="c_namefa" dir="rtl" value="${esc(c.name_fa || '')}"></label>
        <label class="fld"><span>Icon (v1.2)</span>
          <select id="c_icon"><option value="">—</option>
            ${['pill','box','cart','truck','coins','wallet','shield','tags','chart','cap']
              .map(i => `<option value="${i}" ${c.icon === i ? 'selected' : ''}>${i}</option>`).join('')}</select></label>
        <label class="fld"><span>Colour label (v1.2)</span>
          <input id="c_color" type="color" value="${esc(c.color || '#0E7A5F')}" style="height:38px;padding:3px"></label>
        <label class="fld full"><span>Parent</span>
          <select id="c_parent">
            <option value="">—</option>
            ${(this.cats || []).filter(x => !x.depth && +x.id !== id).map(x =>
              `<option value="${x.id}" ${+c.parent_id === +x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
          </select></label>
      </div>`,
      footer: `<button class="btn btn-ghost" onclick="closeModal()">${t('b_cancel')}</button>
               <button class="btn btn-brand" id="c_save">${t('b_save')}</button>`,
    });
    $('#c_save', back).addEventListener('click', async () => {
      try {
        await api('categories.save', {
          id: id || 0,
          name: $('#c_name', back).value.trim(),
          name_fa: $('#c_namefa', back).value.trim(),
          icon: $('#c_icon', back).value,
          color: $('#c_color', back).value,
          parent_id: +$('#c_parent', back).value || 0,
        });
        closeModal(back); toast(t('saved')); go('categories');
      } catch (e) { toast(e.message, 'err'); }
    });
  },

  async remove(id) {
    if (!await confirmBox(t('confirm_del'), t('confirm_del_sub'))) return;
    try { await api('categories.delete', { id }); toast(t('deleted')); go('categories'); }
    catch (e) { toast(e.message, 'err'); }
  },
};

/* ======================================================= REPORTS */
SCREENS.reports = {
  state: { type: 'financial', from: '', to: '', days: 90 },
  async render(el) {
    const s = this.state;
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + '01';
    s.from = s.from || monthStart; s.to = s.to || today;
    const TYPES = [
      ['financial', 'Financial summary (P&L)'], ['sales', 'Sales (POS)'],
      ['cashiersales', 'Cashier sales'], ['returns', 'Sales returns'], ['bestsellers', 'Best sellers'],
      ['worstsellers', 'Worst sellers'], ['cashflow', 'Cash flow'],
      ['inventory', 'Inventory value'],
      ['lowstock', t('h_lowstock')], ['expiry', t('h_expiry')], ['deadstock', 'Dead stock'],
      ['purchases', t('m_purchases')], ['expenses', t('m_expenses')], ['income', t('m_income')],
    ];
    el.innerHTML = `
      ${screenHead('m_reports')}
      <div class="filterbar">
        <select id="rType">${TYPES.map(([v, l]) => `<option value="${v}" ${s.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input type="date" id="rFrom" value="${s.from}"> <input type="date" id="rTo" value="${s.to}">
        <select id="rGroup" hidden>
          ${[['day','Daily'],['week','Weekly'],['month','Monthly'],['year','Yearly']].map(([v,l]) =>
            `<option value="${v}" ${(s.group || 'day') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select id="rDays" hidden>
          ${[[90,'≤ 90 d'],[60,'≤ 60 d'],[30,'≤ 30 d'],[15,'≤ 15 d'],[-1,t('ex')]].map(([v,l]) =>
            `<option value="${v}" ${+s.days === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn btn-brand" id="rRun">${ic('chart')} ${t('b_run')}</button>
        ${APP.can('reports','export') ? `<button class="btn btn-ghost" id="rCsv">${ic('download')} CSV</button>` : ''}
        <button class="btn btn-ghost" id="rPrint">${ic('print')} ${t('b_print')}</button>
      </div>
      <div id="rOut" class="mt"><div class="empty"><b>${t('b_run')}</b></div></div>`;

    const syncFields = () => {
      const rt = $('#rType', el).value;
      const dated = ['financial', 'purchases', 'expenses', 'income', 'sales', 'bestsellers',
                     'worstsellers', 'cashflow', 'cashiersales', 'returns'].includes(rt);
      $('#rGroup', el).hidden = rt !== 'sales';
      const dayed = ['expiry', 'deadstock'].includes($('#rType', el).value);
      $('#rFrom', el).hidden = $('#rTo', el).hidden = !dated;
      $('#rDays', el).hidden = !dayed;
    };
    $('#rType', el).addEventListener('change', () => { s.type = $('#rType', el).value; syncFields(); });
    syncFields();
    $('#rRun', el).addEventListener('click', () => this.run());
    const csv = $('#rCsv', el);
    if (csv) csv.addEventListener('click', () => {
      const s2 = this.collect(el);
      dl(`api.php?action=reports.run&type=${s2.type}&from=${s2.from}&to=${s2.to}&days=${s2.days}&group=${s2.group || 'day'}&format=csv`);
    });
    $('#rPrint', el).addEventListener('click', () => window.print());
    await this.run();
  },

  collect(el) {
    const s = this.state;
    s.type = $('#rType', el || document).value;
    s.from = $('#rFrom', el || document).value;
    s.to   = $('#rTo', el || document).value;
    s.days = +$('#rDays', el || document).value;
    s.group = $('#rGroup', el || document).value;
    return s;
  },

  async run() {
    const box = $('#rOut'); if (!box) return;
    const s = this.collect();
    box.innerHTML = '<div class="spin"></div>';
    try {
      const d = await api('reports.run', s);
      box.innerHTML = `
        <div class="card-a cardpad">
          <h2 class="display-face" style="font-size:16px;margin:0 0 2px">${esc(d.title)}</h2>
          <div class="mut small mb">${APP.settings.pharmacy_name || ''} · ${new Date().toLocaleString()}</div>
          <div class="tablewrap" style="box-shadow:none"><table class="grid"><thead><tr>
            ${d.header.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
            ${d.rows.map(r => `<tr>${r.map((v, i) => {
              const isNum = typeof v === 'number' || (v !== '' && v !== null && !isNaN(v) && i > 0);
              return `<td class="${isNum ? 'num money' : ''}">${isNum ? fmt.money(v) : esc(v ?? '—')}</td>`;
            }).join('')}</tr>`).join('') ||
            `<tr><td colspan="${d.header.length}"><div class="empty">${t('nothing')}</div></td></tr>`}
          </tbody></table></div>
          ${d.summary ? `<div class="right mt">${Object.entries(d.summary).map(([k, v]) =>
            `<span class="small mut" style="margin-inline-start:16px">${esc(k)}: <b class="money" style="color:var(--ink)">${fmt.money(v)}</b></span>`).join('')}</div>` : ''}
        </div>`;
    } catch (e) {
      box.innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`;
    }
  },
};

/* ======================================================= USERS */
SCREENS.users = {
  async render(el) {
    if (!APP.can('users', 'view')) {
      el.innerHTML = `${screenHead('m_users')}
        <div class="card-a cardpad">
          <p class="mut">Only the owner can manage users. You can change your own password:</p>
          <button class="btn btn-brand" onclick="SCREENS.users.pwForm()">${ic('shield')} ${t('b_changepw')}</button>
        </div>`;
      return;
    }
    const rows = await api('users.list');
    this.rows = rows;
    el.innerHTML = `
      ${screenHead('m_users', null, `
        <button class="btn btn-ghost" onclick="SCREENS.users.pwForm()">${ic('shield')} ${t('b_changepw')}</button>
        <button class="btn btn-brand" onclick="SCREENS.users.form()">${ic('plus')} ${t('b_newuser')}</button>`)}
      <div class="tablewrap"><table class="grid"><thead><tr>
        <th>${t('t_name')}</th><th>Username</th><th>${t('t_role')}</th><th>${t('t_phone')}</th>
        <th>Last sign-in</th><th>${t('t_status')}</th><th class="actions"></th></tr></thead><tbody>
        ${rows.map(u => `<tr data-id="${u.id}">
          <td><b>${esc(u.full_name)}</b></td>
          <td class="mono">${esc(u.username)}</td>
          <td><span class="badge ${u.role === 'owner' ? 'ok' : 'mut'}">${esc(u.role)}</span></td>
          <td class="mono small">${esc(u.phone || '—')}</td>
          <td class="mono small">${u.last_login_at ? esc(String(u.last_login_at).slice(0, 16)) : '—'}</td>
          <td>${+u.status ? `<span class="badge ok">active</span>` : `<span class="badge bad">off</span>`}</td>
          <td class="actions">
            <button data-act="edit" title="${t('b_edit')}">${ic('edit')}</button>
            ${+u.id !== +APP.user.id ? `<button class="danger" data-act="del" title="${t('b_delete')}">${ic('trash')}</button>` : ''}
          </td></tr>`).join('')}
      </tbody></table></div>`;
    $$('tbody tr[data-id]', el).forEach(tr => {
      $$('button[data-act]', tr).forEach(b => b.addEventListener('click', () => {
        if (b.dataset.act === 'edit') this.form(+tr.dataset.id);
        if (b.dataset.act === 'del') this.remove(+tr.dataset.id);
      }));
    });
  },

  form(id = null) {
    const u = id ? (this.rows || []).find(x => +x.id === id) || {} : {};
    const roles = ['owner', 'manager', 'storekeeper', 'accountant', 'cashier'];
    const back = openModal({
      title: id ? `${t('b_edit')} — ${u.full_name}` : t('b_newuser'),
      body: `<div class="formgrid">
        <label class="fld"><span>${t('t_name')} <span class="req">*</span></span>
          <input id="u_full" value="${esc(u.full_name || '')}"></label>
        <label class="fld"><span>Username <span class="req">*</span></span>
          <input id="u_user" value="${esc(u.username || '')}" ${id ? 'readonly' : ''}></label>
        <label class="fld"><span>${t('t_role')}</span>
          <select id="u_role">${roles.map(r => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
        <label class="fld"><span>${t('t_phone')}</span><input id="u_phone" value="${esc(u.phone || '')}"></label>
        <label class="fld"><span>Password ${id ? '(leave blank to keep)' : '<span class="req">*</span>'}</span>
          <input id="u_pass" type="password" autocomplete="new-password"></label>
        <label class="fld"><span>${t('t_status')}</span>
          <select id="u_status"><option value="1">active</option>
          <option value="0" ${u.status !== undefined && !+u.status ? 'selected' : ''}>inactive</option></select></label>
      </div>`,
      footer: `<button class="btn btn-ghost" onclick="closeModal()">${t('b_cancel')}</button>
               <button class="btn btn-brand" id="u_save">${t('b_save')}</button>`,
    });
    $('#u_save', back).addEventListener('click', async () => {
      try {
        await api('users.save', {
          id: id || 0,
          full_name: $('#u_full', back).value.trim(),
          username: $('#u_user', back).value.trim(),
          role: $('#u_role', back).value,
          phone: $('#u_phone', back).value.trim(),
          password: $('#u_pass', back).value,
          status: +$('#u_status', back).value,
        });
        closeModal(back); toast(t('saved')); go('users');
      } catch (e) { toast(e.message, 'err'); }
    });
  },

  pwForm() {
    const back = openModal({
      title: t('b_changepw'),
      body: `
        <label class="fld"><span>Current password</span>
          <input id="pw_cur" type="password" autocomplete="current-password"></label>
        <label class="fld"><span>New password (min 6)</span>
          <input id="pw_new" type="password" autocomplete="new-password"></label>`,
      footer: `<button class="btn btn-ghost" onclick="closeModal()">${t('b_cancel')}</button>
               <button class="btn btn-brand" id="pw_save">${t('b_save')}</button>`,
    });
    $('#pw_save', back).addEventListener('click', async () => {
      try {
        await api('users.changePassword', {
          current_password: $('#pw_cur', back).value,
          new_password: $('#pw_new', back).value,
        });
        closeModal(back); toast(t('saved'));
      } catch (e) { toast(e.message, 'err'); }
    });
  },

  async remove(id) {
    if (!await confirmBox(t('confirm_del'), t('confirm_del_sub'))) return;
    try { await api('users.delete', { id }); toast(t('deleted')); go('users'); }
    catch (e) { toast(e.message, 'err'); }
  },
};

/* ======================================================= BACKUP */
SCREENS.backup = {
  async render(el) {
    const rows = await api('backup.list');
    el.innerHTML = `
      ${screenHead('m_backup', null, APP.can('backup','backup') ?
        `<button class="btn btn-brand" id="bkNow">${ic('shield')} ${t('b_backupnow')}</button>` : '')}
      <div class="tablewrap"><table class="grid"><thead><tr>
        <th>File</th><th>${t('t_date')}</th><th class="num">Size</th><th>Method</th><th class="actions"></th></tr></thead><tbody>
        ${rows.map(b => `<tr data-id="${b.id}">
          <td class="mono small">${esc(b.filename)} ${b.exists ? '' : `<span class="badge bad">missing</span>`}</td>
          <td class="mono small">${esc(String(b.created_at).slice(0, 16))}</td>
          <td class="num mono small">${fmt.num(Math.round(b.size_bytes / 1024))} KB</td>
          <td><span class="badge mut">${esc(b.method)}</span></td>
          <td class="actions">
            ${b.exists ? `<button data-act="dl" title="Download">${ic('download')}</button>` : ''}
            ${b.exists && APP.can('backup','restore') ? `<button data-act="restore" title="${t('b_restore')}">${ic('upload')}</button>` : ''}
            ${APP.can('backup','delete') ? `<button class="danger" data-act="del" title="${t('b_delete')}">${ic('trash')}</button>` : ''}
          </td></tr>`).join('') ||
          `<tr><td colspan="5"><div class="empty"><b>${t('nothing')}</b></div></td></tr>`}
      </tbody></table></div>
      <p class="mut small mt">Backups are saved to the <span class="mono">backups/</span> folder next to the app.
      Copy them to a USB drive regularly.</p>`;
    const now = $('#bkNow', el);
    if (now) now.addEventListener('click', async () => {
      now.disabled = true; now.textContent = t('loading');
      try { const r = await api('backup.create'); toast(`${r.filename} · ${Math.round(r.size_bytes / 1024)} KB`); go('backup'); }
      catch (e) { toast(e.message, 'err'); now.disabled = false; }
    });
    $$('tbody tr[data-id]', el).forEach(tr => {
      $$('button[data-act]', tr).forEach(b => b.addEventListener('click', async () => {
        const id = +tr.dataset.id;
        if (b.dataset.act === 'dl') dl('api.php?action=backup.download&id=' + id);
        if (b.dataset.act === 'restore') {
          if (!await confirmBox(t('b_restore') + '?', 'Current data will be replaced by this backup. This cannot be undone.')) return;
          try { await api('backup.restore', { id }); toast(t('saved')); go('dash'); }
          catch (e) { toast(e.message, 'err'); }
        }
        if (b.dataset.act === 'del') {
          if (!await confirmBox(t('confirm_del'), '')) return;
          try { await api('backup.delete', { id }); toast(t('deleted')); go('backup'); }
          catch (e) { toast(e.message, 'err'); }
        }
      }));
    });
  },
};

/* ======================================================= SETTINGS */
SCREENS.settings = {
  async render(el) {
    const s = await api('settings.get');
    APP.settings = s;
    const canEdit = APP.can('settings', 'edit');
    const F = (key, label, type = 'text', extra = '') => `
      <label class="fld"><span>${label}</span>
        <input id="st_${key}" type="${type}" value="${esc(s[key] ?? '')}" ${canEdit ? '' : 'readonly'} ${extra}></label>`;
    el.innerHTML = `
      ${screenHead('m_settings')}
      <div class="card-a cardpad" style="max-width:760px">
        <div class="formgrid">
          ${F('pharmacy_name', 'Pharmacy name (EN)')}
          <label class="fld"><span>Pharmacy name (دری)</span>
            <input id="st_pharmacy_name_fa" dir="rtl" value="${esc(s.pharmacy_name_fa ?? '')}" ${canEdit ? '' : 'readonly'}></label>
          <div class="fld full"><span>Company logo (v1.2 — shown on receipts)</span>
            <div class="row-flex" style="align-items:center">
              <img id="st_logoimg" src="${s.logo_path ? esc(s.logo_path) : ''}" alt=""
                   style="height:44px;border-radius:8px;border:1px solid var(--line);${s.logo_path ? '' : 'display:none'}">
              ${canEdit ? `<input type="file" id="st_logofile" accept=".jpg,.jpeg,.png,.webp" style="border:0;padding:0">
              <button class="btn btn-ghost btn-sm" id="st_logoup">${ic('upload')} Upload</button>
              <button class="btn btn-ghost btn-sm" id="st_logorm" ${s.logo_path ? '' : 'hidden'}>${ic('trash')}</button>` : ''}
            </div></div>
          ${F('pharmacy_phone', t('t_phone'))}
          ${F('pharmacy_email', 'Email', 'email')}
          <label class="fld full"><span>Address</span>
            <input id="st_pharmacy_address" value="${esc(s.pharmacy_address ?? '')}" ${canEdit ? '' : 'readonly'}></label>
          ${F('currency', 'Currency code')}
          ${F('currency_symbol', 'Currency symbol')}
          ${F('low_stock_threshold', 'Default low-stock threshold', 'number', 'min="1"')}
          ${F('expiry_warning_days', 'Expiry warning (days)', 'number', 'min="1"')}
          ${F('max_discount_percent', 'POS max discount % (cashiers)', 'number', 'min="0" max="100"')}
          ${F('hold_expire_days', 'Held sales expire after (days)', 'number', 'min="1"')}
          ${F('receipt_footer', 'Receipt footer message')}
          <label class="fld"><span>Language</span>
            <select id="st_language" ${canEdit ? '' : 'disabled'}>
              ${[['en', 'English'], ['fa', 'دری'], ['ps', 'پښتو']].map(([v, l]) =>
                `<option value="${v}" ${s.language === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="fld"><span>Theme</span>
            <select id="st_theme" ${canEdit ? '' : 'disabled'}>
              <option value="light" ${s.theme === 'light' ? 'selected' : ''}>light</option>
              <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>dark</option></select></label>
        </div>
        ${canEdit ? `<div class="right mt"><button class="btn btn-brand" id="stSave">${t('b_save')} <span class="keycap-inverse">Ctrl S</span></button></div>` : ''}
      </div>
      <p class="mut small mt">App v${window.APP_VERSION || ''} · DB: ${esc('arya_pharma')} · PHP Desktop offline build</p>`;
    const lu = $('#st_logoup', el);
    if (lu) lu.addEventListener('click', async () => {
      const f = $('#st_logofile', el).files[0];
      if (!f) { toast('Choose an image first.', 'warn'); return; }
      try {
        const r = await apiUpload('settings.uploadLogo', {}, { logo: f });
        APP.settings.logo_path = r.logo_path;
        const img = $('#st_logoimg', el); img.src = r.logo_path + '?' + Date.now(); img.style.display = '';
        $('#st_logorm', el).hidden = false; toast(t('saved'));
      } catch (e2) { toast(e2.message, 'err'); }
    });
    const lr = $('#st_logorm', el);
    if (lr) lr.addEventListener('click', async () => {
      try {
        await api('settings.removeLogo'); APP.settings.logo_path = '';
        $('#st_logoimg', el).style.display = 'none'; lr.hidden = true; toast(t('deleted'));
      } catch (e2) { toast(e2.message, 'err'); }
    });

    const btn = $('#stSave', el);
    if (btn) btn.addEventListener('click', async () => {
      const keys = ['pharmacy_name', 'pharmacy_name_fa', 'pharmacy_address', 'pharmacy_phone',
        'pharmacy_email', 'currency', 'currency_symbol', 'low_stock_threshold',
        'expiry_warning_days', 'max_discount_percent', 'receipt_footer', 'hold_expire_days', 'language', 'theme'];
      const payload = {};
      keys.forEach(k => { const f = $('#st_' + k, el); if (f) payload[k] = f.value; });
      try {
        APP.settings = await api('settings.save', payload);
        toast(t('saved'));
        if (payload.language !== LANG) { applyLang(payload.language); go('settings'); }
      } catch (e) { toast(e.message, 'err'); }
    });
  },
  onKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      const b = $('#stSave'); if (b) { e.preventDefault(); b.click(); }
    }
  },
};

/* ======================================================= AUDIT LOG (v1.2, owner) */
/* ======================================================= AUDIT LOG — plain-language helpers */
const AUDIT_ENTITY_NAMES = {
  products: 'product', product_batches: 'product batch', categories: 'category',
  suppliers: 'supplier', purchases: 'purchase', purchase_items: 'purchase item',
  purchase_returns: 'purchase return', inventory: 'inventory', expenses: 'expense',
  incomes: 'income entry', income_categories: 'income category', expense_categories: 'expense category',
  sales: 'sale', sale_items: 'sale item', sale_returns: 'sale return', sale_payments: 'payment',
  users: 'user account', backups: 'backup', settings: 'settings',
};
const AUDIT_ACTION_VERBS = {
  create: 'Added', update: 'Updated', delete: 'Deleted', restore: 'Restored',
  'return': 'Returned', cancel: 'Cancelled', login: 'Signed in', logout: 'Signed out',
};
const AUDIT_FIELD_LABELS = {
  medicine_name: 'Medicine', generic_name: 'Generic name', brand_name: 'Brand name',
  product_code: 'Product code', barcode: 'Barcode', category_id: 'Category',
  income_category_id: 'Category', expense_category_id: 'Category', supplier_id: 'Supplier',
  purchase_price: 'Buy price', selling_price: 'Sell price', min_quantity: 'Minimum quantity',
  quantity: 'Quantity', location: 'Location', description: 'Description', unit: 'Unit',
  status: 'Status', full_name: 'Full name', username: 'Username', role: 'Role',
  phone: 'Phone number', password: 'Password', password_hash: 'Password',
  amount: 'Amount', income_date: 'Date', expense_date: 'Date', sale_date: 'Date',
  paid_by: 'Paid by', invoice_number: 'Invoice number', grand_total: 'Total',
  discount: 'Discount', payment_method: 'Payment method', reason: 'Reason',
  filename: 'File name', size_bytes: 'File size', mode: 'Backup type', method: 'Backup tool',
  name: 'Name', pharmacy_name: 'Pharmacy name',
};
function auditFieldLabel(f) { return AUDIT_FIELD_LABELS[f] || f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function auditFieldValue(f, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (f === 'password' || f === 'password_hash') return '••••••';
  if (f === 'status') return (v === 1 || v === '1' || v === 'active') ? 'Active' : 'Inactive';
  if (f === 'size_bytes') return fmt.num(Math.round((+v) / 1024)) + ' KB';
  if (typeof v === 'number' || (!isNaN(v) && f.match(/price|amount|total|discount/))) return fmt.money(v);
  return String(v);
}
/** A short, plain-English label for what a log entry represents, e.g. "Added product — Panadol 500mg". */
function auditSummary(r) {
  const who = r.user_name || 'System';
  const what = AUDIT_ENTITY_NAMES[r.entity] || r.entity.replace(/_/g, ' ');
  const verb = AUDIT_ACTION_VERBS[r.action] || r.action;
  let name = '';
  try {
    const d = JSON.parse(r.new_data || r.old_data || '{}');
    name = d.medicine_name || d.full_name || d.name || d.invoice_number || d.username || d.description || '';
  } catch {}
  return `${who} ${verb.toLowerCase()} ${what}${name ? ' — ' + name : (r.entity_id ? ' #' + r.entity_id : '')}`;
}
/** Plain-language before/after list for the details dialog, instead of a raw JSON dump. */
function auditDiffHtml(oldData, newData) {
  let o = {}, n = {};
  try { o = JSON.parse(oldData || '{}') || {}; } catch {}
  try { n = JSON.parse(newData || '{}') || {}; } catch {}
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])]
    .filter(k => !['created_at', 'updated_at', 'id'].includes(k));
  if (!keys.length) return `<p class="mut small">No further details recorded.</p>`;
  const rows = keys
    .filter(k => JSON.stringify(o[k]) !== JSON.stringify(n[k]))
    .map(k => `<tr><td class="small"><b>${esc(auditFieldLabel(k))}</b></td>
      <td class="small mut">${esc(auditFieldValue(k, o[k]))}</td>
      <td class="small">→ ${esc(auditFieldValue(k, n[k]))}</td></tr>`).join('');
  if (!rows) {
    // Nothing changed field-by-field (e.g. a create with no "before") — just list the values.
    const src = Object.keys(n).length ? n : o;
    return `<div class="tablewrap" style="box-shadow:none"><table class="grid"><tbody>
      ${keys.map(k => `<tr><td class="small"><b>${esc(auditFieldLabel(k))}</b></td>
        <td class="small">${esc(auditFieldValue(k, src[k]))}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  return `<div class="tablewrap" style="box-shadow:none"><table class="grid">
    <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

SCREENS.audit = {
  state: { page: 1, entity: '', act: '', user_id: 0, tab: 'log' },
  async render(el) {
    if (!APP.can('audit', 'view')) { el.innerHTML = `<div class="empty"><b>${t('nothing')}</b></div>`; return; }
    this.el = el;
    this.filters = this.filters || await api('audit.filters');
    const s = this.state;
    el.innerHTML = `
      ${screenHead('m_audit', 'sub_audit')}
      <div class="tabs mb">
        <button class="tab ${s.tab === 'log' ? 'on' : ''}" data-tab="log">${t('m_audit')}</button>
        <button class="tab ${s.tab === 'logins' ? 'on' : ''}" data-tab="logins">${t('h_logins')}</button>
      </div>
      <div class="filterbar" id="auFilters" ${s.tab === 'logins' ? 'hidden' : ''}>
        <select id="auEntity"><option value="">${t('t_type')}</option>
          ${this.filters.entities.map(e => `<option ${s.entity === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>
        <select id="auAct"><option value="">Action</option>
          ${this.filters.actions.map(a => `<option ${s.act === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
        <select id="auUser"><option value="0">${t('t_cashier').replace(t('t_cashier'), 'User')}</option>
          ${this.filters.users.map(u => `<option value="${u.id}" ${+s.user_id === +u.id ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select>
      </div>
      <div id="auTable"><div class="spin"></div></div>`;
    $$('.tab', el).forEach(b => b.addEventListener('click', () => { s.tab = b.dataset.tab; s.page = 1; this.render(el); }));
    ['auEntity', 'auAct', 'auUser'].forEach(idSel => {
      const f = $('#' + idSel, el);
      if (f) f.addEventListener('change', () => {
        s.entity = $('#auEntity', el).value; s.act = $('#auAct', el).value;
        s.user_id = +$('#auUser', el).value; s.page = 1; this.loadTable();
      });
    });
    await this.loadTable();
  },

  async loadTable() {
    const box = $('#auTable', this.el); if (!box) return;
    const s = this.state;
    if (s.tab === 'logins') {
      const d = await api('audit.logins', { page: s.page, per: 30 });
      box.innerHTML = `
        <div class="tablewrap"><table class="grid"><thead><tr>
          <th>${t('t_date')}</th><th>User</th><th>${t('t_role')}</th><th>Action</th><th>IP</th></tr></thead><tbody>
          ${d.rows.map(r => `<tr>
            <td class="mono small">${esc(String(r.created_at).slice(0, 19))}</td>
            <td><b>${esc(r.full_name || '—')}</b> <span class="mut small mono">${esc(r.username || '')}</span></td>
            <td><span class="badge mut">${esc(r.role || '')}</span></td>
            <td><span class="badge ${r.action === 'login' ? 'ok' : 'mut'}">${esc(r.action)}</span></td>
            <td class="mono small">${esc(r.ip_address || '—')}</td></tr>`).join('') ||
            `<tr><td colspan="5"><div class="empty">${t('nothing')}</div></td></tr>`}
        </tbody></table></div>${pagerHtml(d)}`;
    } else {
      const d = await api('audit.list', { page: s.page, per: 30, entity: s.entity, act: s.act, user_id: s.user_id });
      box.innerHTML = `
        <div class="tablewrap"><table class="grid"><thead><tr>
          <th>${t('t_date')}</th><th>User</th><th>What happened</th><th>IP</th><th class="actions"></th></tr></thead><tbody>
          ${d.rows.map(r => `<tr data-id="${r.id}">
            <td class="mono small">${esc(String(r.created_at).slice(0, 19))}</td>
            <td class="small"><b>${esc(r.user_name || 'System')}</b></td>
            <td class="small">
              <span class="badge ${{ create: 'ok', update: 'mut', delete: 'bad', 'return': 'warn', cancel: 'bad' }[r.action] || 'mut'}">${esc(AUDIT_ACTION_VERBS[r.action] || r.action)}</span>
              ${esc(auditSummary(r))}
            </td>
            <td class="mono small">${esc(r.ip_address || '—')}</td>
            <td class="actions">${r.old_data || r.new_data ? `<button data-act="diff" title="Details">${ic('eye')}</button>` : ''}</td>
          </tr>`).join('') ||
            `<tr><td colspan="5"><div class="empty">${t('nothing')}</div></td></tr>`}
        </tbody></table></div>${pagerHtml(d)}`;
      this.lastRows = d.rows;
      $$('button[data-act="diff"]', box).forEach(b => b.addEventListener('click', () => {
        const r = this.lastRows.find(x => +x.id === +b.closest('tr').dataset.id);
        openModal({
          title: auditSummary(r),
          wide: true,
          body: auditDiffHtml(r.old_data, r.new_data),
          footer: `<button class="btn btn-brand" onclick="closeModal()">${t('b_close')}</button>`,
        });
      }));
    }
    bindPager(box, p => { this.state.page = p; this.loadTable(); });
  },
};
