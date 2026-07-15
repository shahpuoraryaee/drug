<?php
declare(strict_types=1);

/** All reports go through reports_run with a type + optional date range.
 *  Add ?format=csv to any report to download it. Printing is handled client-side. */
function reports_run(): void
{
    Auth::require('reports', 'view');
    $type = inStr('type');
    $from = validDate(inStr('from')) ? inStr('from') : date('Y-m-01');
    $to   = validDate(inStr('to'))   ? inStr('to')   : date('Y-m-d');

    [$title, $header, $rows, $summary] = match ($type) {
        'financial'  => reportFinancial($from, $to),
        'lowstock'   => reportLowStock(),
        'expiry'     => reportExpiry(inInt('days', 90)),
        'deadstock'  => reportDeadStock(inInt('days', 90)),
        'inventory'  => reportInventoryValue(),
        'purchases'  => reportPurchases($from, $to),
        'expenses'   => reportExpenses($from, $to),
        'income'     => reportIncome($from, $to),
        'sales'      => reportSales($from, $to, inStr('group', 'day')),
        'bestsellers'=> reportBestSellers($from, $to),
        'worstsellers'=> reportWorstSellers($from, $to),
        'cashflow'   => reportCashFlow($from, $to),
        'cashiersales'=> reportCashierSales($from, $to),
        'returns'    => reportReturns($from, $to),
        default      => fail('Unknown report type.'),
    };

    if (inStr('format') === 'csv') {
        Auth::require('reports', 'export');
        audit('export', 'reports', null, null, ['type' => $type]);
        csvOut("$type-report-" . date('Y-m-d') . '.csv', $header, $rows);
    }
    ok(['title' => $title, 'header' => $header, 'rows' => array_map('array_values', $rows), 'summary' => $summary]);
}

function reportFinancial(string $from, string $to): array
{
    $rows = DB::rows(
        "SELECT m AS month, SUM(inc) AS income, SUM(exp) AS expenses, SUM(inc) - SUM(exp) AS profit FROM (
            SELECT DATE_FORMAT(income_date, '%Y-%m') m, SUM(amount) inc, 0 exp
              FROM incomes WHERE deleted_at IS NULL AND income_date BETWEEN ? AND ? GROUP BY m
            UNION ALL
            SELECT DATE_FORMAT(expense_date, '%Y-%m') m, 0, SUM(amount)
              FROM expenses WHERE deleted_at IS NULL AND expense_date BETWEEN ? AND ? GROUP BY m
         ) t GROUP BY m ORDER BY m",
        [$from, $to, $from, $to]
    );
    $ti = array_sum(array_column($rows, 'income'));
    $te = array_sum(array_column($rows, 'expenses'));
    return ["Financial summary $from → $to", ['Month','Income','Expenses','Profit'], $rows,
            ['income' => $ti, 'expenses' => $te, 'profit' => $ti - $te]];
}

function reportLowStock(): array
{
    $rows = DB::rows(
        'SELECT product_code, medicine_name, quantity, min_quantity, unit,
                GREATEST(min_quantity * 2 - quantity, 0) AS suggested_order
         FROM products
         WHERE deleted_at IS NULL AND status = "active" AND quantity <= min_quantity
         ORDER BY (quantity / NULLIF(min_quantity,0)) ASC'
    );
    return ['Low stock / reorder list', ['Code','Medicine','Current','Minimum','Unit','Suggested order'],
            $rows, ['count' => count($rows)]];
}

function reportExpiry(int $days): array
{
    $cmp = $days === -1
        ? 'b.expiry_date < CURDATE()'
        : 'b.expiry_date >= CURDATE() AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ' . max(1, $days) . ' DAY)';
    $rows = DB::rows(
        "SELECT p.product_code, p.medicine_name, b.batch_number, b.quantity, b.expiry_date,
                DATEDIFF(b.expiry_date, CURDATE()) AS days_left,
                ROUND(b.quantity * b.unit_cost, 2) AS value_at_cost
         FROM product_batches b JOIN products p ON p.id = b.product_id
         WHERE b.quantity > 0 AND p.deleted_at IS NULL AND $cmp
         ORDER BY b.expiry_date ASC"
    );
    $label = $days === -1 ? 'Expired stock' : "Expiring within $days days";
    return [$label, ['Code','Medicine','Batch','Qty','Expiry','Days left','Value at cost'],
            $rows, ['count' => count($rows), 'value' => array_sum(array_column($rows, 'value_at_cost'))]];
}

