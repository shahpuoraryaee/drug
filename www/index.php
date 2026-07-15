<?php
declare(strict_types=1);
require __DIR__ . '/config.php';
require __DIR__ . '/includes/db.php';
require __DIR__ . '/includes/helpers.php';
require __DIR__ . '/includes/auth.php';

if (!is_file(__DIR__ . '/install.lock')) { header('Location: install.php'); exit; }
Auth::start();
if (!Auth::check()) { header('Location: login.php'); exit; }

$user     = Auth::user();
$settings = settingsAll();
$perms    = Auth::MATRIX[$user['role']] ?? [];
$pharmacy = $settings['pharmacy_name'] ?? 'Arya Pharma';
$isOwner  = $user['role'] === 'owner';
$isCashier = $user['role'] === 'cashier';
// Mirrors JS canOpen(): cashiers (sales-only) never get the business dashboard.
$canOpen = fn(string $screen): bool => $screen === 'dash' ? !$isCashier : Auth::can($screen, 'view');

/* Sidenav definition: group → [screen, i18n key, icon, fkey] */
$nav = [
    'g_daily' => [
        ['dash',      'm_dash',      'dash',  'F1'],
        ['sales',     'm_sales',     'money', 'F12'],
        ['products',  'm_products',  'pill',  'F2'],
        ['inventory', 'm_inventory', 'box',   'F3'],
        ['purchases', 'm_purchases', 'cart',  'F4'],
    ],
    'g_money' => [
        ['expenses', 'm_expenses', 'wallet', 'F5'],
        ['income',   'm_income',   'coins',  'F6'],
        ['reports',  'm_reports',  'chart',  'F7'],
    ],
    'g_partners' => [
        ['suppliers',  'm_suppliers',  'truck', 'F8'],
        ['categories', 'm_categories', 'tags',  'F9'],
    ],
    'g_system' => [
        ['users',    'm_users',    'users',  ''],
        ['audit',    'm_audit',    'eye',    ''],
        ['backup',   'm_backup',   'shield', 'F10'],
        ['settings', 'm_settings', 'gear',   'F11'],
    ],
];
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= htmlspecialchars($pharmacy) ?> — Pharma Manager</title>
<link rel="stylesheet" href="assets/css/app.css">
<?php // Optional enhancement layer — loads only if the files exist (download-vendors.ps1)
foreach (['bootstrap-icons/bootstrap-icons.css'] as $v) {
    if (is_file(__DIR__ . "/assets/vendor/$v")) echo "<link rel=\"stylesheet\" href=\"assets/vendor/$v\">\n";
} ?>
</head>
<body>

<!-- ============================== TOP BAR -->
<header class="topbar">
  <a class="brandmark" href="#" onclick="go('dash');return false">
    <span class="cross">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M12 5v14M5 12h14"/>
      </svg>
    </span>
    <span class="name"><?= htmlspecialchars($pharmacy) ?><small data-i18n="tagline">Business Manager</small></span>
  </a>

  <div class="searchwrap">
    <svg class="bi-search" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.8-3.8"/></svg>
    <input class="searchbox" id="searchTrigger" data-i18n-ph="searchph"
           placeholder="Search medicine, generic, barcode, batch or supplier…" readonly>
    <span class="hint"><span class="kbd">Ctrl</span><span class="kbd">K</span></span>
  </div>

  <span class="chip"><span class="dot"></span><span class="mono"><?= htmlspecialchars($user['full_name'] ?? '') ?></span></span>
  <select id="langSel" class="chip" style="cursor:pointer" aria-label="Language">
    <option value="en">EN</option><option value="fa">دری</option><option value="ps">پښتو</option>
  </select>
  <button class="iconbtn" id="themeBtn" title="Theme" aria-label="Theme"></button>
  <button class="iconbtn" id="logoutBtn" title="Sign out" aria-label="Sign out">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20h-4M10 8l-4 4 4 4M6 12h10"/></svg>
  </button>
</header>

