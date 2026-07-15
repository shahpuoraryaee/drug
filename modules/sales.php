<?php
declare(strict_types=1);

/**
 * SALES (POS) — walk-in customers only, no customer records.
 *
 * Integration contract (nothing duplicated):
 *   Products   → read-only lookups (price, status, unit)
 *   Inventory  → product_batches reduced FEFO, inventory_movements type 'sale'/'return'
 *   Income     → one income row per sale (category "Medicine Sales");
 *                returns/cancels insert a negative adjustment row
 *   Dashboard  → reads incomes + sales tables (see dashboard.php)
 *   Reports    → 'sales' and 'bestsellers' types (see reports.php)
 *   Audit      → every operation via audit()
 *
 * All money-and-stock effects of a sale/return/cancel run inside ONE
 * DB::tx() transaction — any failure rolls back everything.
 */

/* ---------------- shared helpers ---------------- */

function salesIncomeCategoryId(): int
{
    $id = DB::val("SELECT id FROM income_categories WHERE name = 'Medicine Sales'");
    if ($id) return (int) $id;
    return DB::insert('income_categories', ['name' => 'Medicine Sales']); // self-heal on migrated installs
}

function nextSaleInvoice(): string
{
    $year = date('Y');
    $last = DB::val(
        "SELECT invoice_number FROM sales WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1",
        ["SAL-$year-%"]
    );
    $n = $last ? ((int) substr((string) $last, -5)) + 1 : 1;
    return sprintf('SAL-%s-%05d', $year, $n);
}

function nextReturnNumber(): string
{
    $year = date('Y');
    $last = DB::val(
        "SELECT return_number FROM sale_returns WHERE return_number LIKE ? ORDER BY id DESC LIMIT 1",
        ["RTN-$year-%"]
    );
    $n = $last ? ((int) substr((string) $last, -5)) + 1 : 1;
    return sprintf('RTN-%s-%05d', $year, $n);
}

/** Sellable (non-expired, in-stock) batches for a product, FEFO order. Locks rows. */
function sellableBatches(int $productId): array
{
    return DB::rows(
        "SELECT id, batch_number, quantity, unit_cost, expiry_date
           FROM product_batches
          WHERE product_id = ? AND quantity > 0
            AND (expiry_date IS NULL OR expiry_date >= CURDATE())
          ORDER BY (expiry_date IS NULL), expiry_date ASC
          FOR UPDATE",
        [$productId]
    );
}

/* ================================================================
   LIST — paged; cashiers see only their own sales ("View Own Sales")
   ================================================================ */