function reportDeadStock(int $days): array
{
    $rows = DB::rows(
        "SELECT p.product_code, p.medicine_name, p.quantity, p.unit,
                ROUND(p.quantity * p.average_cost, 2) AS value_at_cost,
                DATE(MAX(im.created_at)) AS last_movement
         FROM products p
         LEFT JOIN inventory_movements im ON im.product_id = p.id
         WHERE p.deleted_at IS NULL AND p.status = 'active' AND p.quantity > 0
         GROUP BY p.id
         HAVING last_movement IS NULL OR last_movement < DATE_SUB(CURDATE(), INTERVAL ? DAY)
         ORDER BY value_at_cost DESC",
        [max(1, $days)]
    );
    return ["Dead stock (no movement in $days days)", ['Code','Medicine','Qty','Unit','Value at cost','Last movement'],
            $rows, ['count' => count($rows), 'value' => array_sum(array_column($rows, 'value_at_cost'))]];
}

function reportInventoryValue(): array
{
    $rows = DB::rows(
        'SELECT c.name AS category, COUNT(p.id) AS products, COALESCE(SUM(p.quantity),0) AS units,
                ROUND(COALESCE(SUM(p.quantity * p.average_cost),0),2) AS value_at_cost,
                ROUND(COALESCE(SUM(p.quantity * p.selling_price),0),2) AS value_at_sale
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.deleted_at IS NULL AND p.status = "active"
         GROUP BY c.id ORDER BY value_at_cost DESC'
    );
    return ['Inventory valuation by category', ['Category','Products','Units','Value at cost','Value at sale price'],
            $rows, ['value' => array_sum(array_column($rows, 'value_at_cost'))]];
}

function reportPurchases(string $from, string $to): array
{
    $rows = DB::rows(
        'SELECT pu.invoice_number, s.name AS supplier, pu.purchase_date, pu.grand_total, pu.paid_amount,
                pu.grand_total - pu.paid_amount AS due, pu.payment_status
         FROM purchases pu JOIN suppliers s ON s.id = pu.supplier_id
         WHERE pu.deleted_at IS NULL AND pu.purchase_date BETWEEN ? AND ?
         ORDER BY pu.purchase_date DESC',
        [$from, $to]
    );
    return ["Purchases $from → $to", ['Invoice','Supplier','Date','Total','Paid','Due','Status'],
            $rows, ['total' => array_sum(array_column($rows, 'grand_total')), 'due' => array_sum(array_column($rows, 'due'))]];
}

function reportExpenses(string $from, string $to): array
{
    $rows = DB::rows(
        'SELECT ec.name AS category, COUNT(*) AS entries, SUM(e.amount) AS total
         FROM expenses e JOIN expense_categories ec ON ec.id = e.expense_category_id
         WHERE e.deleted_at IS NULL AND e.expense_date BETWEEN ? AND ?
         GROUP BY ec.id ORDER BY total DESC',
        [$from, $to]
    );
    return ["Expenses by category $from → $to", ['Category','Entries','Total'],
            $rows, ['total' => array_sum(array_column($rows, 'total'))]];
}

function reportIncome(string $from, string $to): array
{
    $rows = DB::rows(
        'SELECT ic.name AS category, COUNT(*) AS entries, SUM(i.amount) AS total
         FROM incomes i JOIN income_categories ic ON ic.id = i.income_category_id
         WHERE i.deleted_at IS NULL AND i.income_date BETWEEN ? AND ?
         GROUP BY ic.id ORDER BY total DESC',
        [$from, $to]
    );
    return ["Income by category $from → $to", ['Category','Entries','Total'],
            $rows, ['total' => array_sum(array_column($rows, 'total'))]];
}

/* ---------------- SALES MODULE reports (v1.1) ---------------- */

