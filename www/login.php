<?php
declare(strict_types=1);
require __DIR__ . '/config.php';
require __DIR__ . '/includes/db.php';
require __DIR__ . '/includes/helpers.php';
require __DIR__ . '/includes/auth.php';

if (!is_file(__DIR__ . '/install.lock')) { header('Location: install.php'); exit; }
Auth::start();
if (Auth::check()) { header('Location: index.php'); exit; }
$pharmacy = settingsAll()['pharmacy_name'] ?? 'Arya Pharma';
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in — <?= htmlspecialchars($pharmacy) ?></title>
<link rel="stylesheet" href="assets/css/app.css">
</head>
<body class="login-body">
  <main class="login-card" aria-label="Sign in">
    <div class="login-brand">
      <div class="login-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M12 3v18M5 8l7-4 7 4M7 21h10"/>
          <rect x="8.5" y="11" width="7" height="6.5" rx="1.6"/>
          <path d="M12 12.8v3M10.5 14.3h3"/>
        </svg>
      </div>
      <h1><?= htmlspecialchars($pharmacy) ?><span class="login-sub">Pharma Manager</span></h1>
    </div>

    <form id="loginForm" autocomplete="off">
      <label class="fld">
        <span>Username</span>
        <input type="text" id="username" required autofocus autocapitalize="none" spellcheck="false">
      </label>
      <label class="fld">
        <span>Password</span>
        <input type="password" id="password" required>
      </label>
      <div id="loginError" class="login-error" hidden></div>
      <button type="submit" class="btn btn-brand btn-block" id="loginBtn">
        Sign in <span class="keycap keycap-inverse">↵</span>
      </button>
    </form>

    <footer class="login-foot">
      <span class="mono">v<?= APP_VERSION ?></span> · offline · <?= date('Y') ?>
    </footer>
  </main>

<script>
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const errBox = document.getElementById('loginError');
  btn.disabled = true; errBox.hidden = true;
  try {
    const r = await fetch('api.php?action=auth.login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value
      })
    });
    const j = await r.json();
    if (j.ok) { location.href = 'index.php'; return; }
    errBox.textContent = j.error || 'Sign-in failed.';
    errBox.hidden = false;
  } catch {
    errBox.textContent = 'Cannot reach the server. Is the app running?';
    errBox.hidden = false;
  }
  btn.disabled = false;
});
</script>
</body>
</html>
