<?php
declare(strict_types=1);

function income_list(): void
{
    Auth::require('income', 'view');
    [$page, $per, $off] = paging();
    $where = ['i.deleted_at IS NULL'];
    $params = [];
    if ($c = inInt('category_id')) { $where[] = 'i.income_category_id = ?'; $params[] = $c; }
    if (validDate(inStr('from')))  { $where[] = 'i.income_date >= ?'; $params[] = inStr('from'); }
    if (validDate(inStr('to')))    { $where[] = 'i.income_date <= ?'; $params[] = inStr('to'); }
    if ($q = inStr('q'))           { $where[] = 'i.description LIKE ?'; $params[] = "%$q%"; }

    $w = implode(' AND ', $where);
    $total = (int) DB::val("SELECT COUNT(*) FROM incomes i WHERE $w", $params);
    $sum   = (float) DB::val("SELECT COALESCE(SUM(i.amount),0) FROM incomes i WHERE $w", $params);
    $rows  = DB::rows(
        "SELECT i.id, i.amount, i.income_date, i.description, ic.name AS category, ic.id AS category_id
         FROM incomes i JOIN income_categories ic ON ic.id = i.income_category_id
         WHERE $w ORDER BY i.income_date DESC, i.id DESC LIMIT $per OFFSET $off",
        $params
    );
    $out = paged($rows, $total, $page, $per);
    $out['sum'] = $sum;
    ok($out);
}

function income_categories(): void
{
    Auth::require('income', 'view');
    ok(DB::rows('SELECT id, name FROM income_categories WHERE status = 1 ORDER BY id'));
}

function income_save(): void
{
    $id = inInt('id');
    Auth::require('income', $id ? 'edit' : 'add');

    // Editing an existing income entry may only change its description.
    // The amount, date and category are locked once recorded so income
    // history stays trustworthy — create a new entry to correct those.
    if ($id) {
        $old = DB::row('SELECT * FROM incomes WHERE id = ? AND deleted_at IS NULL', [$id]);
        if (!$old) fail('Income entry not found.', 404);
        $data = ['description' => inStr('description') ?: null];
        DB::update('incomes', $data, 'id = ?', [$id]);
        audit('update', 'incomes', $id, $old, $data);
        ok(['id' => $id]);
    }

    requireFields(['income_category_id', 'amount', 'income_date']);
    if (!validDate(inStr('income_date'))) fail('Date is invalid.');
    if (inFloat('amount') <= 0) fail('Amount must be positive.');

    $data = [
        'income_category_id' => inInt('income_category_id'),
        'amount'             => inFloat('amount'),
        'income_date'        => inStr('income_date'),
        'description'        => inStr('description') ?: null,
        'created_by'         => Auth::id(),
    ];
    $newId = DB::insert('incomes', $data);
    audit('create', 'incomes', $newId, null, $data);
    ok(['id' => $newId]);
}

/**
 * Income entries cannot be deleted by anyone, including the owner —
 * they represent money already received and must stay in the record
 * for an accurate financial history. This endpoint is kept only so
 * the frontend gets a clear, consistent error rather than a 404.
 */
function income_delete(): void
{
    fail('Income entries cannot be deleted. Only the description can be edited.', 403);
}
