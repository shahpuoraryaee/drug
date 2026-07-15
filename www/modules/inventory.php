<?php
declare(strict_types=1);

function inventory_movements(): void
{
    Auth::require('inventory', 'view');
    [$page, $per, $off] = paging();
    $where = ['1=1'];
    $params = [];
    if ($pid = inInt('product_id')) { $where[] = 'im.product_id = ?'; $params[] = $pid; }
    if ($t = inStr('type'))         { $where[] = 'im.movement_type = ?'; $params[] = $t; }
    if ($q = inStr('q'))            { $where[] = 'p.medicine_name LIKE ?'; $params[] = "$q%"; }

    $w = implode(' AND ', $where);
    $total = (int) DB::val("SELECT COUNT(*) FROM inventory_movements im JOIN products p ON p.id = im.product_id WHERE $w", $params);
    $rows = DB::rows(
        "SELECT im.id, im.movement_type, im.quantity_change, im.quantity_after, im.note, im.created_at,
                p.medicine_name, p.product_code, p.unit, b.batch_number, u.full_name AS user
         FROM inventory_movements im
         JOIN products p ON p.id = im.product_id
         LEFT JOIN product_batches b ON b.id = im.batch_id
         LEFT JOIN users u ON u.id = im.created_by
         WHERE $w ORDER BY im.id DESC LIMIT $per OFFSET $off",
        $params
    );
    ok(paged($rows, $total, $page, $per));
}

/** Stock adjustment: damage / expired / lost / manual +/-. Always batch-aware. */
function inventory_adjust(): void
{
    Auth::require('inventory', 'edit');
    $pid  = inInt('product_id');
    $qty  = inInt('quantity');            // positive number entered by user
    $type = inStr('type');                // adjustment | damage | expired | lost
    $dir  = inStr('direction', 'out');    // in | out (only 'adjustment' may be 'in')

    if (!in_array($type, ['adjustment', 'damage', 'expired', 'lost'], true)) fail('Invalid adjustment type.');
    if ($qty <= 0) fail('Quantity must be a positive number.');
    if ($type !== 'adjustment') $dir = 'out';
    $change = $dir === 'in' ? $qty : -$qty;

    DB::tx(function () use ($pid, $qty, $type, $change) {
        $p = DB::row('SELECT id, quantity, medicine_name FROM products WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [$pid]);
        if (!$p) fail('Product not found.', 404);
        $newQty = (int) $p['quantity'] + $change;
        if ($newQty < 0) fail('Not enough stock: current quantity is ' . $p['quantity'] . '.');

        $batchId = inInt('batch_id') ?: null;
        if ($change < 0) {
            // reduce from a specific batch, or FEFO (first-expiry-first-out)
            $remaining = $qty;
            $batches = $batchId
                ? DB::rows('SELECT id, quantity FROM product_batches WHERE id = ? AND product_id = ? FOR UPDATE', [$batchId, $pid])
                : DB::rows('SELECT id, quantity FROM product_batches WHERE product_id = ? AND quantity > 0 ORDER BY expiry_date ASC FOR UPDATE', [$pid]);
            foreach ($batches as $b) {
                if ($remaining <= 0) break;
                $take = min($remaining, (int) $b['quantity']);
                DB::exec('UPDATE product_batches SET quantity = quantity - ? WHERE id = ?', [$take, $b['id']]);
                $remaining -= $take;
                $batchId ??= (int) $b['id'];
            }
            if ($remaining > 0) fail('Batches do not hold enough stock for this reduction.');
        } elseif ($batchId) {
            DB::exec('UPDATE product_batches SET quantity = quantity + ? WHERE id = ? AND product_id = ?', [$qty, $batchId, $pid]);
        }

        DB::exec('UPDATE products SET quantity = ? WHERE id = ?', [$newQty, $pid]);
        DB::insert('inventory_movements', [
            'product_id' => $pid, 'batch_id' => $batchId,
            'movement_type' => $type, 'quantity_change' => $change, 'quantity_after' => $newQty,
            'reference_type' => 'adjustment', 'note' => inStr('note') ?: ucfirst($type),
            'created_by' => Auth::id(),
        ]);
    });

    audit('adjust', 'inventory', $pid, null, ['type' => $type, 'change' => $change]);
    ok();
}

/** Expiry report list: batches with stock, bucketed. */
function inventory_expiry(): void
{
    Auth::require('inventory', 'view');
    [$page, $per, $off] = paging();
    $days = inInt('days', 90);   // -1 = expired only
    $where = 'b.quantity > 0 AND b.expiry_date IS NOT NULL AND ';
    $params = [];
    if ($days === -1) {
        $where .= 'b.expiry_date < CURDATE()';
    } else {
        $where .= 'b.expiry_date >= CURDATE() AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)';
        $params[] = $days;
    }
    $total = (int) DB::val("SELECT COUNT(*) FROM product_batches b WHERE $where", $params);
    $rows = DB::rows(
        "SELECT b.id AS batch_id, b.batch_number, b.quantity, b.expiry_date,
                DATEDIFF(b.expiry_date, CURDATE()) AS days_left,
                p.id AS product_id, p.product_code, p.medicine_name, p.unit,
                ROUND(b.quantity * b.unit_cost, 2) AS value_at_cost
         FROM product_batches b JOIN products p ON p.id = b.product_id
         WHERE $where AND p.deleted_at IS NULL
         ORDER BY b.expiry_date ASC LIMIT $per OFFSET $off",
        $params
    );
    ok(paged($rows, $total, $page, $per));
}

function inventory_batches(): void
{
    Auth::require('inventory', 'view');
    ok(DB::rows(
        'SELECT id, batch_number, quantity, expiry_date FROM product_batches
         WHERE product_id = ? AND quantity > 0 ORDER BY expiry_date ASC',
        [inInt('product_id')]
    ));
}
