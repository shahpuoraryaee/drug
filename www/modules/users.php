<?php
declare(strict_types=1);

/** User management — owner only (Auth::MATRIX gives users.* to owner alone). */

function users_list(): void
{
    Auth::require('users', 'view');
    $rows = DB::rows(
        "SELECT id, username, full_name, role, phone, status, last_login_at, created_at
           FROM users WHERE deleted_at IS NULL ORDER BY id"
    );
    ok($rows);
}

function users_save(): void
{
    $id = inInt('id');
    Auth::require('users', $id ? 'edit' : 'add');

    requireFields(['username', 'full_name', 'role']);
    $role = inStr('role');
    if (!in_array($role, ['owner', 'manager', 'storekeeper', 'accountant', 'cashier'], true)) {
        fail('Invalid role.');
    }

    $data = [
        'username'  => strtolower(inStr('username')),
        'full_name' => inStr('full_name'),
        'role'      => $role,
        'phone'     => inStr('phone') ?: null,
        'status'    => inInt('status', 1) ? 1 : 0,
    ];
    if (!preg_match('/^[a-z0-9_.]{3,30}$/', $data['username'])) {
        fail('Username must be 3–30 chars: letters, digits, dot, underscore.');
    }

    $password = inStr('password');
    if (!$id && $password === '') fail('Password is required for a new user.');
    if ($password !== '' && mb_strlen($password) < 6) fail('Password must be at least 6 characters.');
    if ($password !== '') $data['password_hash'] = password_hash($password, PASSWORD_DEFAULT);

    if ($id) {
        $old = DB::row('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [$id]);
        if (!$old) fail('User not found.', 404);

        // Never let the last active owner demote / deactivate themself out of the system.
        if ($old['role'] === 'owner' && ($data['role'] !== 'owner' || !$data['status'])) {
            $owners = (int) DB::val(
                "SELECT COUNT(*) FROM users WHERE role='owner' AND status=1 AND deleted_at IS NULL AND id <> ?",
                [$id]
            );
            if ($owners === 0) fail('Cannot demote or deactivate the only active owner.');
        }
        DB::update('users', $data, 'id = ?', [$id]);
        audit('update', 'users', $id, $old, $data);
    } else {
        $id = DB::insert('users', $data);
        audit('create', 'users', $id, null, $data);
    }
    ok(['id' => $id]);
}

function users_delete(): void
{
    Auth::require('users', 'delete');
    $id = inInt('id');
    if ($id === Auth::id()) fail('You cannot delete your own account.');

    $u = DB::row('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [$id]);
    if (!$u) fail('User not found.', 404);
    if ($u['role'] === 'owner') {
        $owners = (int) DB::val(
            "SELECT COUNT(*) FROM users WHERE role='owner' AND status=1 AND deleted_at IS NULL AND id <> ?",
            [$id]
        );
        if ($owners === 0) fail('Cannot delete the only active owner.');
    }
    DB::exec('UPDATE users SET deleted_at = NOW(), status = 0 WHERE id = ?', [$id]);
    audit('delete', 'users', $id, $u, null);
    ok();
}

/** Any signed-in user may change their own password. */
function users_changePassword(): void
{
    requireFields(['current_password', 'new_password']);
    $new = inStr('new_password');
    if (mb_strlen($new) < 6) fail('New password must be at least 6 characters.');

    $u = DB::row('SELECT * FROM users WHERE id = ?', [Auth::id()]);
    if (!$u || !password_verify(inStr('current_password'), $u['password_hash'])) {
        fail('Current password is incorrect.');
    }
    DB::update('users', ['password_hash' => password_hash($new, PASSWORD_DEFAULT)], 'id = ?', [Auth::id()]);
    audit('update', 'users', Auth::id(), null, ['password' => 'changed']);
    ok();
}
