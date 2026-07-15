<?php
declare(strict_types=1);

function categories_list(): void
{
    Auth::require('categories', 'view');
    $rows = DB::rows(
        'SELECT c.id, c.parent_id, c.name, c.name_fa, c.icon, c.color, c.sort_order, c.status,
                (SELECT COUNT(*) FROM products p WHERE (p.category_id = c.id OR p.subcategory_id = c.id) AND p.deleted_at IS NULL) AS product_count
         FROM categories c WHERE c.deleted_at IS NULL
         ORDER BY COALESCE(c.parent_id, c.id), c.parent_id IS NOT NULL, c.sort_order, c.name'
    );
    ok($rows);
}

function categories_save(): void
{
    $id = inInt('id');
    Auth::require('categories', $id ? 'edit' : 'add');
    requireFields(['name']);
    $color = inStr('color');
    if ($color !== '' && !preg_match('/^#[0-9a-fA-F]{6}$/', $color)) fail('Colour must look like #1A2B3C.');
    $data = [
        'name'       => inStr('name'),
        'name_fa'    => inStr('name_fa') ?: null,
        'icon'       => inStr('icon') ?: null,       // v1.2 (SRS Module 3)
        'color'      => $color ?: null,              // v1.2 (SRS Module 3)
        'parent_id'  => inInt('parent_id') ?: null,
        'sort_order' => inInt('sort_order'),
        'status'     => inInt('status', 1) ? 1 : 0,
    ];
    if ($data['parent_id'] === $id && $id) fail('A category cannot be its own parent.');
    if ($id) {
        DB::update('categories', $data, 'id = ?', [$id]);
        audit('update', 'categories', $id, null, $data);
        ok(['id' => $id]);
    }
    $newId = DB::insert('categories', $data);
    audit('create', 'categories', $newId, null, $data);
    ok(['id' => $newId]);
}

function categories_delete(): void
{
    Auth::require('categories', 'delete');
    $id = inInt('id');
    $inUse = (int) DB::val(
        'SELECT COUNT(*) FROM products WHERE (category_id = ? OR subcategory_id = ?) AND deleted_at IS NULL',
        [$id, $id]
    );
    if ($inUse) fail("Cannot delete: $inUse product(s) use this category. Move them first.");
    DB::exec('UPDATE categories SET deleted_at = NOW() WHERE id = ? OR parent_id = ?', [$id, $id]);
    audit('delete', 'categories', $id);
    ok();
}