<!-- ============================== SHELL -->
<div class="shell">
  <nav class="sidenav" aria-label="Modules">
    <?php foreach ($nav as $groupKey => $items): ?>
      <div class="group" data-i18n="<?= $groupKey ?>"><?= ucfirst(substr($groupKey, 2)) ?></div>
      <?php foreach ($items as [$screen, $key, $icon, $fkey]):
          if (!$canOpen($screen)) continue; ?>
        <button class="navitem" data-screen="<?= $screen ?>">
          <span class="navic" data-ic="<?= $icon ?>"></span>
          <span data-i18n="<?= $key ?>"><?= ucfirst($screen) ?></span>
          <?php if ($fkey): ?><span class="kbd"><?= $fkey ?></span><?php endif; ?>
        </button>
      <?php endforeach; ?>
    <?php endforeach; ?>
  </nav>

  <main class="main" id="main"><div class="spin"></div></main>
</div>

<!-- ============================== F-KEY RAIL + STATUS STRIP -->
<footer class="fkeyrail" aria-label="Function keys">
  <div class="frail">
  <?php
  $rail = [['F1','dash','m_dash'],['F2','products','m_products'],['F3','inventory','m_inventory'],
           ['F4','purchases','m_purchases'],['F5','expenses','m_expenses'],['F6','income','m_income'],
           ['F7','reports','m_reports'],['F8','suppliers','m_suppliers'],['F9','categories','m_categories'],
           ['F10','backup','m_backup'],['F11','settings','m_settings'],
           ['F12','sales','m_sales']];
  foreach ($rail as [$k, $screen, $key]):
      if (!$canOpen($screen)) continue; ?>
    <button class="fkey" data-screen="<?= $screen ?>">
      <span class="kbd"><?= $k ?></span><span data-i18n="<?= $key ?>"><?= ucfirst($screen) ?></span>
    </button>
  <?php endforeach; ?>
  </div>
  <div class="statusstrip">
    <span data-i18n="st_ready">READY</span>
    <span class="mono"><?= strtoupper($user['role']) ?></span>
    <span class="mono" id="stClock">--:--</span>
  </div>
</footer>

<!-- ============================== SEARCH OVERLAY -->
<div class="overlay" id="overlay">
  <div class="palette">
    <input id="paletteInput" data-i18n-ph="searchph" placeholder="Search medicine, generic, barcode, batch or supplier…" autocomplete="off">
    <div class="scope">
      <button class="on" data-scope="all" data-i18n="sc_all">All</button>
      <button data-scope="products" data-i18n="sc_med">Medicine</button>
      <button data-scope="batches" data-i18n="sc_batch">Batch</button>
      <button data-scope="suppliers" data-i18n="sc_sup">Supplier</button>
    </div>
    <div class="results" id="results"></div>
    <div class="foot">
      <span><span class="kbd">↑↓</span> <span data-i18n="hint_rows">move</span></span>
      <span><span class="kbd">↵</span> <span data-i18n="hint_open">open</span></span>
      <span><span class="kbd">Esc</span> <span data-i18n="hint_close">close</span></span>
    </div>
  </div>
</div>

<div class="toasts" id="toasts"></div>

<script>
window.APP_USER = <?= json_encode([
    'id' => (int) $user['id'], 'name' => $user['full_name'] ?? '', 'role' => $user['role'],
    'perms' => $isOwner ? new stdClass() : $perms,
], JSON_UNESCAPED_UNICODE) ?>;
window.APP_SETTINGS = <?= json_encode($settings, JSON_UNESCAPED_UNICODE) ?>;
window.APP_VERSION = '<?= APP_VERSION ?>';
</script>
<?php // Optional vendor JS (enhancement only)
foreach (['sweetalert2/sweetalert2.all.min.js', 'chartjs/chart.umd.js', 'qrcodejs/qrcode.min.js'] as $v) {
    if (is_file(__DIR__ . "/assets/vendor/$v")) echo "<script src=\"assets/vendor/$v\"></script>\n";
} ?>
<script src="assets/js/i18n.js"></script>
<script src="assets/js/app.js"></script>
<script src="assets/js/screens.js"></script>
<script src="assets/js/barcode.js"></script>
<script src="assets/js/sales.js"></script>
<script>
// Fill sidenav icons from the ICONS set (after app.js loads)
document.querySelectorAll('.navic[data-ic]').forEach(el => { el.outerHTML = ic(el.dataset.ic); });
</script>
</body>
</html>
