<?php
declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Load .env
|--------------------------------------------------------------------------
*/

$envFile = __DIR__ . '/.env';

if (!file_exists($envFile)) {
    die('.env file not found.');
}

$env = [];

foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {

    $line = trim($line);

    if ($line === '' || str_starts_with($line, '#')) {
        continue;
    }

    if (!str_contains($line, '=')) {
        continue;
    }

    [$key, $value] = explode('=', $line, 2);

    $key = trim($key);
    $value = trim($value);

    if (
        strlen($value) >= 2 &&
        (
            ($value[0] === '"' && $value[strlen($value)-1] === '"') ||
            ($value[0] === "'" && $value[strlen($value)-1] === "'")
        )
    ) {
        $value = substr($value, 1, -1);
    }

    $env[$key] = $value;
}

/*
|--------------------------------------------------------------------------
| Application
|--------------------------------------------------------------------------
*/

const APP_NAME    = 'Arya Pharma Manager';
const APP_VERSION = '1.0.0';

define('APP_ENV', $env['APP_ENV'] ?? 'production');
define('APP_DEBUG', filter_var($env['APP_DEBUG'] ?? false, FILTER_VALIDATE_BOOLEAN));

/*
|--------------------------------------------------------------------------
| Database
|--------------------------------------------------------------------------
*/

define('DB_HOST', $env['DB_HOST'] ?? '127.0.0.1');
define('DB_PORT', (int)($env['DB_PORT'] ?? 3306));
define('DB_NAME', $env['DB_NAME'] ?? '');
define('DB_USER', $env['DB_USER'] ?? '');
define('DB_PASS', $env['DB_PASS'] ?? '');

/*
|--------------------------------------------------------------------------
| Paths
|--------------------------------------------------------------------------
*/

define('APP_ROOT', __DIR__);
define('BACKUP_DIR', APP_ROOT . DIRECTORY_SEPARATOR . 'backups');

define('MYSQLDUMP_PATH', $env['MYSQLDUMP_PATH'] ?? '');
define('MYSQL_CLI_PATH', $env['MYSQL_CLI_PATH'] ?? '');

/*
|--------------------------------------------------------------------------
| Timezone
|--------------------------------------------------------------------------
*/

date_default_timezone_set($env['TIMEZONE'] ?? 'Asia/Kabul');

/*
|--------------------------------------------------------------------------
| Session
|--------------------------------------------------------------------------
*/

ini_set('session.use_strict_mode', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.gc_maxlifetime', '43200');

/*
|--------------------------------------------------------------------------
| Error Reporting
|--------------------------------------------------------------------------
*/

if (APP_DEBUG) {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(E_ALL);
    ini_set('display_errors', '0');
}

ini_set('log_errors', '1');
ini_set('error_log', APP_ROOT . DIRECTORY_SEPARATOR . 'php-error.log');