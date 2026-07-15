<?php
/**
 * Arya Pharma Manager — configuration
 * PHP 8.3 · MySQL/MariaDB · runs inside PHP Desktop (offline)
 */
declare(strict_types=1);

const APP_NAME    = 'Arya Pharma Manager';
const APP_VERSION = '1.0.0';

// ---- Database (local MariaDB/MySQL bundled next to the app) ----
const DB_HOST = '127.0.0.1';
const DB_PORT = 8889;
const DB_NAME = 'drug';
const DB_USER = 'root';
const DB_PASS = 'root';          // set your local MySQL root password here

// ---- Paths ----
define('APP_ROOT',   __DIR__);
define('BACKUP_DIR', APP_ROOT . DIRECTORY_SEPARATOR . 'backups');

// Optional: full path to mysqldump / mysql client for fast native backups.
// Leave empty to use the built-in pure-PHP backup (works everywhere).
const MYSQLDUMP_PATH = '';   // e.g. 'C:\\xampp\\mysql\\bin\\mysqldump.exe'
const MYSQL_CLI_PATH = '';   // e.g. 'C:\\xampp\\mysql\\bin\\mysql.exe'

// ---- Session ----
ini_set('session.use_strict_mode', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.gc_maxlifetime', '43200'); // 12h workday
date_default_timezone_set('Asia/Kabul');

error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('error_log', APP_ROOT . DIRECTORY_SEPARATOR . 'php-error.log');
