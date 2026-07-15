<?php
declare(strict_types=1);

function expenses_list(): void
{
    Auth::require('expenses', 'view');
    [$page, $per, $off] = paging();
    $where = ['e.deleted_at IS NULL'];
    $params = [];
    if ($c = inInt('category_id')) { $where[] = 'e.expense_category_id = ?'; $params[] = $c; }
    if (validDate(inStr('from')))  { $where[] = 'e.expense_date >= ?'; $params[] = inStr('from'); }
    if (validDate(inStr('to')))    { $where[] = 'e.expense_date <= ?'; $params[] = inStr('to'); }
    if ($q = inStr('q'))           { $where[] = 'e.description LIKE ?'; $params[] = "%$q%"; }

    $w = implode(' AND ', $where);
    $total = (int) DB::val("SELECT COUNT(*) FROM expenses e WHERE $w", $params);
    $sum   = (float) DB::val("SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE $w", $params);
    $rows  = DB::rows(
        "SELECT e.id, e.amount, e.expense_date, e.description, e.paid_by, ec.name AS category, ec.id AS category_id
         FROM expenses e JOIN expense_categories ec ON ec.id = e.expense_category_id
         WHERE $w ORDER BY e.expense_date DESC, e.id DESC LIMIT $per OFFSET $off",
        $params
    );
    $out = paged($rows, $total, $page, $per);
    $out['sum'] = $sum;
    ok($out);
}

function expenses_categories(): void
{
    Auth::require('expenses', 'view');
    ok(DB::rows('SELECT id, name FROM expense_categories WHERE status = 1 ORDER BY id'));
}

function expenses_save(): void
{
    $id = inInt('id');
    Auth::require('expenses', $id ? 'edit' : 'add');
    requireFields(['expense_category_id', 'amount', 'expense_date']);
    if (!validDate(inStr('expense_date'))) fail('Date is invalid.');
    if (inFloat('amount') <= 0) fail('Amount must be positive.');

    $data = [
        'expense_category_id' => inInt('expense_category_id'),
        'amount'              => inFloat('amount'),
        'expense_date'        => inStr('expense_date'),
        'description'         => inStr('description') ?: null,
        'paid_by'             => inStr('paid_by') ?: null,
    ];
    if ($id) {
        $old = DB::row('SELECT * FROM expenses WHERE id = ?', [$id]);
        DB::update('expenses', $data, 'id = ?', [$id]);
        audit('update', 'expenses', $id, $old, $data);
        ok(['id' => $id]);
    }
    $data['created_by'] = Auth::id();
    $newId = DB::insert('expenses', $data);
    audit('create', 'expenses', $newId, null, $data);
    ok(['id' => $newId]);
}

function expenses_delete(): void
{
    Auth::require('expenses', 'delete');
    $id = inInt('id');
    $old = DB::row('SELECT * FROM expenses WHERE id = ?', [$id]);
    DB::exec('UPDATE expenses SET deleted_at = NOW() WHERE id = ?', [$id]);
    audit('delete', 'expenses', $id, $old);
    ok();
}

/* ---------------- Expense attachment (v1.2, SRS Module 9) ---------------- */
function expenses_uploadAttachment(): void
{
    Auth::require('expenses', 'edit');
    $id = inInt('id');
    $ex = DB::row('SELECT id, attachment_path FROM expenses WHERE id = ? AND deleted_at IS NULL', [$id]);
    if (!$ex) fail('Expense not found.', 404);
    $path = saveUpload('file', 'expenses', ['jpg', 'jpeg', 'png', 'webp', 'pdf'], 4096);
    deleteUpload($ex['attachment_path']);
    DB::update('expenses', ['attachment_path' => $path], 'id = ?', [$id]);
    audit('update', 'expenses', $id, null, ['attachment_path' => $path]);
    ok(['attachment_path' => $path]);
}

function expenses_removeAttachment(): void
{
    Auth::require('expenses', 'edit');
    $id = inInt('id');
    $ex = DB::row('SELECT id, attachment_path FROM expenses WHERE id = ?', [$id]);
    if (!$ex) fail('Expense not found.', 404);
    deleteUpload($ex['attachment_path']);
    DB::update('expenses', ['attachment_path' => null], 'id = ?', [$id]);
    ok();
}
