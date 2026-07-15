<?php
declare(strict_types=1);

/** Pharmacy settings (name, currency, thresholds, language, theme…). */

function settings_get(): void
{
    Auth::require('settings', 'view');
    ok(settingsAll());
}

function settings_save(): void
{
    Auth::require('settings', 'edit');
    $allowed = [
        'pharmacy_name', 'pharmacy_name_fa', 'pharmacy_address', 'pharmacy_phone',
        'pharmacy_email', 'currency', 'currency_symbol', 'low_stock_threshold',
        'expiry_warning_days', 'language', 'theme', 'date_format',
        'max_discount_percent', 'receipt_footer', 'hold_expire_days',
    ];
    $in = input();
    $saved = [];
    foreach ($allowed as $key) {
        if (!array_key_exists($key, $in)) continue;
        $val = is_scalar($in[$key]) ? trim((string) $in[$key]) : '';

        if ($key === 'max_discount_percent') {
            $n = (float) $val;
            if ($n < 0 || $n > 100) fail("'max_discount_percent' must be between 0 and 100.");
            $val = (string) $n;
        }
        if ($key === 'low_stock_threshold' || $key === 'expiry_warning_days') {
            $n = (int) $val;
            if ($n < 1 || $n > 10000) fail("'$key' must be between 1 and 10000.");
            $val = (string) $n;
        }
        if ($key === 'language' && !in_array($val, ['en', 'fa', 'ps'], true)) fail('Invalid language.');
        if ($key === 'theme' && !in_array($val, ['light', 'dark'], true)) fail('Invalid theme.');

        settingSet($key, $val);
        $saved[$key] = $val;
    }
    audit('update', 'settings', null, null, $saved);
    ok(settingsAll());
}

/* ---------------- Company logo (v1.2, SRS Module 13) ---------------- */
function settings_uploadLogo(): void
{
    Auth::require('settings', 'edit');
    $path = saveUpload('logo', 'branding', ['jpg', 'jpeg', 'png', 'webp'], 512);
    deleteUpload(setting('logo_path'));
    settingSet('logo_path', $path);
    audit('update', 'settings', null, null, ['logo_path' => $path]);
    ok(['logo_path' => $path]);
}

function settings_removeLogo(): void
{
    Auth::require('settings', 'edit');
    deleteUpload(setting('logo_path'));
    settingSet('logo_path', null);
    ok();
}
