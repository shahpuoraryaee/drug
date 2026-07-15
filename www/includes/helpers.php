<?php
declare(strict_types=1);

/* ---------------- JSON I/O ---------------- */

function ok(mixed $data = null): never
{
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $message, int $status = 400): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

/** Parsed JSON body (POST) merged over query string. */
function input(): array
{
    static $in = null;
    if ($in === null) {
        $body = file_get_contents('php://input');
        $json = $body ? json_decode($body, true) : [];
        // $_POST is populated instead of php://input for multipart uploads (v1.2)
        $in = array_merge($_GET, $_POST, is_array($json) ? $json : []);
    }
    return $in;
}

function inStr(string $key, string $default = ''): string
{
    $v = input()[$key] ?? $default;
    return is_scalar($v) ? trim((string) $v) : $default;
}
function inInt(string $key, int $default = 0): int
{
    return (int) (input()[$key] ?? $default);
}
function inFloat(string $key, float $default = 0.0): float
{
    return (float) (input()[$key] ?? $default);
}
function inArr(string $key): array
{
    $v = input()[$key] ?? [];
    return is_array($v) ? $v : [];
}

function requireFields(array $fields): void
{
    foreach ($fields as $f) {
        if (inStr($f) === '') fail("Field '$f' is required.");
    }
}

function validDate(string $d): bool
{
    return (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && strtotime($d) !== false;
}

/* ---------------- Pagination ---------------- */

/** Returns [page, perPage, offset]. Hard cap keeps payloads small. */
function paging(int $defaultPer = 25, int $maxPer = 100): array
{
    $page = max(1, inInt('page', 1));
    $per  = min($maxPer, max(5, inInt('per', $defaultPer)));
    return [$page, $per, ($page - 1) * $per];
}

function paged(array $rows, int $total, int $page, int $per): array
{
    return [
        'rows'  => $rows,
        'total' => $total,
        'page'  => $page,
        'per'   => $per,
        'pages' => (int) ceil(max(1, $total) / $per),
    ];
}

/* ---------------- Audit trail ---------------- */

function audit(string $action, string $entity, ?int $entityId = null, ?array $old = null, ?array $new = null): void
{
    try {
        DB::insert('audit_logs', [
            'user_id'    => Auth::id(),
            'action'     => $action,
            'entity'     => $entity,
            'entity_id'  => $entityId,
            'old_data'   => $old ? json_encode($old, JSON_UNESCAPED_UNICODE) : null,
            'new_data'   => $new ? json_encode($new, JSON_UNESCAPED_UNICODE) : null,
            'ip_address' => $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
    } catch (Throwable) {
        // auditing must never break the main operation
    }
}

/* ---------------- Settings ---------------- */

function settingsAll(): array
{
    $out = [];
    foreach (DB::rows('SELECT setting_key, setting_value FROM settings') as $r) {
        $out[$r['setting_key']] = $r['setting_value'];
    }
    return $out;
}

function setting(string $key, ?string $default = null): ?string
{
    $v = DB::val('SELECT setting_value FROM settings WHERE setting_key = ?', [$key]);
    return $v === false ? $default : ($v ?? $default);
}

function settingSet(string $key, ?string $value): void
{
    DB::exec(
        'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
        [$key, $value]
    );
}

/* ---------------- CSV export ---------------- */

function csvOut(string $filename, array $header, array $rows): never
{
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    $fp = fopen('php://output', 'w');
    fputs($fp, "\xEF\xBB\xBF"); // UTF-8 BOM for Excel
    fputcsv($fp, $header);
    foreach ($rows as $r) fputcsv($fp, array_values($r));
    fclose($fp);
    exit;
}

/* ---------------- File uploads (v1.2) ---------------- */

/**
 * Validate and store an uploaded file. Returns the web path (relative to www/).
 * Only benign types, size-capped, random file name — never trusts the client name.
 */
function saveUpload(string $field, string $subdir, array $allowedExt, int $maxKb = 2048): string
{
    if (empty($_FILES[$field]) || $_FILES[$field]['error'] !== UPLOAD_ERR_OK) {
        fail('No file received (or upload error).');
    }
    $f = $_FILES[$field];
    if ($f['size'] > $maxKb * 1024) fail("File is too large (max {$maxKb} KB).");

    $ext = strtolower(pathinfo((string) $f['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $allowedExt, true)) {
        fail('File type not allowed. Allowed: ' . implode(', ', $allowedExt) . '.');
    }
    // verify image files really are images
    if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true) && @getimagesize($f['tmp_name']) === false) {
        fail('The file is not a valid image.');
    }

    $dir = __DIR__ . '/../uploads/' . $subdir;
    if (!is_dir($dir) && !mkdir($dir, 0777, true)) fail('Cannot create the uploads folder.');
    $name = date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
    if (!move_uploaded_file($f['tmp_name'], "$dir/$name")) fail('Could not store the file.');
    return "uploads/$subdir/$name";
}

/** Delete a previously stored upload if it lives inside uploads/ (safe). */
function deleteUpload(?string $webPath): void
{
    if (!$webPath || !str_starts_with($webPath, 'uploads/')) return;
    $abs = __DIR__ . '/../' . $webPath;
    if (is_file($abs)) @unlink($abs);
}
