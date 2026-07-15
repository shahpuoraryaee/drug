<?php
declare(strict_types=1);

/** One request returns everything the dashboard needs (< 1s target). */
function dashboard_stats(): void
{
    if (!Auth::check()) fail('Not signed in.', 401);
    $today = date('Y-m-d');
    $monthStart = date('Y-m-01');

    $incToday  = (float) DB::val('SELECT COALESCE(SUM(amount),0) FROM incomes  WHERE deleted_at IS NULL AND income_date  = ?', [$today]);
    $incMonth  = (float) DB::val('SELECT COALESCE(SUM(amount),0) FROM incomes  WHERE deleted_at IS NULL AND income_date  >= ?', [$monthStart]);
    $expToday  = (float) DB::val('SELECT COALESCE(SUM(amount),0) FROM expenses WHERE deleted_at IS NULL AND expense_date = ?', [$today]);
    $expMonth  = (float) DB::val('SELECT COALESCE(SUM(amount),0) FROM expenses WHERE deleted_at IS NULL AND expense_date >= ?', [$monthStart]);
    $incYday   = (float) DB::val('SELECT COALESCE(SUM(amount),0) FROM incomes  WHERE deleted_at IS NULL AND income_date  = ?', [date('Y-m-d', strtotime('-1 day'))]);
    $purToday  = (float) DB::val('SELECT COALESCE(SUM(grand_total),0) FROM purchases WHERE deleted_at IS NULL AND purchase_date = ?', [$today]); // v1.2

    $inv = DB::row(
        "SELECT COUNT(*) AS products, COALESCE(SUM(quantity),0) AS units,
                COALESCE(SUM(quantity * average_cost),0) AS value,
                SUM(CASE WHEN quantity > 0 AND quantity <= min_quantity THEN 1 ELSE 0 END) AS low_stock,
                SUM(CASE WHEN quantity <= 0 THEN 1 ELSE 0 END) AS out_of_stock
         FROM products WHERE deleted_at IS NULL AND status = 'active'"
    );

    // expiry buckets from batches (indexed on expiry_date, quantity)
    $exp = DB::row(
        "SELECT
           SUM(CASE WHEN expiry_date <  CURDATE() THEN 1 ELSE 0 END) AS expired,
           SUM(CASE WHEN expiry_date >= CURDATE() AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 15  DAY) THEN 1 ELSE 0 END) AS d15,
           SUM(CASE WHEN expiry_date >  DATE_ADD(CURDATE(), INTERVAL 15  DAY) AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30  DAY) THEN 1 ELSE 0 END) AS d30,
           SUM(CASE WHEN expiry_date >  DATE_ADD(CURDATE(), INTERVAL 30  DAY) AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 60  DAY) THEN 1 ELSE 0 END) AS d60,
           SUM(CASE WHEN expiry_date >  DATE_ADD(CURDATE(), INTERVAL 60  DAY) AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 90  DAY) THEN 1 ELSE 0 END) AS d90,
           SUM(CASE WHEN expiry_date >  DATE_ADD(CURDATE(), INTERVAL 90  DAY) AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 180 DAY) THEN 1 ELSE 0 END) AS d180,
           SUM(CASE WHEN expiry_date >  DATE_ADD(CURDATE(), INTERVAL 180 DAY) THEN 1 ELSE 0 END) AS d180plus
         FROM product_batches WHERE quantity > 0 AND expiry_date IS NOT NULL"
    );

    // ---- SALES MODULE (v1.1): today's POS stats; guarded so the dashboard
    //      still works if the sales migration has not been run yet ----
    $sales = ['count_today' => 0, 'total_today' => 0.0, 'profit_today' => 0.0, 'recent' => []];
    try {
        $s = DB::row(
            "SELECT COUNT(*) c, COALESCE(SUM(grand_total),0) t, COALESCE(SUM(gross_profit),0) p
               FROM sales WHERE status = 'completed' AND sale_date = ?", [$today]);
        $ret = (float) DB::val(
            "SELECT COALESCE(SUM(refund_total),0) FROM sale_returns WHERE DATE(created_at) = ?", [$today]);
        $sm = DB::row(
            "SELECT COUNT(*) c, COALESCE(SUM(grand_total),0) t, COALESCE(SUM(gross_profit),0) p
               FROM sales WHERE status = 'completed' AND sale_date >= ?", [$monthStart]);
        $sales = [
            'count_today'  => (int) $s['c'],
            'total_today'  => (float) $s['t'] - $ret,
            'profit_today' => (float) $s['p'],
            'count_month'  => (int) $sm['c'],
            'total_month'  => (float) $sm['t'],
            'profit_month' => (float) $sm['p'],
            'top_products' => DB::rows(
                "SELECT p.medicine_name, SUM(si.quantity - si.returned_quantity) AS units
                   FROM sale_items si
                   JOIN sales s2 ON s2.id = si.sale_id AND s2.status = 'completed' AND s2.sale_date >= ?
                   JOIN products p ON p.id = si.product_id
                  GROUP BY p.id ORDER BY units DESC LIMIT 3", [$monthStart]),
            'recent_returns' => DB::rows(
                "SELECT sr.return_number, sr.refund_total, sr.created_at
                   FROM sale_returns sr ORDER BY sr.id DESC LIMIT 3"),
            'recent'       => DB::rows(
                "SELECT s.id, s.invoice_number, s.grand_total, s.payment_method, s.created_at,
                        u.full_name AS cashier
                   FROM sales s LEFT JOIN users u ON u.id = s.created_by
                  WHERE s.status = 'completed' ORDER BY s.id DESC LIMIT 5"),
        ];
    } catch (Throwable) { /* sales tables absent — migration not run */ }

    $counts = [
        'suppliers'  => (int) DB::val('SELECT COUNT(*) FROM suppliers  WHERE deleted_at IS NULL'),
        'categories' => (int) DB::val('SELECT COUNT(*) FROM categories WHERE deleted_at IS NULL'),
    ];

    $recentPurchases = DB::rows(
        'SELECT pu.id, pu.invoice_number, pu.purchase_date, pu.grand_total, pu.payment_status, s.name AS supplier,
                (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = pu.id) AS item_count
         FROM purchases pu JOIN suppliers s ON s.id = pu.supplier_id
         WHERE pu.deleted_at IS NULL ORDER BY pu.id DESC LIMIT 5'
    );
    $recentExpenses = DB::rows(
        'SELECT e.id, e.amount, e.expense_date, e.description, ec.name AS category
         FROM expenses e JOIN expense_categories ec ON ec.id = e.expense_category_id
         WHERE e.deleted_at IS NULL ORDER BY e.expense_date DESC, e.id DESC LIMIT 5'
    );
    $lowStock = DB::rows(
        'SELECT id, medicine_name, quantity, min_quantity, unit FROM products
         WHERE deleted_at IS NULL AND status = "active" AND quantity <= min_quantity
         ORDER BY (quantity / NULLIF(min_quantity,0)) ASC LIMIT 6'
    );

    // 14-day income vs expense chart
    $chart = [];
    $from = date('Y-m-d', strtotime('-13 days'));
    $incByDay = [];
    foreach (DB::rows('SELECT income_date d, SUM(amount) a FROM incomes  WHERE deleted_at IS NULL AND income_date  >= ? GROUP BY income_date',  [$from]) as $r) $incByDay[$r['d']] = (float) $r['a'];
    $expByDay = [];
    foreach (DB::rows('SELECT expense_date d, SUM(amount) a FROM expenses WHERE deleted_at IS NULL AND expense_date >= ? GROUP BY expense_date', [$from]) as $r) $expByDay[$r['d']] = (float) $r['a'];
    for ($i = 13; $i >= 0; $i--) {
        $d = date('Y-m-d', strtotime("-$i days"));
        $chart[] = ['date' => date('d/m', strtotime($d)), 'income' => $incByDay[$d] ?? 0, 'expense' => $expByDay[$d] ?? 0];
    }

    ok([
        'income_today' => $incToday, 'purchases_today' => $purToday, 'income_month' => $incMonth, 'income_yesterday' => $incYday,
        'expense_today' => $expToday, 'expense_month' => $expMonth,
        'net_profit_month' => $incMonth - $expMonth,
        'inventory' => $inv, 'expiry' => $exp, 'counts' => $counts, 'sales' => $sales,
        'recent_purchases' => $recentPurchases, 'recent_expenses' => $recentExpenses,
        'low_stock' => $lowStock, 'chart' => $chart,
    ]);
}
