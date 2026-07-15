<?php
declare(strict_types=1);

/**
 * Products. List queries are built to stay fast at 100k+ rows:
 * - short queries hit indexed prefix LIKE on code/barcode/name
 * - longer queries use the FULLTEXT index in boolean mode
 * - expiry filters join product_batches on its (expiry_date, quantity) index
 */

function products_list(): void
{
    Auth::require('products', 'view');
    [$page, $per, $off] = paging();

    $q        = inStr('q');
    $cat      = inInt('category_id');
    $sup      = inInt('supplier_id');
    $stock    = inStr('stock');    // '', low, out
    $expiry   = inInt('expiry');   // 0 | 90 | 60 | 30 | 15 | -1 (expired)
    $status   = inStr('status', 'active');

    $where  = ['p.deleted_at IS NULL'];
    $params = [];

    if ($status !== 'all') { $where[] = 'p.status = ?'; $params[] = $status; }
    if ($cat) { $where[] = '(p.category_id = ? OR p.subcategory_id = ?)'; $params[] = $cat; $params[] = $cat; }
    if ($sup) { $where[] = 'p.supplier_id = ?'; $params[] = $sup; }
    if ($stock === 'low') $where[] = 'p.quantity > 0 AND p.quantity <= p.min_quantity';
    if ($stock === 'out') $where[] = 'p.quantity <= 0';

    if ($q !== '') {
        if (mb_strlen($q) < 3) {
            $where[] = '(p.product_code LIKE ? OR p.barcode LIKE ? OR p.medicine_name LIKE ?)';
            $like = $q . '%';
            array_push($params, $like, $like, $like);
        } else {
            $where[] = '(MATCH(p.medicine_name, p.generic_name, p.brand_name) AGAINST(? IN BOOLEAN MODE)
                         OR p.product_code LIKE ? OR p.barcode LIKE ?)';
            array_push($params, $q . '*', $q . '%', $q . '%');
        }
    }

    if ($expiry !== 0) {
        if ($expiry === -1) {
            $where[] = 'EXISTS (SELECT 1 FROM product_batches b WHERE b.product_id = p.id
                        AND b.quantity > 0 AND b.expiry_date < CURDATE())';
        } else {
            $where[] = 'EXISTS (SELECT 1 FROM product_batches b WHERE b.product_id = p.id
                        AND b.quantity > 0 AND b.expiry_date >= CURDATE()
                        AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY))';
            $params[] = $expiry;
        }
    }

    $w = implode(' AND ', $where);
    $total = (int) DB::val("SELECT COUNT(*) FROM products p WHERE $w", $params);

    $rows = DB::rows(
        "SELECT p.id, p.product_code, p.barcode, p.medicine_name, p.generic_name, p.brand_name, p.image_path,
                p.quantity, p.min_quantity, p.unit, p.purchase_price, p.selling_price, p.location, p.status,
                c.name AS category, s.name AS supplier,
                nb.batch_number, nb.expiry_date,
                CASE WHEN nb.expiry_date IS NULL THEN NULL
                     ELSE DATEDIFF(nb.expiry_date, CURDATE()) END AS days_to_expiry
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN suppliers  s ON s.id = p.supplier_id
         LEFT JOIN product_batches nb ON nb.id = (
             SELECT b2.id FROM product_batches b2
             WHERE b2.product_id = p.id AND b2.quantity > 0
             ORDER BY b2.expiry_date ASC LIMIT 1
         )
         WHERE $w
         ORDER BY p.medicine_name ASC
         LIMIT $per OFFSET $off",
        $params
    );
    ok(paged($rows, $total, $page, $per));
}

function products_get(): void
{
    Auth::require('products', 'view');
    $id = inInt('id');
    $p  = DB::row('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL', [$id]);
    if (!$p) fail('Product not found.', 404);
    $batches = DB::rows(
        'SELECT id, batch_number, quantity, unit_cost, manufacturing_date, expiry_date,
                DATEDIFF(expiry_date, CURDATE()) AS days_to_expiry
         FROM product_batches WHERE product_id = ? ORDER BY expiry_date ASC',
        [$id]
    );
    ok(['product' => $p, 'batches' => $batches]);
}

