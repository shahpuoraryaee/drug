<?php
/**
 * Arya Pharma Manager — one-time installer.
 * Open http://127.0.0.1/install.php (or let PHP Desktop open it).
 * Creates the database, imports schema + seed, sets the default password
 * for all seeded users, then locks itself with a marker file.
 */
declare(strict_types=1);
require __DIR__ . '/config.php';

const DEFAULT_PASSWORD = 'arya123';
$lockFile = __DIR__ . '/install.lock';
$log = [];
$err = null;
$done = is_file($lockFile);

function splitSql(string $sql): array
{
    $stmts = []; $buf = ''; $len = strlen($sql);
    $inS = false; $inBt = false; $inLineC = false;
    for ($i = 0; $i < $len; $i++) {
        $ch = $sql[$i]; $next = $i + 1 < $len ? $sql[$i + 1] : '';
        if ($inLineC) { if ($ch === "\n") $inLineC = false; continue; }
        if (!$inS && !$inBt && $ch === '-' && $next === '-') { $inLineC = true; $i++; continue; }
        if ($ch === "'" && !$inBt) {
            if ($inS && $next === "'") { $buf .= "''"; $i++; continue; }
            if ($inS && $i > 0 && $sql[$i-1] === '\\') { $buf .= $ch; continue; }
            $inS = !$inS;
        } elseif ($ch === '`' && !$inS) { $inBt = !$inBt; }
        if ($ch === ';' && !$inS && !$inBt) {
            $s = trim($buf); if ($s !== '') $stmts[] = $s; $buf = ''; continue;
        }
        $buf .= $ch;
    }
    $s = trim($buf); if ($s !== '') $stmts[] = $s;
    return $stmts;
}

if (!$done && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    try {
        // 1. Connect without a database, create it.
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $pdo->exec('CREATE DATABASE IF NOT EXISTS `' . DB_NAME . '`
                    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $pdo->exec('USE `' . DB_NAME . '`');
        $log[] = 'Database `' . DB_NAME . '` ready.';

        // 2. Schema.
        $schema = file_get_contents(__DIR__ . '/database/schema.sql');
        if ($schema === false) throw new RuntimeException('database/schema.sql not found.');
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        $n = 0;
        foreach (splitSql($schema) as $stmt) { $pdo->exec($stmt); $n++; }
        $log[] = "Schema imported ($n statements).";

        // 3. Seed (with hashed default password injected).
        $seed = file_get_contents(__DIR__ . '/database/seed.sql');
        if ($seed === false) throw new RuntimeException('database/seed.sql not found.');
        $hash = password_hash(DEFAULT_PASSWORD, PASSWORD_DEFAULT);
        $seed = str_replace('__SET_BY_INSTALLER__', $hash, $seed);
        $n = 0;
        foreach (splitSql($seed) as $stmt) { $pdo->exec($stmt); $n++; }
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        $log[] = "Demo data imported ($n statements): 100 products, 20 categories, 6 suppliers, batches, purchases, expenses, income.";

        // 4. Backup dir + lock.
        if (!is_dir(BACKUP_DIR)) mkdir(BACKUP_DIR, 0777, true);
        file_put_contents($lockFile, date('c'));
        $log[] = 'Installation complete.';
        $done = true;
    } catch (Throwable $e) {
        $err = $e->getMessage();
    }
}
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Install — Arya Pharma Manager</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{--paper:#F5F9F6;--ink:#17241E;--brand:#0E7A5F;--line:#D8E4DC;--card:#fff}
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.55 "Segoe UI",system-ui,sans-serif;background:var(--paper);color:var(--ink);
       display:grid;place-items:center;min-height:100vh}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;max-width:560px;width:92%;
        padding:32px 36px;box-shadow:0 10px 30px rgba(14,122,95,.08)}
  h1{font-size:22px;margin:0 0 4px}
  .sub{color:#5A6B62;margin:0 0 20px}
  .kv{background:#F0F6F2;border:1px solid var(--line);border-radius:8px;padding:12px 16px;
      font-family:Consolas,monospace;font-size:13px;margin:14px 0}
  button{background:var(--brand);color:#fff;border:0;border-radius:8px;padding:12px 26px;font-size:15px;
         font-weight:600;cursor:pointer;width:100%}
  button:hover{background:#0B6850}
  .ok{color:#0E7A5F}.err{background:#FBEAE6;border:1px solid #E5B7AC;color:#8F2418;
      border-radius:8px;padding:12px 16px;margin:14px 0;font-size:14px}
  ul{padding-left:20px;margin:10px 0}
  li{margin:4px 0}
  a{color:var(--brand);font-weight:600}
</style>
</head>
<body>
<div class="card">
  <h1>Arya Pharma Manager <?= $done ? '· installed ✓' : '· installer' ?></h1>
  <p class="sub">Offline pharmacy management · v<?= APP_VERSION ?></p>

  <?php if ($err): ?>
    <div class="err"><strong>Installation failed:</strong><br><?= htmlspecialchars($err) ?>
      <br><br>Check DB credentials in <code>config.php</code> and make sure MySQL/MariaDB is running.</div>
  <?php endif; ?>

  <?php if ($done): ?>
    <?php foreach ($log as $l): ?><p class="ok">✓ <?= htmlspecialchars($l) ?></p><?php endforeach; ?>
    <div class="kv">
      Sign in with any of these accounts:<br><br>
      owner &nbsp;&nbsp;&nbsp;/ <?= DEFAULT_PASSWORD ?> &nbsp;(Nadia Rahimi — full access)<br>
      manager &nbsp;/ <?= DEFAULT_PASSWORD ?> &nbsp;(Farid Ahmadi)<br>
      store &nbsp;&nbsp;&nbsp;/ <?= DEFAULT_PASSWORD ?> &nbsp;(Jawed Karimi — storekeeper)<br>
      accounts / <?= DEFAULT_PASSWORD ?> &nbsp;(Zahra Noori — accountant)
    </div>
    <p><strong>Change these passwords</strong> from the Users screen after first sign-in.</p>
    <p style="text-align:center;margin-top:22px"><a href="login.php">Open Arya Pharma Manager →</a></p>
  <?php else: ?>
    <p>This will create the database and load demo data:</p>
    <ul>
      <li>Database <code><?= DB_NAME ?></code> on <code><?= DB_HOST ?>:<?= DB_PORT ?></code></li>
      <li>100 products · 20 categories · 6 suppliers</li>
      <li>Batches with realistic expiry dates, purchases, expenses &amp; income history</li>
      <li>4 user accounts (owner, manager, storekeeper, accountant)</li>
    </ul>
    <form method="post"><button>Install now</button></form>
  <?php endif; ?>
</div>
</body>
</html>
