<?php
declare(strict_types=1);

/**
 * Global search (Ctrl+K overlay).
 * Searches products (name / generic / brand / code / barcode / batch no)
 * and suppliers. Fast on 100k rows: prefix LIKE for short terms (uses
 * indexes), FULLTEXT for 3+ char terms.
 */
function search_global(): void
{
    Auth::require('products', 'view');
    $q     = inStr('q');
    $scope = inStr('scope', 'all'); // all|products|suppliers|batches
    if (mb_strlen($q) < 1) ok(['products' => [], 'suppliers' => [], 'batches' => []]);

    $like = $q . '%';
    $out  = ['products' => [], 'suppliers' => [], 'batches' => []];

    if ($scope === 'all' || $scope === 'products') {
        if (mb_strlen($q) >= 3) {
            $boolean = '+' . preg_replace('/\s+/', '* +', trim(preg_replace('/[+\-<>()~*"@]+/', ' ', $q))) . '*';
            $out['products'] = DB::rows(
                "SELECT p.id, p.product_code, p.medicine_name, p.generic_name, p.brand_name,
                        p.selling_price, p.quantity, p.unit,
                        c.name AS category_name
                   FROM products p
                   LEFT JOIN categories c ON c.id = p.category_id
                  WHERE p.deleted_at IS NULL
                    AND (MATCH(p.medicine_name, p.generic_name, p.brand_name)
                         AGAINST (? IN BOOLEAN MODE)
                         OR p.product_code LIKE ? OR p.barcode LIKE ?)
                  LIMIT 8",
                [$boolean, $like, $like]
            );
        } else {
            $out['products'] = DB::rows(
                "SELECT p.id, p.product_code, p.medicine_name, p.generic_name, p.brand_name,
                        p.selling_price, p.quantity, p.unit,
                        c.name AS category_name
                   FROM products p
                   LEFT JOIN categories c ON c.id = p.category_id
                  WHERE p.deleted_at IS NULL
                    AND (p.medicine_name LIKE ? OR p.generic_name LIKE ?
                         OR p.brand_name LIKE ? OR p.product_code LIKE ? OR p.barcode LIKE ?)
                  LIMIT 8",
                [$like, $like, $like, $like, $like]
            );
        }
    }

    if ($scope === 'all' || $scope === 'suppliers') {
        $out['suppliers'] = DB::rows(
            "SELECT id, name, contact_person, phone, balance
               FROM suppliers
              WHERE deleted_at IS NULL
                AND (name LIKE ? OR contact_person LIKE ? OR phone LIKE ?)
              LIMIT 5",
            [$like, $like, $like]
        );
    }

    if ($scope === 'all' || $scope === 'batches') {
        $out['batches'] = DB::rows(
            "SELECT b.id, b.batch_number, b.expiry_date, b.quantity,
                    p.id AS product_id, p.medicine_name, p.product_code
               FROM product_batches b
               JOIN products p ON p.id = b.product_id AND p.deleted_at IS NULL
              WHERE b.batch_number LIKE ? AND b.quantity > 0
              ORDER BY b.expiry_date
              LIMIT 5",
            [$like]
        );
    }

    ok($out);
}
