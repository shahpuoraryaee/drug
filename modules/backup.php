<?php
declare(strict_types=1);

/**
 * Backup & restore.
 * Prefers mysqldump / mysql CLI when paths are configured in config.php;
 * otherwise falls back to a pure-PHP dump / restore so the app works on a
 * bare PHP Desktop + MySQL install with no PATH setup.
 */

function backup_list(): void
{
    Auth::require('backup', 'view');
    $rows = DB::rows('SELECT * FROM backups ORDER BY id DESC LIMIT 50');
    foreach ($rows as &$r) {
        $r['exists'] = is_file(BACKUP_DIR . '/' . $r['filename']);
    }
    ok($rows);
}

function backup_create(): void
{
    Auth::require('backup', 'backup');
    if (!is_dir(BACKUP_DIR) && !mkdir(BACKUP_DIR, 0777, true)) {
        fail('Cannot create backup directory: ' . BACKUP_DIR);
    }

    $filename = 'arya_backup_' . date('Y-m-d_His') . '.sql';
    $path     = BACKUP_DIR . '/' . $filename;

    $usedTool = 'php';
    if (defined('MYSQLDUMP_PATH') && MYSQLDUMP_PATH && is_file(MYSQLDUMP_PATH)) {
        $cmd = sprintf(
            '"%s" --host=%s --port=%d --user=%s %s --single-transaction --routines %s > "%s" 2>&1',
            MYSQLDUMP_PATH,
            escapeshellarg(DB_HOST), DB_PORT, escapeshellarg(DB_USER),
            DB_PASS !== '' ? '--password=' . escapeshellarg(DB_PASS) : '',
            escapeshellarg(DB_NAME), $path
        );
        exec($cmd, $o, $code);
        if ($code !== 0 || !is_file($path) || filesize($path) < 100) {
            @unlink($path);
            $usedTool = 'php'; // fall back
        } else {
            $usedTool = 'mysqldump';
        }
    }

    if ($usedTool === 'php') {
        backupPhpDump($path);
    }

    $size = filesize($path);
    $id = DB::insert('backups', [
        'filename'   => $filename,
        'size_bytes' => $size,
        'method'     => $usedTool,
        'created_by' => Auth::id(),
    ]);
    audit('create', 'backups', $id, null, ['filename' => $filename, 'size' => $size]);
    ok(['id' => $id, 'filename' => $filename, 'size_bytes' => $size, 'method' => $usedTool]);
}

/** Pure-PHP dump: schema + data as portable INSERT statements. */
function backupPhpDump(string $path): void
{
    $fh = fopen($path, 'wb');
    if (!$fh) fail('Cannot write backup file.');

    fwrite($fh, "-- Arya Pharma Manager backup\n-- " . date('c') . "\n\n");
    fwrite($fh, "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n");

    $tables = array_map(fn($r) => array_values($r)[0], DB::rows('SHOW TABLES'));
    foreach ($tables as $t) {
        $create = DB::row("SHOW CREATE TABLE `$t`");
        fwrite($fh, "DROP TABLE IF EXISTS `$t`;\n" . $create['Create Table'] . ";\n\n");

        $stmt = DB::pdo()->query("SELECT * FROM `$t`");
        $batch = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $vals = array_map(
                fn($v) => $v === null ? 'NULL' : DB::pdo()->quote((string) $v),
                array_values($row)
            );
            $batch[] = '(' . implode(',', $vals) . ')';
            if (count($batch) >= 200) {
                fwrite($fh, "INSERT INTO `$t` VALUES\n" . implode(",\n", $batch) . ";\n");
                $batch = [];
            }
        }
        if ($batch) fwrite($fh, "INSERT INTO `$t` VALUES\n" . implode(",\n", $batch) . ";\n");
        fwrite($fh, "\n");
    }
    fwrite($fh, "SET FOREIGN_KEY_CHECKS = 1;\n");
    fclose($fh);
}