/** Create or update. On create, an optional opening batch seeds stock. */
function products_save(): void
{
    $id = inInt('id');
    Auth::require('products', $id ? 'edit' : 'add');
    requireFields(['medicine_name']);

    $data = [
        'barcode'        => inStr('barcode') ?: null,
        'medicine_name'  => inStr('medicine_name'),
        'generic_name'   => inStr('generic_name') ?: null,
        'brand_name'     => inStr('brand_name') ?: null,
        'category_id'    => inInt('category_id') ?: null,
        'subcategory_id' => inInt('subcategory_id') ?: null,
        'supplier_id'    => inInt('supplier_id') ?: null,
        'purchase_price' => inFloat('purchase_price'),
        'selling_price'  => inFloat('selling_price'),
        'unit'           => inStr('unit', 'pcs'),
        'min_quantity'   => inInt('min_quantity'),
        'max_quantity'   => inInt('max_quantity'),
        'location'       => inStr('location') ?: null,
        'description'    => inStr('description') ?: null,
    ];

    if ($id) {
        $old = DB::row('SELECT * FROM products WHERE id = ?', [$id]);
        if (!$old) fail('Product not found.', 404);
        DB::update('products', $data, 'id = ?', [$id]);
        audit('update', 'products', $id, $old, $data);
        ok(['id' => $id]);
    }

    $newId = DB::tx(function () use ($data) {
        $data['product_code'] = inStr('product_code') ?: nextProductCode();
        $data['average_cost'] = $data['purchase_price'];
        $data['created_by']   = Auth::id();
        $pid = DB::insert('products', $data);

        $openQty = inInt('opening_quantity');
        if ($openQty > 0) {
            $bid = DB::insert('product_batches', [
                'product_id'         => $pid,
                'batch_number'       => inStr('batch_number') ?: ('B-' . random_int(10000, 99999)),
                'quantity'           => $openQty,
                'unit_cost'          => $data['purchase_price'],
                'manufacturing_date' => validDate(inStr('manufacturing_date')) ? inStr('manufacturing_date') : null,
                'expiry_date'        => validDate(inStr('expiry_date')) ? inStr('expiry_date') : null,
            ]);
            DB::exec('UPDATE products SET quantity = ? WHERE id = ?', [$openQty, $pid]);
            DB::insert('inventory_movements', [
                'product_id' => $pid, 'batch_id' => $bid, 'movement_type' => 'initial',
                'quantity_change' => $openQty, 'quantity_after' => $openQty,
                'reference_type' => 'product', 'reference_id' => $pid,
                'note' => 'Opening stock', 'created_by' => Auth::id(),
            ]);
        }
        return $pid;
    });
    audit('create', 'products', $newId, null, $data);
    ok(['id' => $newId]);
}

function products_delete(): void
{
    Auth::require('products', 'delete');
    $id = inInt('id');
    $old = DB::row('SELECT * FROM products WHERE id = ?', [$id]);
    if (!$old) fail('Product not found.', 404);
    DB::exec('UPDATE products SET deleted_at = NOW() WHERE id = ?', [$id]); // soft delete
    audit('delete', 'products', $id, $old);
    ok();
}

function products_archive(): void
{
    Auth::require('products', 'edit');
    $id = inInt('id');
    $to = inStr('to', 'archived') === 'active' ? 'active' : 'archived';
    DB::exec('UPDATE products SET status = ? WHERE id = ?', [$to, $id]);
    audit($to === 'archived' ? 'archive' : 'unarchive', 'products', $id);
    ok();
}

function products_duplicate(): void
{
    Auth::require('products', 'add');
    $src = DB::row('SELECT * FROM products WHERE id = ?', [inInt('id')]);
    if (!$src) fail('Product not found.', 404);
    unset($src['id'], $src['created_at'], $src['updated_at'], $src['deleted_at']);
    $src['product_code']  = nextProductCode();
    $src['barcode']       = null;
    $src['medicine_name'] .= ' (copy)';
    $src['quantity']      = 0;
    $src['created_by']    = Auth::id();
    $newId = DB::insert('products', $src);
    audit('create', 'products', $newId, null, ['duplicated_from' => inInt('id')]);
    ok(['id' => $newId]);
}

