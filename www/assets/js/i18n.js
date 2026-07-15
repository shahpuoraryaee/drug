/* Arya Pharma Manager — i18n
   t(key) returns the string for the active language, falling back to English.
   fmt.money / fmt.num localise digits for fa/ps. */
'use strict';

const I18N = {
en: {
  tagline:'Business Manager', searchph:'Search medicine, generic, barcode, batch or supplier…',
  g_daily:'Daily', g_money:'Money', g_partners:'Partners', g_system:'System',
  m_dash:'Dashboard', m_products:'Products', m_inventory:'Inventory', m_purchases:'Purchases',
  m_expenses:'Expenses', m_income:'Income', m_reports:'Reports', m_suppliers:'Suppliers',
  m_categories:'Categories', m_users:'Users', m_backup:'Backup', m_settings:'Settings',
  h_dash:'Today at the pharmacy', sub_dash:'Figures refresh as you work',
  b_find:'Find anything', b_addproduct:'Add product', b_search:'Search',
  k_tincome:'Income today', k_texpense:'Expenses today', k_mprofit:'Net profit — this month', k_stockval:'Stock value',
  vs_yday:'vs yesterday', entries:'entries', units:'units', products_w:'products',
  h_expiry:'Expiry ledger', a_expiry:'→ expiry report',
  e180:'180+ days', e90:'≤ 90 days', e60:'≤ 60 days', e30:'≤ 30 days', e15:'≤ 15 days', ex:'expired',
  h_flow:'Income vs expenses — last 14 days',
  h_recentpurch:'Recent purchases', a_all:'→ all', items:'items', today:'today', yday:'yesterday',
  paid:'paid', partial:'partial', unpaid:'unpaid', due:'due',
  h_lowstock:'Low stock', h_recentexp:'Recent expenses', min:'min',
  b_import:'Import', b_export:'Export', b_newpurch:'New purchase', b_newexp:'Record expense',
  b_newincome:'Record income', b_newsupplier:'New supplier', b_newcategory:'New category',
  b_newuser:'New user', b_save:'Save', b_cancel:'Cancel', b_close:'Close', b_delete:'Delete',
  b_edit:'Edit', b_print:'Print', b_run:'Run report', b_backupnow:'Back up now', b_restore:'Restore',
  b_adjust:'Adjust stock', b_pay:'Pay', b_archive:'Archive', b_duplicate:'Duplicate', b_changepw:'Change password',
  f_allcat:'All categories', f_allsup:'All suppliers', f_allstock:'Any stock level',
  f_low:'Low stock', f_out:'Out of stock', f_anyexp:'Any expiry',
  t_code:'Code', t_medicine:'Medicine', t_cat:'Category', t_batch:'Batch', t_expiry:'Expiry',
  t_stock:'Stock', t_sell:'Sell (؋)', t_buy:'Buy (؋)', t_supplier:'Supplier', t_invoice:'Invoice',
  t_date:'Date', t_items:'Items', t_total:'Total (؋)', t_status:'Payment', t_desc:'Description',
  t_paidby:'Paid by', t_amount:'Amount (؋)', t_qty:'Qty', t_type:'Type', t_user:'User',
  t_balance:'Balance (؋)', t_phone:'Phone', t_name:'Name', t_role:'Role', t_actions:'',
  showing:'Showing', of:'of', page:'Page',
  sc_all:'All', sc_med:'Medicine', sc_sup:'Supplier', sc_batch:'Batch',
  confirm_del:'Delete this record?', confirm_del_sub:'It will be archived and can be recovered from the database.',
  saved:'Saved.', deleted:'Deleted.', nothing:'Nothing here yet',
  err_net:'Cannot reach the server.',
  st_ready:'READY', st_user:'USER', st_db:'DB',
  hint_rows:'move', hint_open:'open', hint_edit:'edit', hint_close:'close', hint_save:'save',
  loading:'Loading…', total:'Total', net:'Net', opening:'Opening stock', reason:'Reason',
  in_stock:'in stock', low:'LOW', out:'OUT',
  /* sales module */
  m_sales:'Sales', h_sales:'Point of sale', sub_sales:'Walk-in customers · every sale updates stock, income and reports',
  b_newsale:'New sale', b_complete:'Complete sale', b_hold:'Hold', b_return:'Return', b_scanphone:'Scan with phone',
  b_held:'Held sales', t_price:'Price', t_disc:'Disc.', t_line:'Line (؋)', t_change:'Change', t_method:'Method',
  t_cashier:'Cashier', t_profit:'Profit (؋)', walkin:'Walk-in Customer', cart_empty:'Cart is empty — scan or search a medicine',
  pm_cash:'Cash', pm_card:'Card', pm_bank:'Bank transfer', pm_mobile:'Mobile money', pm_mixed:'Mixed',
  r_wrong:'Wrong medicine', r_damaged:'Damaged', r_expired:'Expired', r_mind:'Changed mind', r_dup:'Duplicate sale', r_other:'Other',
  completed:'completed', held:'held', cancelled:'cancelled',
  scan_hint:'Scan this QR with the phone camera (same Wi-Fi), or open the address by hand.',
  paid_short:'Paid', receipt:'Receipt', invdisc:'Invoice discount',
  /* v1.2 */
  m_audit:'Audit log', sub_audit:'Every important action, who did it, and what changed',
  h_logins:'Login history', b_label:'Print label', r_overstock:'Overstock', r_quality:'Quality issue',
  k_tpurch:'Purchases today', k_month:'Month',
},
fa: {
  tagline:'مدیریت تجارت', searchph:'جستجوی دوا، جنریک، بارکد، بچ یا تهیه‌کننده…',
  g_daily:'روزانه', g_money:'مالی', g_partners:'شرکا', g_system:'سیستم',
  m_dash:'داشبورد', m_products:'محصولات', m_inventory:'گدام', m_purchases:'خریداری‌ها',
  m_expenses:'مصارف', m_income:'عواید', m_reports:'راپورها', m_suppliers:'تهیه‌کننده‌ها',
  m_categories:'کتگوری‌ها', m_users:'کاربران', m_backup:'پشتیبان', m_settings:'تنظیمات',
  h_dash:'امروز در دواخانه', sub_dash:'ارقام هنگام کار به‌روز می‌شوند',
  b_find:'جستجوی همه‌چیز', b_addproduct:'افزودن محصول', b_search:'جستجو',
  k_tincome:'عاید امروز', k_texpense:'مصرف امروز', k_mprofit:'مفاد خالص — این ماه', k_stockval:'ارزش گدام',
  vs_yday:'نسبت به دیروز', entries:'مورد', units:'واحد', products_w:'محصول',
  h_expiry:'دفتر انقضا', a_expiry:'→ راپور انقضا',
  e180:'۱۸۰+ روز', e90:'≤ ۹۰ روز', e60:'≤ ۶۰ روز', e30:'≤ ۳۰ روز', e15:'≤ ۱۵ روز', ex:'منقضی',
  h_flow:'عاید و مصرف — ۱۴ روز اخیر',
  h_recentpurch:'خریداری‌های اخیر', a_all:'→ همه', items:'قلم', today:'امروز', yday:'دیروز',
  paid:'پرداخت‌شده', partial:'قسمی', unpaid:'ناپرداخت', due:'باقی',
  h_lowstock:'ذخیره کم', h_recentexp:'مصارف اخیر', min:'حداقل',
  b_import:'وارد کردن', b_export:'خروجی', b_newpurch:'خریداری جدید', b_newexp:'ثبت مصرف',
  b_newincome:'ثبت عاید', b_newsupplier:'تهیه‌کننده جدید', b_newcategory:'کتگوری جدید',
  b_newuser:'کاربر جدید', b_save:'ثبت', b_cancel:'لغو', b_close:'بستن', b_delete:'حذف',
  b_edit:'ویرایش', b_print:'چاپ', b_run:'اجرای راپور', b_backupnow:'پشتیبان‌گیری', b_restore:'بازیابی',
  b_adjust:'تنظیم ذخیره', b_pay:'پرداخت', b_archive:'بایگانی', b_duplicate:'کاپی', b_changepw:'تغییر رمز',
  f_allcat:'همه کتگوری‌ها', f_allsup:'همه تهیه‌کننده‌ها', f_allstock:'هر سطح ذخیره',
  f_low:'ذخیره کم', f_out:'ختم شده', f_anyexp:'هر انقضا',
  t_code:'کود', t_medicine:'دوا', t_cat:'کتگوری', t_batch:'بچ', t_expiry:'انقضا',
  t_stock:'ذخیره', t_sell:'فروش (؋)', t_buy:'خرید (؋)', t_supplier:'تهیه‌کننده', t_invoice:'بل',
  t_date:'تاریخ', t_items:'اقلام', t_total:'مجموع (؋)', t_status:'پرداخت', t_desc:'شرح',
  t_paidby:'پرداخت‌کننده', t_amount:'مبلغ (؋)', t_qty:'تعداد', t_type:'نوع', t_user:'کاربر',
  t_balance:'بیلانس (؋)', t_phone:'تلیفون', t_name:'نام', t_role:'وظیفه',
  showing:'نمایش', of:'از', page:'صفحه',
  sc_all:'همه', sc_med:'دوا', sc_sup:'تهیه‌کننده', sc_batch:'بچ',
  confirm_del:'این مورد حذف شود؟', confirm_del_sub:'بایگانی می‌شود و از دیتابیس قابل بازیابی است.',
  saved:'ثبت شد.', deleted:'حذف شد.', nothing:'هنوز چیزی نیست',
  err_net:'اتصال به سرور ممکن نیست.',
  st_ready:'آماده', st_user:'کاربر', st_db:'دیتابیس',
  hint_rows:'حرکت', hint_open:'باز', hint_edit:'ویرایش', hint_close:'بستن', hint_save:'ثبت',
  loading:'در حال بارگیری…', total:'مجموع', net:'خالص', opening:'ذخیره اولیه', reason:'دلیل',
  in_stock:'موجود', low:'کم', out:'ختم',
  /* sales module */
  m_sales:'فروشات', h_sales:'فروش (POS)', sub_sales:'مشتری حضوری · هر فروش گدام، عاید و راپورها را به‌روز می‌کند',
  b_newsale:'فروش جدید', b_complete:'تکمیل فروش', b_hold:'نگه‌داشتن', b_return:'مسترد', b_scanphone:'سکن با موبایل',
  b_held:'فروش‌های معطل', t_price:'قیمت', t_disc:'تخفیف', t_line:'مجموع (؋)', t_change:'باقی‌مانده', t_method:'طریقه',
  t_cashier:'فروشنده', t_profit:'مفاد (؋)', walkin:'مشتری حضوری', cart_empty:'سبد خالی است — دوا را سکن یا جستجو کنید',
  pm_cash:'نقده', pm_card:'کارت', pm_bank:'حواله بانکی', pm_mobile:'موبایل منی', pm_mixed:'مخلوط',
  r_wrong:'دوای اشتباه', r_damaged:'شکسته/خراب', r_expired:'منقضی', r_mind:'انصراف مشتری', r_dup:'فروش تکراری', r_other:'دیگر',
  completed:'تکمیل', held:'معطل', cancelled:'لغوشده',
  scan_hint:'این QR را با کمرهٔ موبایل سکن کنید (همان وای‌فای)، یا آدرس را دستی باز کنید.',
  paid_short:'پرداخت', receipt:'رسید', invdisc:'تخفیف بل',
  /* v1.2 */
  m_audit:'ثبت وقایع', sub_audit:'هر عمل مهم، انجام‌دهنده و تغییرات آن',
  h_logins:'تاریخچهٔ ورود', b_label:'چاپ لیبل', r_overstock:'اضافه‌خرید', r_quality:'مشکل کیفیت',
  k_tpurch:'خرید امروز', k_month:'ماه',
},
ps: {
  tagline:'د سوداګرۍ مدیریت', searchph:'د درملو، جنریک، بارکوډ، بچ یا عرضه‌کوونکي لټون…',
  g_daily:'ورځنی', g_money:'مالي', g_partners:'شریکان', g_system:'سیسټم',
  m_dash:'ډشبورډ', m_products:'محصولات', m_inventory:'ګدام', m_purchases:'پیرودنې',
  m_expenses:'لګښتونه', m_income:'عاید', m_reports:'راپورونه', m_suppliers:'عرضه‌کوونکي',
  m_categories:'کټګورۍ', m_users:'کاروونکي', m_backup:'بیک اپ', m_settings:'امستنې',
  h_dash:'نن په درملتون کې', sub_dash:'شمېرې د کار پر مهال تازه کیږي',
  b_find:'هر څه ولټوئ', b_addproduct:'محصول اضافه کړئ', b_search:'لټون',
  k_tincome:'د نن عاید', k_texpense:'د نن لګښت', k_mprofit:'خالص ګټه — دا میاشت', k_stockval:'د ګدام ارزښت',
  vs_yday:'د پرون په پرتله', entries:'موارد', units:'واحدونه', products_w:'محصولات',
  h_expiry:'د پای نېټې دفتر', a_expiry:'→ د پای نېټې راپور', ex:'پای ته رسېدلی',
  h_recentpurch:'وروستۍ پیرودنې', a_all:'→ ټول', today:'نن', yday:'پرون',
  paid:'ورکړل شوی', partial:'نیمګړی', unpaid:'نه دی ورکړل شوی', due:'پاتې',
  h_lowstock:'کم زیرمه', h_recentexp:'وروستي لګښتونه', min:'لږ تر لږه',
  b_save:'ثبت', b_cancel:'لغوه', b_close:'بندول', b_delete:'ړنګول', b_edit:'سمول', b_print:'چاپ',
  m_sales:'پلورنې', h_sales:'پلورنه (POS)', b_newsale:'نوې پلورنه', b_complete:'پلورنه بشپړه کړئ',
  walkin:'حضوري پېرودونکی', pm_cash:'نغدې',
  saved:'ثبت شو.', deleted:'ړنګ شو.', nothing:'تر اوسه هیڅ نشته',
  st_ready:'چمتو', loading:'بارېږي…', total:'ټول',
},
};

let LANG = localStorage.getItem('apm_lang') || 'en';

function t(key){
  return (I18N[LANG] && I18N[LANG][key]) ?? I18N.en[key] ?? key;
}

const FA_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
const fmt = {
  num(n, dec = 0){
    if (n === null || n === undefined || n === '') return '—';
    let s = Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (LANG === 'fa' || LANG === 'ps') {
      s = s.replace(/[0-9]/g, d => FA_DIGITS[+d]).replace(/,/g, '٬').replace(/\./g, '٫');
    }
    return s;
  },
  money(n){ return this.num(n, 0); },
  date(d){ return d ? String(d).slice(0, 10) : '—'; },
};

function applyLang(code){
  LANG = code;
  localStorage.setItem('apm_lang', code);
  const rtl = code === 'fa' || code === 'ps';
  document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  document.documentElement.lang = code;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
}
