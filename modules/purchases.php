<?php
declare(strict_types=1);

/**
 * Purchases. Posting an invoice is one atomic transaction:
 *   purchase + items → new/merged batch → product qty + moving-average cost
 *   → inventory movement → supplier ledger + balance.
 * If anything fails, everything rolls back.
 */

function purchases_list(): void
{
    Auth::require('purchases', 'view');
    [$page, $per, $off] = paging();
    $where  = ['pu.deleted_at IS NULL'];
    $params = [];

    if ($q = inStr('q'))            { $where[] = '(pu.invoice_number LIKE ? OR s.name LIKE ?)'; $params[] = "$q%"; $params[] = "$q%"; }
    if ($sup = inInt('supplier_id')){ $where[] = 'pu.supplier_id = ?'; $params[] = $sup; }
    if ($st = inStr('status'))      { $where[] = 'pu.payment_status = ?'; $params[] = $st; }
    if (validDate(inStr('from')))   { $where[] = 'pu.purchase_date >= ?'; $params[] = inStr('from'); }
    if (validDate(inStr('to')))     { $where[] = 'pu.purchase_date <= ?'; $params[] = inStr('to'); }

    $w = implode(' AND ', $where);
    $total = (int) DB::val("SELECT COUNT(*) FROM purchases pu JOIN suppliers s ON s.id = pu.supplier_id WHERE $w", $params);
    $rows = DB::rows(
        "SELECT pu.id, pu.invoice_number, pu.purchase_date, pu.grand_total, pu.paid_amount,
                pu.payment_status, s.name AS supplier,
                (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = pu.id) AS item_count
         FROM purchases pu JOIN suppliers s ON s.id = pu.supplier_id
         WHERE $w ORDER BY pu.purchase_date DESC, pu.id DESC
         LIMIT $per OFFSET $off",
        $params
    );
    ok(paged($rows, $total, $page, $per));
}

function purchases_get(): void
{
    Auth::require('purchases', 'view');
    $id = inInt('id');
    $p = DB::row(
        'SELECT pu.*, s.name AS supplier FROM purchases pu
         JOIN suppliers s ON s.id = pu.supplier_id WHERE pu.id = ? AND pu.deleted_at IS NULL',
        [$id]
    );
    if (!$p) fail('Purchase not found.', 404);
    $items = DB::rows(
        'SELECT pi.*, pr.medicine_name, pr.product_code, pr.unit
         FROM purchase_items pi JOIN products pr ON pr.id = pi.product_id
         WHERE pi.purchase_id = ?',
        [$id]
    );
    // shape matches the front-end (d.purchase / d.items) — fixed in v1.2
    ok(['purchase' => $p, 'items' => $items]);
}

