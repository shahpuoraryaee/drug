<?php
declare(strict_types=1);

function suppliers_list(): void
{
    Auth::require('suppliers', 'view');
    [$page, $per, $off] = paging();
    $where = ['deleted_at IS NULL'];
    $params = [];
    if ($q = inStr('q')) { $where[] = '(name LIKE ? OR phone LIKE ? OR contact_person LIKE ?)'; array_push($params, "$q%", "$q%", "$q%"); }
    $w = implode(' AND ', $where);
    $total = (int) DB::val("SELECT COUNT(*) FROM suppliers WHERE $w", $params);
    $rows = DB::rows(
        "SELECT id, name, contact_person, phone, email, address, balance, status
         FROM suppliers WHERE $w ORDER BY name LIMIT $per OFFSET $off",
        $params
    );
    ok(paged($rows, $total, $page, $per));
}

function suppliers_all(): void
{
    Auth::require('suppliers', 'view'); // lightweight list for dropdowns
    ok(DB::rows('SELECT id, name FROM suppliers WHERE deleted_at IS NULL AND status = 1 ORDER BY name'));
}

function suppliers_save(): void
{
    $id = inInt('id');
    Auth::require('suppliers', $id ? 'edit' : 'add');
    requireFields(['name']);
    $data = [
        'name'           => inStr('name'),
        'contact_person' => inStr('contact_person') ?: null,
        'phone'          => inStr('phone') ?: null,
        'email'          => inStr('email') ?: null,
        'address'        => inStr('address') ?: null,
        'notes'          => inStr('notes') ?: null,
        'status'         => inInt('status', 1) ? 1 : 0,
    ];
    if ($id) {
        DB::update('suppliers', $data, 'id = ?', [$id]);
        audit('update', 'suppliers', $id, null, $data);
        ok(['id' => $id]);
    }
    $newId = DB::insert('suppliers', $data);
    audit('create', 'suppliers', $newId, null, $data);
    ok(['id' => $newId]);
}

function suppliers_delete(): void
{
    Auth::require('suppliers', 'delete');
    $id = inInt('id');
    $bal = (float) DB::val('SELECT balance FROM suppliers WHERE id = ?', [$id]);
    if (abs($bal) > 0.001) fail('Cannot delete a supplier with an outstanding balance. Settle the ledger first.');
    DB::exec('UPDATE suppliers SET deleted_at = NOW() WHERE id = ?', [$id]);
    audit('delete', 'suppliers', $id);
    ok();
}

function suppliers_ledger(): void
{
    Auth::require('suppliers', 'view');
    $id = inInt('id');
    $sup = DB::row('SELECT id, name, balance FROM suppliers WHERE id = ?', [$id]);
    if (!$sup) fail('Supplier not found.', 404);
    [$page, $per, $off] = paging(30);
    $total = (int) DB::val('SELECT COUNT(*) FROM supplier_ledger WHERE supplier_id = ?', [$id]);
    $rows = DB::rows(
        "SELECT entry_type, debit, credit, balance_after, note, created_at
         FROM supplier_ledger WHERE supplier_id = ?
         ORDER BY id DESC LIMIT $per OFFSET $off",
        [$id]
    );
    ok(['supplier' => $sup, 'ledger' => paged($rows, $total, $page, $per)]);
}

/** Pay down supplier balance outside a specific invoice. */
function suppliers_pay(): void
{
    Auth::require('purchases', 'edit');
    $id = inInt('id');
    $amount = inFloat('amount');
    if ($amount <= 0) fail('Payment amount must be positive.');

    DB::tx(function () use ($id, $amount) {
        $bal = DB::val('SELECT balance FROM suppliers WHERE id = ? FOR UPDATE', [$id]);
        if ($bal === false) fail('Supplier not found.', 404);
        $new = (float) $bal - $amount;
        DB::insert('supplier_ledger', [
            'supplier_id' => $id, 'entry_type' => 'payment',
            'debit' => 0, 'credit' => $amount, 'balance_after' => $new,
            'note' => inStr('note') ?: 'Balance payment', 'created_by' => Auth::id(),
        ]);
        DB::exec('UPDATE suppliers SET balance = ? WHERE id = ?', [$new, $id]);
    });
    audit('payment', 'suppliers', $id, null, ['amount' => $amount]);
    ok();
}
