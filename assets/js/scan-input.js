/* Arya Pharma Manager — scanner input helper (Barcode & Mobile Scanning spec, Phase 1/2).
   Shared by the POS barcode field and the phone-camera scan poll loop so both
   give the same success/error beep + flash, and both go through the same
   duplicate-scan guard. No external dependencies (Web Audio API only). */
'use strict';

const ScanInput = (() => {
  const FAST_KEY_MS = 40;   // gap between keystrokes typical of scanner hardware, not a person typing
  const DEDUPE_MS   = 200;  // ignore the exact same code arriving again this fast (double Enter/CR from hardware)

  /** Short success/error beep. Silently no-ops if Web Audio is blocked/unsupported. */
  function beep(ok = true) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = beep._ctx || (beep._ctx = new Ctx());
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      const dur = ok ? 0.11 : 0.22;
      osc.type = ok ? 'sine' : 'square';
      osc.frequency.value = ok ? 940 : 200;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + dur + 0.02);
    } catch { /* audio unavailable — visual feedback still fires */ }
  }

  /** Green/red flash ring on a field, e.g. the barcode input. */
  function flashField(el, ok = true) {
    if (!el) return;
    el.classList.remove('scan-flash-ok', 'scan-flash-err');
    void el.offsetWidth; // restart the CSS animation if it's already mid-run
    el.classList.add(ok ? 'scan-flash-ok' : 'scan-flash-err');
    setTimeout(() => el.classList.remove('scan-flash-ok', 'scan-flash-err'), 450);
  }

  /** Highlight + scroll a cart row into view when a scan adds/bumps it. */
  function flashRow(rowEl) {
    if (!rowEl) return;
    rowEl.classList.remove('scan-hit');
    void rowEl.offsetWidth;
    rowEl.classList.add('scan-hit');
    rowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setTimeout(() => rowEl.classList.remove('scan-hit'), 1000);
  }

  /**
   * Attach scanner-wedge behaviour to a text <input>.
   * USB/Bluetooth/keyboard-wedge scanners type the code fast and terminate
   * with Enter, Tab, or CR — all three are treated as "submit". Manual
   * typing (slower keystrokes) is left alone for the caller's own
   * autocomplete to handle on every keystroke as usual.
   *
   * opts:
   *   onScan(code) -> must return/resolve a truthy value on success, or
   *                    false/throw on "not found" (drives the beep+flash).
   *   onBurst(isFast) -> optional; called as the field enters/leaves a
   *                       fast typing burst, so the caller can hide its
   *                       autocomplete list while a scan is likely in progress.
   */
  function attach(input, opts) {
    let lastKeyAt = 0, lastCode = '', lastAt = 0, burst = false;

    function setBurst(v) {
      if (v === burst) return;
      burst = v;
      opts.onBurst?.(v);
    }

    function submit(raw) {
      const code = String(raw || '').trim();
      if (!code) return;
      const now = Date.now();
      if (code === lastCode && now - lastAt < DEDUPE_MS) return; // hardware double-fire guard
      lastCode = code; lastAt = now;
      Promise.resolve(opts.onScan(code))
        .then(ok => { flashField(input, ok !== false); beep(ok !== false); })
        .catch(() => { flashField(input, false); beep(false); });
    }

    const onKeydown = (e) => {
      const now = Date.now();
      setBurst(lastKeyAt !== 0 && (now - lastKeyAt) < FAST_KEY_MS);
      lastKeyAt = now;
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (!input.value.trim()) return;
        e.preventDefault();
        submit(input.value);
        input.value = '';
        setBurst(false);
      }
    };
    input.addEventListener('keydown', onKeydown);
    return {
      feed: (code) => submit(code),        // for external sources (e.g. phone scan poll)
      isBurst: () => burst,
      destroy: () => input.removeEventListener('keydown', onKeydown),
    };
  }

  return { attach, beep, flashField, flashRow };
})();