/** Sales grouped by day / week / month / year (§16), with margin %. */
function reportSales(string $from, string $to, string $group = 'day'): array
{
    $expr = match ($group) {
        'week'  => "DATE_FORMAT(s.sale_date, '%x-W%v')",
        'month' => "DATE_FORMAT(s.sale_date, '%Y-%m')",
        'year'  => "DATE_FORMAT(s.sale_date, '%Y')",
        default => "s.sale_date",
    };
    $rows = DB::rows(
        "SELECT $expr AS `Date`,
                COUNT(*) AS `Sales`,
                COALESCE(SUM(s.grand_total),0) AS `Revenue`,
                COALESCE(SUM(r.refunds),0) AS `Returns`,
                COALESCE(SUM(s.grand_total),0) - COALESCE(SUM(r.refunds),0) AS `Net`,
                COALESCE(SUM(s.total_cost),0) AS `COGS`,
                COALESCE(SUM(s.gross_profit),0) - COALESCE(SUM(r.refunds),0) + COALESCE(SUM(r.cost),0) AS `Gross profit`
           FROM sales s
           LEFT JOIN (
                SELECT sr2.sale_id, SUM(sr2.refund_total) refunds, SUM(sr2.cost_restored) cost
                  FROM sale_returns sr2 GROUP BY sr2.sale_id
           ) r ON r.sale_id = s.id
          WHERE s.status = 'completed' AND s.sale_date BETWEEN ? AND ?
          GROUP BY `Date` ORDER BY MIN(s.sale_date)",
        [$from, $to]
    );
    foreach ($rows as &$row) {
        $net = (float) $row['Net'];
        $row['Margin %'] = $net > 0 ? round(100 * (float) $row['Gross profit'] / $net, 1) : 0;
    }
    unset($row);
    $summary = [
        'Sales'        => array_sum(array_column($rows, 'Sales')),
        'Revenue'      => array_sum(array_column($rows, 'Revenue')),
        'Returns'      => array_sum(array_column($rows, 'Returns')),
        'Net'          => array_sum(array_column($rows, 'Net')),
        'Gross profit' => array_sum(array_column($rows, 'Gross profit')),
    ];
    return ["Sales report $from → $to (per $group)",
            ['Date', 'Sales', 'Revenue', 'Returns', 'Net', 'COGS', 'Gross profit', 'Margin %'], $rows, $summary];
}

/** §16: revenue, profit and discounts per cashier. */
function reportCashierSales(string $from, string $to): array
{
    $rows = DB::rows(
        "SELECT COALESCE(u.full_name, '—') AS `Cashier`,
                COUNT(*) AS `Sales`,
                COALESCE(SUM(s.grand_total), 0) AS `Revenue`,
                COALESCE(SUM(s.discount), 0) AS `Invoice discounts`,
                COALESCE(SUM(s.gross_profit), 0) AS `Gross profit`
           FROM sales s LEFT JOIN users u ON u.id = s.created_by
          WHERE s.status = 'completed' AND s.sale_date BETWEEN ? AND ?
          GROUP BY s.created_by, u.full_name ORDER BY `Revenue` DESC",
        [$from, $to]
    );
    $summary = ['Revenue' => array_sum(array_column($rows, 'Revenue')),
                'Gross profit' => array_sum(array_column($rows, 'Gross profit'))];
    return ["Cashier sales $from → $to", ['Cashier', 'Sales', 'Revenue', 'Invoice discounts', 'Gross profit'], $rows, $summary];
}

/** §16: sales returns with reasons and refund value. */
function reportReturns(string $from, string $to): array
{
    $rows = DB::rows(
        "SELECT sr.return_number AS `Return`, s.invoice_number AS `Invoice`,
                DATE(sr.created_at) AS `Date`, sr.reason AS `Reason`,
                COALESCE(u.full_name, '—') AS `By`,
                sr.refund_total AS `Refund`, sr.cost_restored AS `Stock value back`
           FROM sale_returns sr
           JOIN sales s ON s.id = sr.sale_id
           LEFT JOIN users u ON u.id = sr.created_by
          WHERE DATE(sr.created_at) BETWEEN ? AND ?
          ORDER BY sr.id DESC",
        [$from, $to]
    );
    $summary = ['Refund' => array_sum(array_column($rows, 'Refund'))];
    return ["Sales returns $from → $to", ['Return', 'Invoice', 'Date', 'Reason', 'By', 'Refund', 'Stock value back'], $rows, $summary];
}

