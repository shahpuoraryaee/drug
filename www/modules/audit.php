<?php
declare(strict_types=1);

/**
 * AUDIT LOG viewer + login history (v1.2, SRS Module 11).
 * Read-only: the log itself is written by audit() everywhere else.
 * MATRIX gives access to the owner ('*'); nobody can edit or delete entries.
 */

function audit_list(): void
{
    Auth::require('audit', 'view');
    [$page, $per, $off] = paging();

    $where = ['1=1']; $params = [];
    if ($e = inStr('entity'))  { $where[] = 'a.entity = ?'; $params[] = $e; }
    if ($ac = inStr('act'))    { $where[] = 'a.action = ?'; $params[] = $ac; }
    if ($u = inInt('user_id')) { $where[] = 'a.user_id = ?'; $params[] = $u; }
    if (validDate(inStr('from'))) { $where[] = 'DATE(a.created_at) >= ?'; $params[] = inStr('from'); }
    if (validDate(inStr('to')))   { $where[] = 'DATE(a.created_at) <= ?'; $params[] = inStr('to'); }
    $w = implode(' AND ', $where);

    $total = (int) DB::val("SELECT COUNT(*) FROM audit_logs a WHERE $w", $params);
    $rows = DB::rows(
        "SELECT a.id, a.action, a.entity, a.entity_id, a.old_data, a.new_data,
                a.ip_address, a.created_at, u.full_name AS user_name, u.username
           FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
          WHERE $w ORDER BY a.id DESC LIMIT $per OFFSET $off", $params);
    ok(paged($rows, $total, $page, $per));
}

/** Distinct filter values for the dropdowns. */
function audit_filters(): void
{
    Auth::require('audit', 'view');
    ok([
        'entities' => array_column(DB::rows('SELECT DISTINCT entity FROM audit_logs ORDER BY entity'), 'entity'),
        'actions'  => array_column(DB::rows('SELECT DISTINCT action FROM audit_logs ORDER BY action'), 'action'),
        'users'    => DB::rows('SELECT id, full_name FROM users ORDER BY full_name'),
    ]);
}

/** Login history: sign-ins/outs from the audit trail (SRS "Login History"). */
function audit_logins(): void
{
    Auth::require('audit', 'view');
    [$page, $per, $off] = paging();
    $total = (int) DB::val("SELECT COUNT(*) FROM audit_logs WHERE action IN ('login','logout')");
    $rows = DB::rows(
        "SELECT a.action, a.ip_address, a.created_at, u.full_name, u.username, u.role
           FROM audit_logs a LEFT JOIN users u ON u.id = a.entity_id
          WHERE a.action IN ('login','logout')
          ORDER BY a.id DESC LIMIT $per OFFSET $off");
    ok(paged($rows, $total, $page, $per));
}