function products_export(): void
{
    Auth::require('products', 'export');
    $rows = DB::rows(
        "SELECT p.product_code, p.barcode, p.medicine_name, p.generic_name, p.brand_name,
                c.name AS category, s.name AS supplier, p.unit, p.quantity, p.min_quantity,
                p.purchase_price, p.selling_price, p.location, p.status
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN suppliers  s ON s.id = p.supplier_id
         WHERE p.deleted_at IS NULL ORDER BY p.medicine_name"
    );
    audit('export', 'products');
    csvOut('products-' . date('Y-m-d') . '.csv',
        ['Code','Barcode','Medicine','Generic','Brand','Category','Supplier','Unit',
         'Quantity','Min Qty','Purchase Price','Selling Price','Location','Status'],
        $rows);
}

/** CSV import: header row required — medicine_name,generic_name,brand_name,unit,purchase_price,selling_price,min_quantity,opening_quantity */
function products_import(): void
{
    Auth::require('products', 'add');
    if (empty($_FILES['file']['tmp_name'])) fail('Upload a CSV file.');
    $fp = fopen($_FILES['file']['tmp_name'], 'r');
    $header = array_map(fn($h) => strtolower(trim((string)$h)), fgetcsv($fp) ?: []);
    $need = 'medicine_name';
    if (!in_array($need, $header, true)) fail("CSV must include a '$need' column.");
    $idx = array_flip($header);
    $count = 0;

    DB::tx(function () use ($fp, $idx, &$count) {
        while (($r = fgetcsv($fp)) !== false) {
            $name = trim((string)($r[$idx['medicine_name']] ?? ''));
            if ($name === '') continue;
            $g = fn(string $k) => isset($idx[$k]) ? trim((string)($r[$idx[$k]] ?? '')) : '';
            $pid = DB::insert('products', [
                'product_code'   => nextProductCode(),
                'medicine_name'  => $name,
                'generic_name'   => $g('generic_name') ?: null,
                'brand_name'     => $g('brand_name') ?: null,
                'unit'           => $g('unit') ?: 'pcs',
                'purchase_price' => (float) $g('purchase_price'),
                'selling_price'  => (float) $g('selling_price'),
                'average_cost'   => (float) $g('purchase_price'),
                'min_quantity'   => (int) $g('min_quantity'),
                'created_by'     => Auth::id(),
            ]);
            $qty = (int) $g('opening_quantity');
            if ($qty > 0) {
                $bid = DB::insert('product_batches', [
                    'product_id' => $pid, 'batch_number' => 'B-' . random_int(10000, 99999),
                    'quantity' => $qty, 'unit_cost' => (float) $g('purchase_price'),
                ]);
                DB::exec('UPDATE products SET quantity = ? WHERE id = ?', [$qty, $pid]);
                DB::insert('inventory_movements', [
                    'product_id' => $pid, 'batch_id' => $bid, 'movement_type' => 'initial',
                    'quantity_change' => $qty, 'quantity_after' => $qty,
                    'note' => 'CSV import opening stock', 'created_by' => Auth::id(),
                ]);
            }
            $count++;
        }
    });
    audit('import', 'products', null, null, ['imported' => $count]);
    ok(['imported' => $count]);
}

function nextProductCode(): string
{
    $max = (int) DB::val(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(product_code, 5) AS UNSIGNED)), 0)
         FROM products WHERE product_code LIKE 'MED-%'"
    );
    return sprintf('MED-%05d', $max + 1);
}

/* ---------------- Product image (v1.2, SRS Module 4) ---------------- */
function products_uploadImage(): void
{
    Auth::require('products', 'edit');
    $id = inInt('id');
    $prod = DB::row('SELECT id, image_path FROM products WHERE id = ? AND deleted_at IS NULL', [$id]);
    if (!$prod) fail('Product not found.', 404);
    $path = saveUpload('image', 'products', ['jpg', 'jpeg', 'png', 'webp'], 1024);
    deleteUpload($prod['image_path']);
    DB::update('products', ['image_path' => $path], 'id = ?', [$id]);
    audit('update', 'products', $id, ['image_path' => $prod['image_path']], ['image_path' => $path]);
    ok(['image_path' => $path]);
}

function products_removeImage(): void
{
    Auth::require('products', 'edit');
    $id = inInt('id');
    $prod = DB::row('SELECT id, image_path FROM products WHERE id = ?', [$id]);
    if (!$prod) fail('Product not found.', 404);
    deleteUpload($prod['image_path']);
    DB::update('products', ['image_path' => null], 'id = ?', [$id]);
    audit('update', 'products', $id, ['image_path' => $prod['image_path']], ['image_path' => null]);
    ok();
}