/** Best-selling medicines by units and revenue (returns deducted). */
function reportBestSellers(string $from, string $to): array
{
    $rows = DB::rows(
        "SELECT p.medicine_name AS `Medicine`, p.product_code AS `Code`,
                SUM(si.quantity - si.returned_quantity) AS `Units sold`,
                SUM(si.line_total * (si.quantity - si.returned_quantity) / si.quantity) AS `Revenue`,
                SUM((si.unit_price - si.unit_cost) * (si.quantity - si.returned_quantity)) AS `Gross profit`
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
           JOIN products p ON p.id = si.product_id
          WHERE s.sale_date BETWEEN ? AND ?
          GROUP BY p.id
         HAVING `Units sold` > 0
          ORDER BY `Units sold` DESC
          LIMIT 50",
        [$from, $to]
    );
    $summary = ['Units sold' => array_sum(array_column($rows, 'Units sold')),
                'Revenue'    => array_sum(array_column($rows, 'Revenue'))];
    return ["Best sellers $from → $to",
            ['Medicine', 'Code', 'Units sold', 'Revenue', 'Gross profit'], $rows, $summary];
}

/* ---------------- v1.2 reports (SRS Module 10) ---------------- */

/** Worst sellers: active, in-stock products with the fewest units sold (incl. zero). */
function reportWorstSellers(string $from, string $to): array
{
    $rows = DB::rows(
        "SELECT p.medicine_name AS `Medicine`, p.product_code AS `Code`,
                p.quantity AS `In stock`,
                COALESCE(sold.units, 0) AS `Units sold`,
                COALESCE(sold.revenue, 0) AS `Revenue`
           FROM products p
           LEFT JOIN (
                SELECT si.product_id,
                       SUM(si.quantity - si.returned_quantity) AS units,
                       SUM(si.line_total * (si.quantity - si.returned_quantity) / si.quantity) AS revenue
                  FROM sale_items si
                  JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
                 WHERE s.sale_date BETWEEN ? AND ?
                 GROUP BY si.product_id
           ) sold ON sold.product_id = p.id
          WHERE p.deleted_at IS NULL AND p.status = 'active' AND p.quantity > 0
          ORDER BY `Units sold` ASC, `In stock` DESC
          LIMIT 50",
        [$from, $to]
    );
    return ["Worst sellers $from → $to (stock on hand, fewest sales first)",
            ['Medicine', 'Code', 'In stock', 'Units sold', 'Revenue'], $rows, null];
}

/** Cash flow: money in (income) vs money out (expenses + supplier payments) per day. */
function reportCashFlow(string $from, string $to): array
{
    $rows = DB::rows(
        "SELECT d.d AS `Date`,
                COALESCE(i.amt, 0)  AS `Cash in (income)`,
                COALESCE(e.amt, 0)  AS `Expenses`,
                COALESCE(sp.amt, 0) AS `Supplier payments`,
                COALESCE(i.amt, 0) - COALESCE(e.amt, 0) - COALESCE(sp.amt, 0) AS `Net cash`
           FROM (
                SELECT DISTINCT income_date AS d FROM incomes
                 WHERE deleted_at IS NULL AND income_date BETWEEN :f1 AND :t1
                UNION SELECT DISTINCT expense_date FROM expenses
                 WHERE deleted_at IS NULL AND expense_date BETWEEN :f2 AND :t2
                UNION SELECT DISTINCT DATE(created_at) FROM supplier_ledger
                 WHERE entry_type = 'payment' AND DATE(created_at) BETWEEN :f3 AND :t3
           ) d
           LEFT JOIN (SELECT income_date d, SUM(amount) amt FROM incomes
                       WHERE deleted_at IS NULL GROUP BY income_date) i  ON i.d  = d.d
           LEFT JOIN (SELECT expense_date d, SUM(amount) amt FROM expenses
                       WHERE deleted_at IS NULL GROUP BY expense_date) e ON e.d  = d.d
           LEFT JOIN (SELECT DATE(created_at) d, SUM(credit) amt FROM supplier_ledger
                       WHERE entry_type = 'payment' GROUP BY DATE(created_at)) sp ON sp.d = d.d
          ORDER BY d.d",
        ['f1' => $from, 't1' => $to, 'f2' => $from, 't2' => $to, 'f3' => $from, 't3' => $to]
    );
    $summary = [
        'Cash in'  => array_sum(array_column($rows, 'Cash in (income)')),
        'Cash out' => array_sum(array_column($rows, 'Expenses')) + array_sum(array_column($rows, 'Supplier payments')),
        'Net'      => array_sum(array_column($rows, 'Net cash')),
    ];
    return ["Cash flow $from → $to", 
            ['Date', 'Cash in (income)', 'Expenses', 'Supplier payments', 'Net cash'], $rows, $summary];
}