function purchases_save(): void
{
    Auth::require('purchases', 'add');
    requireFields(['supplier_id', 'purchase_date']);
    if (!validDate(inStr('purchase_date'))) fail('Purchase date is invalid.');

    $items = inArr('items');
    if (!$items) fail('Add at least one item to the invoice.');

    $supplierId = inInt('supplier_id');
    if (!DB::row('SELECT id FROM suppliers WHERE id = ? AND deleted_at IS NULL', [$supplierId])) {
        fail('Supplier not found.');
    }

    $discount = max(0, inFloat('discount'));
    $shipping = max(0, inFloat('shipping'));
    $tax      = max(0, inFloat('tax'));
    $paid     = max(0, inFloat('paid_amount'));

    $result = DB::tx(function () use ($items, $supplierId, $discount, $shipping, $tax, $paid) {

        // ---- validate items & compute subtotal ----
        $subtotal = 0.0;
        $clean = [];
        foreach ($items as $it) {
            $pid  = (int) ($it['product_id'] ?? 0);
            $qty  = (int) ($it['quantity'] ?? 0);
            $cost = (float) ($it['unit_cost'] ?? 0);
            if ($pid <= 0 || $qty <= 0 || $cost < 0) fail('Each item needs a product, quantity and cost.');
            $prod = DB::row('SELECT id, quantity, average_cost FROM products WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [$pid]);
            if (!$prod) fail("Item product #$pid not found.");
            $exp = (string) ($it['expiry_date'] ?? '');
            $mfg = (string) ($it['manufacturing_date'] ?? '');
            $clean[] = [
                'product'      => $prod,
                'product_id'   => $pid,
                'quantity'     => $qty,
                'unit_cost'    => $cost,
                'line_total'   => round($qty * $cost, 2),
                'batch_number' => trim((string) ($it['batch_number'] ?? '')) ?: ('B-' . random_int(10000, 99999)),
                'expiry_date'  => validDate($exp) ? $exp : null,
                'manufacturing_date' => validDate($mfg) ? $mfg : null,
            ];
            $subtotal += $qty * $cost;
        }
        $subtotal   = round($subtotal, 2);
        $grandTotal = round($subtotal - $discount + $shipping + $tax, 2);
        if ($grandTotal < 0) fail('Grand total cannot be negative.');
        $status = $paid >= $grandTotal ? 'paid' : ($paid > 0 ? 'partial' : 'unpaid');

        // ---- purchase header ----
        $purchaseId = DB::insert('purchases', [
            'invoice_number' => inStr('invoice_number') ?: nextInvoiceNumber(),
            'supplier_id'    => $supplierId,
            'purchase_date'  => inStr('purchase_date'),
            'subtotal'       => $subtotal,
            'discount'       => $discount,
            'shipping'       => $shipping,
            'tax'            => $tax,
            'grand_total'    => $grandTotal,
            'paid_amount'    => min($paid, $grandTotal),
            'payment_status' => $status,
            'notes'          => inStr('notes') ?: null,
            'created_by'     => Auth::id(),
        ]);

        // ---- items → batches → stock → movements ----
        foreach ($clean as $it) {
            $itemId = DB::insert('purchase_items', [
                'purchase_id'        => $purchaseId,
                'product_id'         => $it['product_id'],
                'batch_number'       => $it['batch_number'],
                'manufacturing_date' => $it['manufacturing_date'],
                'expiry_date'        => $it['expiry_date'],
                'quantity'           => $it['quantity'],
                'unit_cost'          => $it['unit_cost'],
                'line_total'         => $it['line_total'],
            ]);

            // merge into existing batch with same number+expiry, else create
            $batch = DB::row(
                'SELECT id, quantity FROM product_batches
                 WHERE product_id = ? AND batch_number = ? AND (expiry_date <=> ?) LIMIT 1 FOR UPDATE',
                [$it['product_id'], $it['batch_number'], $it['expiry_date']]
            );
            if ($batch) {
                DB::exec('UPDATE product_batches SET quantity = quantity + ?, unit_cost = ? WHERE id = ?',
                    [$it['quantity'], $it['unit_cost'], $batch['id']]);
                $batchId = (int) $batch['id'];
            } else {
                $batchId = DB::insert('product_batches', [
                    'product_id'         => $it['product_id'],
                    'batch_number'       => $it['batch_number'],
                    'quantity'           => $it['quantity'],
                    'unit_cost'          => $it['unit_cost'],
                    'manufacturing_date' => $it['manufacturing_date'],
                    'expiry_date'        => $it['expiry_date'],
                ]);
            }

            DB::exec('UPDATE purchase_items SET batch_id = ? WHERE id = ?', [$batchId, $itemId]); // v1.2

            // moving average cost, cached quantity, last purchase price
            $oldQty = (int) $it['product']['quantity'];
            $oldAvg = (float) $it['product']['average_cost'];
            $newQty = $oldQty + $it['quantity'];
            $newAvg = $newQty > 0
                ? round((($oldQty * $oldAvg) + ($it['quantity'] * $it['unit_cost'])) / $newQty, 4)
                : $it['unit_cost'];

            DB::exec('UPDATE products SET quantity = ?, average_cost = ?, purchase_price = ? WHERE id = ?',
                [$newQty, $newAvg, $it['unit_cost'], $it['product_id']]);

            DB::insert('inventory_movements', [
                'product_id'      => $it['product_id'],
                'batch_id'        => $batchId,
                'movement_type'   => 'purchase',
                'quantity_change' => $it['quantity'],
                'quantity_after'  => $newQty,
                'reference_type'  => 'purchase',
                'reference_id'    => $purchaseId,
                'note'            => 'Invoice posting',
                'created_by'      => Auth::id(),
            ]);
        }

        // ---- supplier ledger + balance ----
        $bal = (float) DB::val('SELECT balance FROM suppliers WHERE id = ? FOR UPDATE', [$supplierId]);
        $bal += $grandTotal;
        DB::insert('supplier_ledger', [
            'supplier_id' => $supplierId, 'entry_type' => 'purchase',
            'debit' => $grandTotal, 'credit' => 0, 'balance_after' => $bal,
            'reference_id' => $purchaseId, 'note' => 'Purchase invoice', 'created_by' => Auth::id(),
        ]);
        if ($paid > 0) {
            $pay = min($paid, $grandTotal);
            $bal -= $pay;
            DB::insert('supplier_ledger', [
                'supplier_id' => $supplierId, 'entry_type' => 'payment',
                'debit' => 0, 'credit' => $pay, 'balance_after' => $bal,
                'reference_id' => $purchaseId, 'note' => 'Payment with invoice', 'created_by' => Auth::id(),
            ]);
        }
        DB::exec('UPDATE suppliers SET balance = ? WHERE id = ?', [$bal, $supplierId]);

        return ['id' => $purchaseId, 'grand_total' => $grandTotal, 'payment_status' => $status];
    });

    audit('create', 'purchases', $result['id'], null, $result);
    ok($result);
}

/** Record an additional payment against an invoice. */
function purchases_pay(): void
{
    Auth::require('purchases', 'edit');
    $id = inInt('id');
    $amount = inFloat('amount');
    if ($amount <= 0) fail('Payment amount must be positive.');

    $result = DB::tx(function () use ($id, $amount) {
        $p = DB::row('SELECT * FROM purchases WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [$id]);
        if (!$p) fail('Purchase not found.', 404);
        $due = (float) $p['grand_total'] - (float) $p['paid_amount'];
        if ($amount > $due + 0.001) fail('Payment exceeds the amount due (' . number_format($due, 2) . ').');

        $newPaid = (float) $p['paid_amount'] + $amount;
        $status  = $newPaid >= (float) $p['grand_total'] - 0.001 ? 'paid' : 'partial';
        DB::exec('UPDATE purchases SET paid_amount = ?, payment_status = ? WHERE id = ?', [$newPaid, $status, $id]);

        $bal = (float) DB::val('SELECT balance FROM suppliers WHERE id = ? FOR UPDATE', [$p['supplier_id']]);
        $bal -= $amount;
        DB::insert('supplier_ledger', [
            'supplier_id' => (int) $p['supplier_id'], 'entry_type' => 'payment',
            'debit' => 0, 'credit' => $amount, 'balance_after' => $bal,
            'reference_id' => $id, 'note' => 'Payment on invoice ' . $p['invoice_number'],
            'created_by' => Auth::id(),
        ]);
        DB::exec('UPDATE suppliers SET balance = ? WHERE id = ?', [$bal, $p['supplier_id']]);
        return ['paid_amount' => $newPaid, 'payment_status' => $status];
    });

    audit('payment', 'purchases', $id, null, ['amount' => $amount]);
    ok($result);
}

function nextInvoiceNumber(): string
{
    $year = date('Y');
    $max = (int) DB::val(
        'SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number, 10) AS UNSIGNED)), 0)
         FROM purchases WHERE invoice_number LIKE ?',
        ["PUR-$year-%"]
    );
    return sprintf('PUR-%s-%04d', $year, $max + 1);
}

/* ================================================================
   PURCHASE RETURNS (v1.2, SRS Module 5) — send goods back to the supplier.
   Stock leaves the batch the purchase created; the supplier ledger is
   credited (we owe less). Blocked when the stock was already sold.
   ================================================================ */
function purchases_return(): void
{
    Auth::require('purchases', 'edit');
    $purchaseId = inInt('purchase_id');
    $reason = inStr('reason');
    $lines  = inArr('items'); // [{purchase_item_id, quantity}]
    if (!in_array($reason, ['damaged', 'expired', 'wrong_item', 'overstock', 'quality', 'other'], true)) {
        fail('Choose a return reason.');
    }
    if (!$lines) fail('Select at least one line to return.');

    $result = DB::tx(function () use ($purchaseId, $reason, $lines) {
        $pu = DB::row('SELECT * FROM purchases WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [$purchaseId]);
        if (!$pu) fail('Purchase not found.', 404);

        $totalValue = 0.0; $rows = []; $byProduct = [];
        foreach ($lines as $ln) {
            $itemId = (int) ($ln['purchase_item_id'] ?? 0);
            $qty    = (int) ($ln['quantity'] ?? 0);
            if ($itemId <= 0 || $qty <= 0) continue;

            $it = DB::row('SELECT * FROM purchase_items WHERE id = ? AND purchase_id = ? FOR UPDATE',
                          [$itemId, $purchaseId]);
            if (!$it) fail('A return line does not belong to this invoice.');
            $left = (int) $it['quantity'] - (int) $it['returned_quantity'];
            if ($qty > $left) fail("Cannot return $qty — only $left un-returned on that line.");

            /* the goods must still be in the batch the purchase created */
            $batchId = $it['batch_id'] !== null ? (int) $it['batch_id'] : null;
            if ($batchId === null) {
                $b = DB::row(
                    'SELECT id FROM product_batches WHERE product_id = ? AND batch_number = ?
                     AND (expiry_date <=> ?) LIMIT 1 FOR UPDATE',
                    [$it['product_id'], $it['batch_number'], $it['expiry_date']]);
                $batchId = $b ? (int) $b['id'] : null;
            }
            if ($batchId === null) fail('The batch from this purchase no longer exists — adjust stock instead.');
            $done = DB::exec(
                'UPDATE product_batches SET quantity = quantity - ? WHERE id = ? AND quantity >= ?',
                [$qty, $batchId, $qty]);
            if ($done !== 1) {
                fail('Not enough stock left in that batch — part of it was already sold or adjusted.');
            }

            DB::exec('UPDATE purchase_items SET returned_quantity = returned_quantity + ? WHERE id = ?',
                     [$qty, $itemId]);
            $value = round($qty * (float) $it['unit_cost'], 2);
            $totalValue += $value;
            $rows[] = ['purchase_item_id' => $itemId, 'quantity' => $qty, 'value_amount' => $value];
            $pid = (int) $it['product_id'];
            $byProduct[$pid]['qty']   = ($byProduct[$pid]['qty'] ?? 0) + $qty;
            $byProduct[$pid]['batch'] = $batchId;
        }
        if (!$rows) fail('Nothing to return.');
        $totalValue = round($totalValue, 2);

        $year = date('Y');
        $last = DB::val("SELECT return_number FROM purchase_returns WHERE return_number LIKE ?
                         ORDER BY id DESC LIMIT 1", ["PRT-$year-%"]);
        $no = sprintf('PRT-%s-%04d', $year, $last ? ((int) substr((string) $last, -4)) + 1 : 1);

        $retId = DB::insert('purchase_returns', [
            'return_number' => $no, 'purchase_id' => $purchaseId,
            'supplier_id' => (int) $pu['supplier_id'], 'reason' => $reason,
            'total_value' => $totalValue, 'note' => inStr('note') ?: null, 'created_by' => Auth::id(),
        ]);
        foreach ($rows as $r) { $r['purchase_return_id'] = $retId; DB::insert('purchase_return_items', $r); }

        foreach ($byProduct as $pid => $m) {
            DB::exec('UPDATE products SET quantity = quantity - ? WHERE id = ?', [$m['qty'], $pid]);
            $after = (int) DB::val('SELECT quantity FROM products WHERE id = ?', [$pid]);
            DB::insert('inventory_movements', [
                'product_id' => $pid, 'batch_id' => $m['batch'],
                'movement_type' => 'return', 'quantity_change' => -$m['qty'], 'quantity_after' => $after,
                'reference_type' => 'purchase_return', 'reference_id' => $retId,
                'note' => "$no ({$reason})", 'created_by' => Auth::id(),
            ]);
        }

        /* supplier owes us the value back → credit reduces our payable */
        $bal = (float) DB::val('SELECT balance FROM suppliers WHERE id = ? FOR UPDATE', [$pu['supplier_id']]);
        $bal -= $totalValue;
        DB::insert('supplier_ledger', [
            'supplier_id' => (int) $pu['supplier_id'], 'entry_type' => 'adjustment',
            'debit' => 0, 'credit' => $totalValue, 'balance_after' => $bal,
            'reference_id' => $retId, 'note' => "Purchase return $no on {$pu['invoice_number']}",
            'created_by' => Auth::id(),
        ]);
        DB::exec('UPDATE suppliers SET balance = ? WHERE id = ?', [$bal, $pu['supplier_id']]);

        return ['id' => $retId, 'return_number' => $no, 'total_value' => $totalValue];
    });

    audit('return', 'purchases', $purchaseId, null, $result);
    ok($result);
}

/** Returns recorded against one purchase (shown in the invoice modal). */
function purchases_returns(): void
{
    Auth::require('purchases', 'view');
    ok(DB::rows(
        "SELECT pr.*, u.full_name AS by_user FROM purchase_returns pr
          LEFT JOIN users u ON u.id = pr.created_by
         WHERE pr.purchase_id = ? ORDER BY pr.id DESC", [inInt('purchase_id')]));
}