function backup_restore(): void
{
    Auth::require('backup', 'restore');
    $id = inInt('id');
    $b  = DB::row('SELECT * FROM backups WHERE id = ?', [$id]);
    if (!$b) fail('Backup not found.', 404);
    $path = BACKUP_DIR . '/' . $b['filename'];
    if (!is_file($path)) fail('Backup file is missing on disk: ' . $b['filename']);

    if (defined('MYSQL_CLI_PATH') && MYSQL_CLI_PATH && is_file(MYSQL_CLI_PATH)) {
        $cmd = sprintf(
            '"%s" --host=%s --port=%d --user=%s %s %s < "%s" 2>&1',
            MYSQL_CLI_PATH,
            escapeshellarg(DB_HOST), DB_PORT, escapeshellarg(DB_USER),
            DB_PASS !== '' ? '--password=' . escapeshellarg(DB_PASS) : '',
            escapeshellarg(DB_NAME), $path
        );
        exec($cmd, $o, $code);
        if ($code === 0) {
            audit('restore', 'backups', $id, null, ['method' => 'mysql-cli']);
            ok(['method' => 'mysql-cli']);
        }
        // else fall through to PHP restore
    }

    restoreSqlFile($path);
    audit('restore', 'backups', $id, null, ['method' => 'php']);
    ok(['method' => 'php']);
}

/** Splits an SQL file into statements (quote-aware) and executes them. */
function restoreSqlFile(string $path): void
{
    $sql = file_get_contents($path);
    if ($sql === false) fail('Cannot read backup file.');

    DB::pdo()->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach (splitSqlStatements($sql) as $stmt) {
        DB::pdo()->exec($stmt);
    }
    DB::pdo()->exec('SET FOREIGN_KEY_CHECKS = 1');
}

function splitSqlStatements(string $sql): array
{
    $stmts = [];
    $buf = '';
    $len = strlen($sql);
    $inS = false; $inD = false; $inBt = false; $inLineC = false; $inBlockC = false;

    for ($i = 0; $i < $len; $i++) {
        $ch = $sql[$i];
        $next = $i + 1 < $len ? $sql[$i + 1] : '';

        if ($inLineC)  { if ($ch === "\n") $inLineC = false; continue; }
        if ($inBlockC) { if ($ch === '*' && $next === '/') { $inBlockC = false; $i++; } continue; }

        if (!$inS && !$inD && !$inBt) {
            if ($ch === '-' && $next === '-') { $inLineC = true; $i++; continue; }
            if ($ch === '#') { $inLineC = true; continue; }
            if ($ch === '/' && $next === '*') { $inBlockC = true; $i++; continue; }
        }

        if ($ch === "'" && !$inD && !$inBt) {
            if ($inS && $next === "'") { $buf .= "''"; $i++; continue; } // escaped quote
            if ($inS && $i > 0 && $sql[$i - 1] === '\\') { $buf .= $ch; continue; }
            $inS = !$inS;
        } elseif ($ch === '"' && !$inS && !$inBt) {
            if ($inD && $i > 0 && $sql[$i - 1] === '\\') { $buf .= $ch; continue; }
            $inD = !$inD;
        } elseif ($ch === '`' && !$inS && !$inD) {
            $inBt = !$inBt;
        }

        if ($ch === ';' && !$inS && !$inD && !$inBt) {
            $s = trim($buf);
            if ($s !== '') $stmts[] = $s;
            $buf = '';
            continue;
        }
        $buf .= $ch;
    }
    $s = trim($buf);
    if ($s !== '') $stmts[] = $s;
    return $stmts;
}

function backup_delete(): void
{
    Auth::require('backup', 'delete');
    $id = inInt('id');
    $b  = DB::row('SELECT * FROM backups WHERE id = ?', [$id]);
    if (!$b) fail('Backup not found.', 404);
    @unlink(BACKUP_DIR . '/' . $b['filename']);
    DB::exec('DELETE FROM backups WHERE id = ?', [$id]);
    audit('delete', 'backups', $id, $b, null);
    ok();
}

/** Streams a backup file to the browser for download. */
function backup_download(): void
{
    Auth::require('backup', 'view');
    $id = inInt('id');
    $b  = DB::row('SELECT * FROM backups WHERE id = ?', [$id]);
    if (!$b) fail('Backup not found.', 404);
    $path = BACKUP_DIR . '/' . $b['filename'];
    if (!is_file($path)) fail('File missing on disk.');

    header('Content-Type: application/sql');
    header('Content-Disposition: attachment; filename="' . $b['filename'] . '"');
    header('Content-Length: ' . filesize($path));
    readfile($path);
    exit;
}
