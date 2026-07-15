<?php
/**
 * Arya Pharma Manager — AJAX API
 * Every request: api.php?action=module.method  (POST body = JSON)
 * Every response: {ok:true, data:…} | {ok:false, error:"…"}
 */
declare(strict_types=1);

require __DIR__ . '/config.php';
require __DIR__ . '/includes/db.php';
require __DIR__ . '/includes/helpers.php';
require __DIR__ . '/includes/auth.php';

Auth::start();

$action = $_GET['action'] ?? '';
if (!preg_match('/^([a-z]+)\.([a-zA-Z]+)$/', $action, $m)) fail('Unknown action.', 404);
[, $module, $method] = $m;

$allowed = ['auth','dashboard','products','categories','suppliers','purchases',
            'inventory','expenses','income','reports','search','users','backup','settings','sales','audit'];
if (!in_array($module, $allowed, true)) fail('Unknown module.', 404);

// Everything except login requires a session.
if (!($module === 'auth' && in_array($method, ['login','me'], true)) && !Auth::check()) {
    fail('Not signed in.', 401);
}

$file = __DIR__ . "/modules/{$module}.php";
if (!is_file($file)) fail('Module not found.', 404);
require $file;

$fn = "{$module}_{$method}";
if (!function_exists($fn)) fail("Unknown method '{$method}'.", 404);

try {
    $fn();
} catch (PDOException $e) {
    error_log($e->getMessage());
    if (str_contains($e->getMessage(), 'Duplicate entry')) {
        fail('That value already exists (duplicate code, barcode, or invoice number).');
    }
    fail('Database error. Check php-error.log for details.', 500);
} catch (Throwable $e) {
    error_log($e->getMessage());
    fail($e->getMessage(), 500);
}
