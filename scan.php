<?php
/**
 * Arya Pharma Manager — phone barcode scanner.
 * Opened on a phone via the QR code shown at the POS. No login: access is
 * granted by a random 15-minute token created by the cashier's session.
 * Works on the local network only (see settings.json / README).
 *
 * Camera decoding uses the browser's native BarcodeDetector (Chrome/Android).
 * If unavailable (e.g. iPhone Safari) and assets/vendor/html5-qrcode exists,
 * that library is used; otherwise a large manual-entry keypad is shown.
 */
declare(strict_types=1);
require __DIR__ . '/config.php';
require __DIR__ . '/includes/db.php';

$token = (string) ($_GET['t'] ?? ($_POST['t'] ?? ''));
$valid = preg_match('/^[a-f0-9]{32}$/', $token)
    && DB::row('SELECT token FROM scan_sessions WHERE token = ? AND expires_at > NOW()', [$token]);

/* Phone POSTs a barcode → store event, reply JSON. */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    if (!$valid) { http_response_code(403); echo '{"ok":false,"error":"Session expired — scan the QR code again."}'; exit; }
    $code = trim((string) ($_POST['barcode'] ?? ''));
    if ($code === '' || mb_strlen($code) > 80) { echo '{"ok":false,"error":"Bad barcode."}'; exit; }
    // basic flood guard: max 120 events per session
    $n = (int) DB::val('SELECT COUNT(*) FROM scan_events WHERE token = ?', [$token]);
    if ($n > 120) { echo '{"ok":false,"error":"Too many scans in this session."}'; exit; }
    DB::insert('scan_events', ['token' => $token, 'barcode' => $code]);
    echo '{"ok":true}'; exit;
}
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Scan — Arya Pharma</title>
<style>
  :root{--brand:#0E7A5F;--ink:#122420;--paper:#F5F9F6;--line:#DDE7E1;--bad:#B23A22}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;font:16px/1.45 system-ui,sans-serif;background:var(--paper);color:var(--ink);
       min-height:100vh;display:flex;flex-direction:column}
  header{background:var(--brand);color:#fff;padding:14px 18px;font-weight:700;display:flex;justify-content:space-between;align-items:center}
  header small{font-weight:500;opacity:.85}
  main{flex:1;padding:16px;display:flex;flex-direction:column;gap:14px}
  #cam{width:100%;aspect-ratio:3/4;background:#000;border-radius:14px;object-fit:cover}
  .msg{padding:12px 14px;border-radius:10px;background:#fff;border:1px solid var(--line);text-align:center}
  .msg.ok{border-color:var(--brand);color:var(--brand);font-weight:700}
  .msg.err{border-color:var(--bad);color:var(--bad)}
  .btn{background:var(--brand);color:#fff;border:0;border-radius:12px;padding:16px;font-size:17px;font-weight:700;width:100%}
  input{width:100%;padding:15px;font-size:18px;border:1.5px solid var(--line);border-radius:12px;text-align:center;letter-spacing:.05em}
  .hint{color:#5B6F67;font-size:13px;text-align:center}
  .last{font-family:ui-monospace,monospace;font-size:14px;text-align:center;color:#5B6F67;min-height:20px}
</style>
</head>
<body>
<header>Arya Pharma — Scanner <small id="st"><?= $valid ? 'connected' : 'expired' ?></small></header>
<main>
<?php if (!$valid): ?>
  <div class="msg err"><b>This scan session has expired.</b><br>
    On the computer, open the POS and press <b>Scan with Phone</b> again, then scan the new QR code.</div>
<?php else: ?>
  <video id="cam" autoplay playsinline muted hidden></video>
  <div class="msg" id="msg">Point the camera at the medicine barcode.</div>
  <div class="last" id="last"></div>
  <input id="manual" inputmode="text" autocomplete="off" placeholder="…or type the barcode">
  <button class="btn" id="send">Send barcode</button>
  <div class="hint">Keep this phone on the same Wi-Fi as the pharmacy computer.<br>Session ends after 15 minutes.</div>

<script>
'use strict';
const TOKEN = <?= json_encode($token) ?>;
const msg  = document.getElementById('msg');
const last = document.getElementById('last');
let lastCode = '', lastAt = 0;

async function send(code) {
  code = String(code || '').trim();
  const now = Date.now();
  if (!code || (code === lastCode && now - lastAt < 2500)) return; // debounce repeats
  lastCode = code; lastAt = now;
  try {
    const r = await fetch(location.pathname, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 't=' + encodeURIComponent(TOKEN) + '&barcode=' + encodeURIComponent(code)
    });
    const j = await r.json();
    if (j.ok) {
      msg.textContent = '✓ Sent to the till — watch the screen'; msg.className = 'msg ok';
      last.textContent = code;
      if (navigator.vibrate) navigator.vibrate(80);
    } else {
      msg.textContent = j.error || 'Failed'; msg.className = 'msg err';
    }
  } catch {
    msg.textContent = 'Cannot reach the pharmacy computer — same Wi-Fi?'; msg.className = 'msg err';
  }
  setTimeout(() => { msg.className = 'msg'; msg.textContent = 'Ready for the next barcode.'; }, 1800);
}

document.getElementById('send').addEventListener('click', () => {
  const f = document.getElementById('manual');
  send(f.value); f.value = ''; f.focus();
});
document.getElementById('manual').addEventListener('keydown', e => {
  if (e.key === 'Enter') { send(e.target.value); e.target.value = ''; }
});

/* ---- camera decoding ---- */
async function startCamera() {
  const video = document.getElementById('cam');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
  } catch {
    msg.textContent = 'Camera unavailable — type barcodes below.'; return;
  }
  video.srcObject = stream; video.hidden = false;

  if ('BarcodeDetector' in window) {
    const det = new BarcodeDetector({ formats:
      ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','qr_code'] });
    const tick = async () => {
      try {
        const codes = await det.detect(video);
        if (codes.length) send(codes[0].rawValue);
      } catch {}
      setTimeout(tick, 350);
    };
    tick();
  } else if (window.Html5Qrcode) {
    // optional vendor fallback (assets/vendor/html5-qrcode) — script tag below
    msg.textContent = 'Scanner ready.';
  } else {
    msg.textContent = 'This phone browser cannot decode barcodes automatically — type them below.';
  }
}
startCamera();
</script>
<?php
// optional vendor fallback for iPhones
if (is_file(__DIR__ . '/assets/vendor/html5-qrcode/html5-qrcode.min.js')): ?>
<script src="assets/vendor/html5-qrcode/html5-qrcode.min.js"></script>
<script>
if (!('BarcodeDetector' in window) && window.Html5Qrcode) {
  document.getElementById('cam').hidden = true;
  const div = document.createElement('div'); div.id = 'h5qr';
  document.querySelector('main').prepend(div);
  new Html5Qrcode('h5qr').start({ facingMode: 'environment' },
    { fps: 8, qrbox: 240 }, code => send(code), () => {});
}
</script>
<?php endif; ?>
<?php endif; ?>
</main>
</body>
</html>