function sales_list(): void
{
    Auth::require('sales', 'view');
    [$page, $per, $off] = paging();

    $where = ["1=1"];
    $params = [];
    if ($q = inStr('q'))          { $where[] = 's.invoice_number LIKE ?'; $params[] = "$q%"; }
    if ($st = inStr('status'))    { $where[] = 's.status = ?'; $params[] = $st; }
    if (validDate(inStr('from'))) { $where[] = 's.sale_date >= ?'; $params[] = inStr('from'); }
    if (validDate(inStr('to')))   { $where[] = 's.sale_date <= ?'; $params[] = inStr('to'); }
    if ($pm = inStr('payment')) { $where[] = 's.payment_method = ?'; $params[] = $pm; }
    if (($cid = inInt('cashier_id')) && Auth::role() !== 'cashier') { $where[] = 's.created_by = ?'; $params[] = $cid; }
    if (Auth::role() === 'cashier') { $where[] = 's.created_by = ?'; $params[] = Auth::id(); }

    $w = implode(' AND ', $where);
    $total = (int) DB::val("SELECT COUNT(*) FROM sales s WHERE $w", $params);
    $sum   = (float) DB::val("SELECT COALESCE(SUM(grand_total),0) FROM sales s WHERE $w AND s.status='completed'", $params);
    $rows  = DB::rows(
        "SELECT s.id, s.invoice_number, s.sale_date, s.status, s.grand_total, s.paid_amount,
                s.payment_method, s.gross_profit, s.created_at, u.full_name AS cashier,
                (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count,
                (SELECT COALESCE(SUM(sri.quantity),0) FROM sale_returns sr
                   JOIN sale_return_items sri ON sri.sale_return_id = sr.id
                  WHERE sr.sale_id = s.id) AS returned_units
           FROM sales s LEFT JOIN users u ON u.id = s.created_by
          WHERE $w
          ORDER BY s.id DESC LIMIT $per OFFSET $off",
        $params
    );
    $out = paged($rows, $total, $page, $per);
    $out['sum'] = $sum;
    ok($out);
}

/** Cashier filter options for the history screen (non-cashier roles). */
function sales_cashiers(): void
{
    Auth::require('sales', 'view');
    if (Auth::role() === 'cashier') { ok([]); return; }
    ok(DB::rows(
        "SELECT DISTINCT u.id, u.full_name FROM sales s
           JOIN users u ON u.id = s.created_by ORDER BY u.full_name"));
}

/* ================================================================
   GET — full sale with items (grouped view built client-side), payments, returns
   ================================================================ */
function sales_get(): void
{
    Auth::require('sales', 'view');
    ok(salesFetchOne(inInt('id')));
}

/** Shared by sales_get() and sales_findInvoice() — fetches one sale with its
 *  items/payments/returns and enforces the cashier "own sales only" rule. */
function salesFetchOne(int $id): array
{
    $sale = DB::row(
        "SELECT s.*, u.full_name AS cashier FROM sales s
          LEFT JOIN users u ON u.id = s.created_by WHERE s.id = ?", [$id]);
    if (!$sale) fail('Sale not found.', 404);
    if (Auth::role() === 'cashier' && (int) $sale['created_by'] !== Auth::id()) {
        fail('You can only view your own sales.', 403);
    }

    $items = DB::rows(
        "SELECT si.*, p.medicine_name, p.product_code, p.unit, b.batch_number, b.expiry_date
           FROM sale_items si
           JOIN products p ON p.id = si.product_id
           LEFT JOIN product_batches b ON b.id = si.batch_id
          WHERE si.sale_id = ? ORDER BY si.id", [$id]);
    $payments = DB::rows('SELECT method, amount FROM sale_payments WHERE sale_id = ? ORDER BY id', [$id]);
    $returns  = DB::rows(
        "SELECT sr.*, u.full_name AS by_user FROM sale_returns sr
          LEFT JOIN users u ON u.id = sr.created_by WHERE sr.sale_id = ? ORDER BY sr.id", [$id]);

    return ['sale' => $sale, 'items' => $items, 'payments' => $payments, 'returns' => $returns];
}

/** Lookup an invoice by number (return workflow step 1). */
function sales_findInvoice(): void
{
    Auth::require('sales', 'view');
    $inv = inStr('invoice');
    if ($inv === '') fail('Enter an invoice number.');
    $id = (int) DB::val('SELECT id FROM sales WHERE invoice_number = ?', [$inv]);
    if (!$id) fail('Invoice not found.', 404);
    ok(salesFetchOne($id));
}

/* ================================================================
   SAVE — complete a sale (or hold it). Single transaction.
   items: [{product_id, quantity, unit_price, discount, batch_id?}]
   payments: [{method, amount}]  (one entry = simple, several = mixed)
   ================================================================ */
function sales_save(): void
{
    Auth::require('sales', 'add');

    $items = inArr('items');
    if (!$items) fail('The cart is empty.');
    $hold = inInt('hold') === 1;
    $invoiceDiscount = max(0, inFloat('discount'));
    $payments = inArr('payments');
    $heldId = inInt('held_id'); // resuming a held sale replaces it

    $canOverride = Auth::can('sales', 'override');
    $canDiscount = Auth::can('sales', 'discount');
    $maxDiscPct  = (float) (setting('max_discount_percent', '10') ?? '10');

    $result = DB::tx(function () use (
        $items, $hold, $invoiceDiscount, $payments, $heldId,
        $canOverride, $canDiscount, $maxDiscPct
    ) {
        /* ---- validate items, lock stock, plan FEFO slices ---- */
        $subtotal = 0.0; $totalCost = 0.0; $grossQty = 0;
        $slices = [];   // rows for sale_items
        $moves  = [];   // per-product movement summary
        $listDiscountTotal = 0.0; $listGross = 0.0;

        foreach ($items as $it) {
            $pid   = (int) ($it['product_id'] ?? 0);
            $qty   = (int) ($it['quantity'] ?? 0);
            $price = round((float) ($it['unit_price'] ?? -1), 2);
            $disc  = max(0, round((float) ($it['discount'] ?? 0), 2)); // per-line amount
            $forcedBatch = (int) ($it['batch_id'] ?? 0);

            if ($pid <= 0 || $qty <= 0) fail('Each cart line needs a product and a positive quantity.');

            $p = DB::row(
                "SELECT id, medicine_name, selling_price, quantity, average_cost, status, deleted_at
                   FROM products WHERE id = ? FOR UPDATE", [$pid]);
            if (!$p || $p['deleted_at'] !== null) fail('A product in the cart no longer exists.');
            if ($p['status'] !== 'active') fail("'{$p['medicine_name']}' is not active and cannot be sold.");

            if ($price < 0) $price = (float) $p['selling_price'];  // "use default" sentinel
            if ($price <= 0) fail("'{$p['medicine_name']}' cannot be sold at zero price.");
            if (abs($price - (float) $p['selling_price']) > 0.009 && !$canOverride) {
                fail("Price override on '{$p['medicine_name']}' requires manager permission.");
            }

            $lineGross = round($qty * $price, 2);
            if ($disc > $lineGross) fail("Line discount on '{$p['medicine_name']}' exceeds the line amount.");
            $lineTotal = round($lineGross - $disc, 2);

            /* sellable stock = non-expired batches only (never sell expired) */
            $batches = sellableBatches($pid);
            if ($forcedBatch) {
                if (!Auth::can('sales', 'override')) fail('Batch override requires manager permission.');
                $batches = array_values(array_filter($batches, fn($b) => (int) $b['id'] === $forcedBatch));
                if (!$batches) fail("Chosen batch for '{$p['medicine_name']}' is unavailable, empty, or expired.");
            }
            $sellable = array_sum(array_column($batches, 'quantity'));
            if ($qty > $sellable) {
                fail("Not enough sellable stock for '{$p['medicine_name']}': $sellable available"
                   . ((int) $p['quantity'] > $sellable ? ' (rest is expired)' : '') . '.');
            }

            /* FEFO slices — one sale_items row per batch touched */
            $remaining = $qty;
            foreach ($batches as $b) {
                if ($remaining <= 0) break;
                $take = min($remaining, (int) $b['quantity']);
                $remaining -= $take;
                $sliceGrossShare = $lineGross > 0 ? round($lineGross * ($take * $price) / $lineGross, 2) : 0;
                $sliceDisc  = $qty > 0 ? round($disc * $take / $qty, 2) : 0;
                $slices[] = [
                    'product_id' => $pid, 'batch_id' => (int) $b['id'], 'quantity' => $take,
                    'unit_price' => $price,
                    'unit_cost'  => (float) ($b['unit_cost'] ?: $p['average_cost']),
                    'discount'   => $sliceDisc,
                    'line_total' => round($take * $price - $sliceDisc, 2),
                    '_name'      => $p['medicine_name'],
                ];
                $totalCost += $take * (float) ($b['unit_cost'] ?: $p['average_cost']);
            }
            $moves[$pid] = ($moves[$pid] ?? 0) + $qty;
            $subtotal += $lineTotal;
            $listDiscountTotal += $disc; $listGross += $lineGross; $grossQty += $qty;
        }
        $subtotal = round($subtotal, 2);

        /* ---- invoice-level discount + limits ---- */
        if ($invoiceDiscount > $subtotal) fail('Invoice discount exceeds the subtotal.');
        $grandTotal = round($subtotal - $invoiceDiscount, 2);
        $totalDiscount = $listDiscountTotal + $invoiceDiscount;
        if ($listGross > 0 && !$canDiscount) {
            $pct = 100.0 * $totalDiscount / $listGross;
            if ($pct > $maxDiscPct + 0.01) {
                fail(sprintf('Total discount %.1f%% exceeds the %.0f%% limit — a manager must complete this sale.',
                    $pct, $maxDiscPct));
            }
        }

        /* ---- held sale: store the cart only, no stock/income effects ---- */
        if ($hold) {
            $saleId = DB::insert('sales', [
                'invoice_number' => nextSaleInvoice(), 'sale_date' => date('Y-m-d'),
                'status' => 'held', 'subtotal' => $subtotal, 'discount' => $invoiceDiscount,
                'grand_total' => $grandTotal, 'total_cost' => round($totalCost, 2),
                'gross_profit' => round($grandTotal - $totalCost, 2),
                'notes' => inStr('notes') ?: null, 'created_by' => Auth::id(),
            ]);
            foreach ($slices as $s) { unset($s['_name']); $s['sale_id'] = $saleId; DB::insert('sale_items', $s); }
            return ['id' => $saleId, 'held' => true];
        }

        /* ---- payments ---- */
        $paid = 0.0; $methods = [];
        foreach ($payments as $pay) {
            $m = (string) ($pay['method'] ?? '');
            $a = round((float) ($pay['amount'] ?? 0), 2);
            if (!in_array($m, ['cash', 'card', 'bank', 'mobile'], true)) fail('Invalid payment method.');
            if ($a <= 0) continue;
            $paid += $a; $methods[$m] = true;
        }
        if ($paid + 0.009 < $grandTotal) fail('Paid amount is less than the grand total.');
        $change = round($paid - $grandTotal, 2);
        $methodSummary = count($methods) > 1 ? 'mixed' : (array_key_first($methods) ?: 'cash');

        /* ---- resume-from-hold: retire the held row ---- */
        if ($heldId) {
            $held = DB::row("SELECT id, status FROM sales WHERE id = ? FOR UPDATE", [$heldId]);
            if ($held && $held['status'] === 'held') {
                DB::exec('DELETE FROM sale_items WHERE sale_id = ?', [$heldId]);
                DB::exec('DELETE FROM sales WHERE id = ?', [$heldId]);
            }
        }

        /* ---- header ---- */
        $invoice = nextSaleInvoice();
        $saleId = DB::insert('sales', [
            'invoice_number' => $invoice, 'sale_date' => date('Y-m-d'), 'status' => 'completed',
            'subtotal' => $subtotal, 'discount' => $invoiceDiscount, 'grand_total' => $grandTotal,
            'paid_amount' => round($paid, 2), 'change_amount' => $change,
            'total_cost' => round($totalCost, 2), 'gross_profit' => round($grandTotal - $totalCost, 2),
            'payment_method' => $methodSummary, 'notes' => inStr('notes') ?: null,
            'created_by' => Auth::id(),
        ]);

        /* ---- items + batch reductions ---- */
        foreach ($slices as $s) {
            $name = $s['_name']; unset($s['_name']);
            $s['sale_id'] = $saleId;
            DB::insert('sale_items', $s);
            $done = DB::exec(
                'UPDATE product_batches SET quantity = quantity - ? WHERE id = ? AND quantity >= ?',
                [$s['quantity'], $s['batch_id'], $s['quantity']]);
            if ($done !== 1) fail("Stock changed while selling '$name' — please retry."); // rolls back all
        }

        /* ---- product totals + inventory movements (one per product) ---- */
        foreach ($moves as $pid => $qty) {
            DB::exec('UPDATE products SET quantity = quantity - ? WHERE id = ?', [$qty, $pid]);
            $after = (int) DB::val('SELECT quantity FROM products WHERE id = ?', [$pid]);
            DB::insert('inventory_movements', [
                'product_id' => $pid, 'batch_id' => null,
                'movement_type' => 'sale', 'quantity_change' => -$qty, 'quantity_after' => $after,
                'reference_type' => 'sale', 'reference_id' => $saleId,
                'note' => $invoice, 'created_by' => Auth::id(),
            ]);
        }

        /* ---- payments ---- */
        foreach ($payments as $pay) {
            $a = round((float) ($pay['amount'] ?? 0), 2);
            if ($a <= 0) continue;
            DB::insert('sale_payments', ['sale_id' => $saleId, 'method' => $pay['method'], 'amount' => $a]);
        }

        /* ---- auto income ---- */
        $incomeId = DB::insert('incomes', [
            'income_category_id' => salesIncomeCategoryId(),
            'amount' => $grandTotal, 'income_date' => date('Y-m-d'),
            'description' => "POS sale $invoice", 'created_by' => Auth::id(),
        ]);
        DB::exec('UPDATE sales SET income_id = ? WHERE id = ?', [$incomeId, $saleId]);

        return ['id' => $saleId, 'invoice_number' => $invoice,
                'grand_total' => $grandTotal, 'change' => $change, 'held' => false,
                'audit_facts' => [
                    'total_discount' => round($totalDiscount, 2),
                    'invoice_discount' => $invoiceDiscount,
                ]];
    });

    $facts = $result['audit_facts'] ?? [];
    unset($result['audit_facts']);
    audit($result['held'] ? 'hold' : 'create', 'sales', $result['id'], null, $result + $facts);
    ok($result);
}

/* ================================================================
   HELD SALES — list + delete (resume handled by sales_get + save)
   ================================================================ */
function sales_held(): void
{
    Auth::require('sales', 'view');
    // §11 expiration policy: purge held sales older than the configured limit
    $days = max(1, (int) (setting('hold_expire_days', '7') ?? '7'));
    DB::exec("DELETE FROM sales WHERE status = 'held' AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)", [$days]);
    $where = "status = 'held'" . (Auth::role() === 'cashier' ? ' AND created_by = ' . (int) Auth::id() : '');
    ok(DB::rows(
        "SELECT s.id, s.invoice_number, s.grand_total, s.created_at, u.full_name AS cashier,
                (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
           FROM sales s LEFT JOIN users u ON u.id = s.created_by
          WHERE $where ORDER BY s.id DESC LIMIT 30"));
}

function sales_deleteHeld(): void
{
    Auth::require('sales', 'add');
    $id = inInt('id');
    $s = DB::row("SELECT * FROM sales WHERE id = ? AND status = 'held'", [$id]);
    if (!$s) fail('Held sale not found.', 404);
    if (Auth::role() === 'cashier' && (int) $s['created_by'] !== Auth::id()) fail('Not your held sale.', 403);
    DB::exec('DELETE FROM sales WHERE id = ?', [$id]); // items cascade
    audit('delete', 'sales', $id, $s, null);
    ok();
}

/* ================================================================
   RETURN — full or partial; restores the exact original batch
   ================================================================ */
function sales_return(): void
{
    Auth::require('sales', 'return');
    $saleId = inInt('sale_id');
    $reason = inStr('reason');
    $lines  = inArr('items'); // [{sale_item_id, quantity}]
    if (!in_array($reason, ['wrong_medicine', 'damaged', 'expired', 'changed_mind', 'duplicate', 'other'], true)) {
        fail('Choose a return reason.');
    }
    if (!$lines) fail('Select at least one item to return.');

    $result = DB::tx(function () use ($saleId, $reason, $lines) {
        $sale = DB::row('SELECT * FROM sales WHERE id = ? FOR UPDATE', [$saleId]);
        if (!$sale) fail('Sale not found.', 404);
        if ($sale['status'] !== 'completed') fail('Only completed sales can be returned.');
        if (Auth::role() === 'cashier' && (int) $sale['created_by'] !== Auth::id()) {
            fail('You can only return your own sales.', 403);
        }

        $subtotal = (float) $sale['subtotal'];
        $invDisc  = (float) $sale['discount'];
        $refundTotal = 0.0; $costRestored = 0.0;
        $rows = []; $movesByProduct = [];

        foreach ($lines as $ln) {
            $itemId = (int) ($ln['sale_item_id'] ?? 0);
            $qty    = (int) ($ln['quantity'] ?? 0);
            if ($itemId <= 0 || $qty <= 0) continue;

            $it = DB::row('SELECT * FROM sale_items WHERE id = ? AND sale_id = ? FOR UPDATE', [$itemId, $saleId]);
            if (!$it) fail('A return line does not belong to this invoice.');
            $available = (int) $it['quantity'] - (int) $it['returned_quantity'];
            if ($qty > $available) {
                fail("Cannot return $qty — only $available left un-returned on that line.");
            }

            /* refund = proportional share of (line_total minus its share of the invoice discount) */
            $lineNet = (float) $it['line_total'];
            $lineNetAfterInvDisc = $subtotal > 0
                ? $lineNet - $invDisc * ($lineNet / $subtotal)
                : $lineNet;
            $refund = round($lineNetAfterInvDisc * $qty / max(1, (int) $it['quantity']), 2);
            $cost   = round((float) $it['unit_cost'] * $qty, 2);

            DB::exec('UPDATE sale_items SET returned_quantity = returned_quantity + ? WHERE id = ?', [$qty, $itemId]);

            /* restore the ORIGINAL batch when it still exists; else product total only */
            if ($it['batch_id'] !== null) {
                DB::exec('UPDATE product_batches SET quantity = quantity + ? WHERE id = ?', [$qty, $it['batch_id']]);
            }
            $movesByProduct[(int) $it['product_id']]['qty'] = ($movesByProduct[(int) $it['product_id']]['qty'] ?? 0) + $qty;
            $movesByProduct[(int) $it['product_id']]['batch'] = $it['batch_id'];

            $refundTotal += $refund; $costRestored += $cost;
            $rows[] = ['sale_item_id' => $itemId, 'quantity' => $qty, 'refund_amount' => $refund];
        }
        if (!$rows) fail('Nothing to return.');
        $refundTotal = round($refundTotal, 2);

        $returnNo = nextReturnNumber();
        $returnId = DB::insert('sale_returns', [
            'return_number' => $returnNo, 'sale_id' => $saleId, 'reason' => $reason,
            'refund_total' => $refundTotal, 'cost_restored' => round($costRestored, 2),
            'note' => inStr('note') ?: null, 'created_by' => Auth::id(),
        ]);
        foreach ($rows as $r) { $r['sale_return_id'] = $returnId; DB::insert('sale_return_items', $r); }

        foreach ($movesByProduct as $pid => $m) {
            DB::exec('UPDATE products SET quantity = quantity + ? WHERE id = ?', [$m['qty'], $pid]);
            $after = (int) DB::val('SELECT quantity FROM products WHERE id = ?', [$pid]);
            DB::insert('inventory_movements', [
                'product_id' => $pid, 'batch_id' => $m['batch'],
                'movement_type' => 'return', 'quantity_change' => $m['qty'], 'quantity_after' => $after,
                'reference_type' => 'sale_return', 'reference_id' => $returnId,
                'note' => "$returnNo ({$reason})", 'created_by' => Auth::id(),
            ]);
        }

        /* negative income adjustment reverses revenue (and therefore profit) */
        $incomeId = DB::insert('incomes', [
            'income_category_id' => salesIncomeCategoryId(),
            'amount' => -$refundTotal, 'income_date' => date('Y-m-d'),
            'description' => "POS return $returnNo for {$sale['invoice_number']}",
            'created_by' => Auth::id(),
        ]);
        DB::exec('UPDATE sale_returns SET income_id = ? WHERE id = ?', [$incomeId, $returnId]);

        return ['id' => $returnId, 'return_number' => $returnNo, 'refund_total' => $refundTotal];
    });

    audit('return', 'sales', $saleId, null, $result);
    ok($result);
}

/* ================================================================
   CANCEL — full reversal of a completed sale (manager/owner)
   ================================================================ */
function sales_cancel(): void
{
    Auth::require('sales', 'cancel');
    $id = inInt('id');

    $result = DB::tx(function () use ($id) {
        $sale = DB::row('SELECT * FROM sales WHERE id = ? FOR UPDATE', [$id]);
        if (!$sale) fail('Sale not found.', 404);
        if ($sale['status'] === 'held') { DB::exec('DELETE FROM sales WHERE id = ?', [$id]); return ['deleted_held' => true]; }
        if ($sale['status'] !== 'completed') fail('Only completed sales can be cancelled.');
        $hasReturns = (int) DB::val('SELECT COUNT(*) FROM sale_returns WHERE sale_id = ?', [$id]);
        if ($hasReturns) fail('This sale already has returns — return the remaining items instead.');

        $items = DB::rows('SELECT * FROM sale_items WHERE sale_id = ? FOR UPDATE', [$id]);
        $byProduct = [];
        foreach ($items as $it) {
            if ($it['batch_id'] !== null) {
                DB::exec('UPDATE product_batches SET quantity = quantity + ? WHERE id = ?',
                         [$it['quantity'], $it['batch_id']]);
            }
            $byProduct[(int) $it['product_id']] = ($byProduct[(int) $it['product_id']] ?? 0) + (int) $it['quantity'];
        }
        foreach ($byProduct as $pid => $qty) {
            DB::exec('UPDATE products SET quantity = quantity + ? WHERE id = ?', [$qty, $pid]);
            $after = (int) DB::val('SELECT quantity FROM products WHERE id = ?', [$pid]);
            DB::insert('inventory_movements', [
                'product_id' => $pid, 'movement_type' => 'return',
                'quantity_change' => $qty, 'quantity_after' => $after,
                'reference_type' => 'sale_cancel', 'reference_id' => $id,
                'note' => 'Cancelled ' . $sale['invoice_number'], 'created_by' => Auth::id(),
            ]);
        }
        DB::insert('incomes', [
            'income_category_id' => salesIncomeCategoryId(),
            'amount' => -(float) $sale['grand_total'], 'income_date' => date('Y-m-d'),
            'description' => 'Cancelled POS sale ' . $sale['invoice_number'],
            'created_by' => Auth::id(),
        ]);
        DB::exec("UPDATE sales SET status = 'cancelled' WHERE id = ?", [$id]);
        return ['cancelled' => $sale['invoice_number']];
    });

    audit('cancel', 'sales', $id, null, $result);
    ok($result);
}

/* ================================================================
   RECEIPT DATA — client renders + prints (audit the print)
   ================================================================ */
function sales_receipt(): void
{
    Auth::require('sales', 'print');
    $id = inInt('id');
    audit('print', 'sales', $id, null, ['receipt' => true]);
    ok(salesFetchOne($id)); // same payload; settings already on the client
}

/* ================================================================
   PHONE SCANNER — QR pairing over the local network
   Desktop: scanStart → token+URL → shows QR → polls scanPoll.
   Phone:   opens scan.php?t=TOKEN (no login) → camera → POSTs barcodes.
   ================================================================ */
function sales_scanStart(): void
{
    Auth::require('sales', 'add');
    DB::exec('DELETE FROM scan_sessions WHERE expires_at < NOW()'); // housekeeping
    $token = bin2hex(random_bytes(16));
    DB::insert('scan_sessions', [
        'token' => $token, 'created_by' => Auth::id(),
        'expires_at' => date('Y-m-d H:i:s', time() + 15 * 60),
    ]);

    // best-effort LAN address so the phone can reach this machine
    $host = $_SERVER['HTTP_HOST'] ?? '127.0.0.1';
    $lanIp = null;
    if (function_exists('gethostname')) {
        $ips = @gethostbynamel((string) gethostname()) ?: [];
        foreach ($ips as $ip) {
            if ($ip !== '127.0.0.1' && !str_starts_with($ip, '169.254.')) { $lanIp = $ip; break; }
        }
    }
    $port = parse_url('http://' . $host, PHP_URL_PORT);
    $url = 'http://' . ($lanIp ?: preg_replace('/:\d+$/', '', $host))
         . ($port ? ":$port" : '') . dirname($_SERVER['SCRIPT_NAME'] ?? '/') ;
    $url = rtrim(str_replace('\\', '/', $url), '/') . '/scan.php?t=' . $token;

    ok(['token' => $token, 'url' => $url, 'lan_ip' => $lanIp,
        'note' => $lanIp ? null : 'Could not detect a LAN IP — the phone must use this PC\'s network address.']);
}

function sales_scanPoll(): void
{
    Auth::require('sales', 'add');
    $token = inStr('token');
    if (!preg_match('/^[a-f0-9]{32}$/', $token)) fail('Bad token.');
    $sess = DB::row('SELECT token FROM scan_sessions WHERE token = ? AND expires_at > NOW()', [$token]);
    if (!$sess) ok(['expired' => true, 'barcodes' => []]);

    $rows = DB::rows(
        'SELECT id, barcode FROM scan_events WHERE token = ? AND consumed = 0 ORDER BY id LIMIT 20', [$token]);
    if ($rows) {
        $ids = implode(',', array_map(fn($r) => (int) $r['id'], $rows));
        DB::exec("UPDATE scan_events SET consumed = 1 WHERE id IN ($ids)");
    }
    ok(['expired' => false, 'barcodes' => array_column($rows, 'barcode')]);
}

/** §20: explicit disconnect — the POS closes its scan session. */
function sales_scanStop(): void
{
    Auth::require('sales', 'add');
    $token = inStr('token');
    if (preg_match('/^[a-f0-9]{32}$/', $token)) {
        DB::exec('DELETE FROM scan_sessions WHERE token = ? AND created_by = ?', [$token, Auth::id()]);
    }
    ok();
}

/** Exact barcode → product (POS scan lookup; falls back to code match). */
function sales_barcode(): void
{
    Auth::require('sales', 'view');
    $code = inStr('code');
    if ($code === '') fail('Empty barcode.');
    $p = DB::row(
        "SELECT p.id, p.product_code, p.medicine_name, p.generic_name, p.selling_price,
                p.quantity, p.unit, p.status
           FROM products p
          WHERE p.deleted_at IS NULL AND (p.barcode = ? OR p.product_code = ?)
          LIMIT 1", [$code, $code]);
    if (!$p) fail('No product with that barcode.', 404);
    ok($p);
}

/** Sellable batches of one product (cart batch override dropdown). */
function sales_batches(): void
{
    Auth::require('sales', 'view');
    ok(DB::rows(
        "SELECT id, batch_number, quantity, expiry_date
           FROM product_batches
          WHERE product_id = ? AND quantity > 0
            AND (expiry_date IS NULL OR expiry_date >= CURDATE())
          ORDER BY (expiry_date IS NULL), expiry_date ASC",
        [inInt('product_id')]));
}
