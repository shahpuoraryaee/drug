<?php
declare(strict_types=1);

final class Auth
{
    /** Role → permission matrix. Modules: products, categories, suppliers,
     *  purchases, inventory, expenses, income, reports, users, backup, settings.
     *  Actions: view, add, edit, delete, export, print, backup, restore. */
    public const MATRIX = [
        'owner' => '*',
        'manager' => [
            'sales'     => ['view','add','edit','delete','return','cancel','override','discount','export','print'],
            'products'  => ['view','add','edit','delete','export','print'],
            'categories'=> ['view','add','edit','delete'],
            'suppliers' => ['view','add','edit','delete','export','print'],
            'purchases' => ['view','add','edit','delete','export','print'],
            'inventory' => ['view','add','edit','export','print'],
            'expenses'  => ['view','add','edit','delete','export','print'],
            'income'    => ['view','add','edit','export','print'],
            'reports'   => ['view','export','print'],
            'settings'  => ['view','edit'],
        ],
        'cashier' => [
            // POS operator: sell, print, return own sales. No price/batch override,
            // no discount above the configured limit, no delete/cancel/edit.
            'sales'     => ['view','add','return','print'],
            'products'  => ['view'],      // needed for POS search / barcode lookup
            'inventory' => ['view'],
        ],
        'storekeeper' => [
            // Same sales-floor rights as cashier (this business's storekeeper also sells),
            // plus the storekeeper's own stock-management permissions.
            'sales'     => ['view','add','return','print'],
            'products'  => ['view','add','edit','print'],
            'categories'=> ['view','add'],
            'suppliers' => ['view'],
            'purchases' => ['view','add','print'],
            'inventory' => ['view','add','edit','print'],
            'reports'   => ['view'],
        ],
        'accountant' => [
            'sales'     => ['view','export','print'],
            'products'  => ['view'],
            'suppliers' => ['view','export','print'],
            'purchases' => ['view','export','print'],
            'expenses'  => ['view','add','edit','delete','export','print'],
            'income'    => ['view','add','edit','export','print'],
            'reports'   => ['view','export','print'],
        ],
    ];

    public static function start(): void
    {
        if (session_status() === PHP_SESSION_NONE) session_start();
    }

    public static function attempt(string $username, string $password): ?array
    {
        $u = DB::row(
            'SELECT * FROM users WHERE username = ? AND status = 1 AND deleted_at IS NULL',
            [$username]
        );
        if (!$u || !password_verify($password, $u['password_hash'])) return null;

        session_regenerate_id(true);
        $_SESSION['uid']  = (int) $u['id'];
        $_SESSION['role'] = $u['role'];
        $_SESSION['name'] = $u['full_name'];
        DB::exec('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$u['id']]);
        return self::user();
    }

    public static function logout(): void
    {
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) session_destroy();
    }

    public static function check(): bool
    {
        return isset($_SESSION['uid']);
    }

    public static function id(): ?int
    {
        return isset($_SESSION['uid']) ? (int) $_SESSION['uid'] : null;
    }

    public static function role(): string
    {
        return $_SESSION['role'] ?? 'guest';
    }

    public static function user(): ?array
    {
        if (!self::check()) {
            return null;
        }

        $name = $_SESSION['name'] ?? '';

        return [
            'id'          => self::id(),
            'name'        => $name,
            'full_name'   => $name,
            'role'        => self::role(),
            'permissions' => self::MATRIX[self::role()] ?? [],
        ];
    }

    public static function can(string $module, string $action): bool
    {
        $m = self::MATRIX[self::role()] ?? null;
        if ($m === '*') return true;
        return is_array($m) && in_array($action, $m[$module] ?? [], true);
    }

    public static function require(string $module, string $action): void
    {
        if (!self::check()) fail('Not signed in.', 401);
        if (!self::can($module, $action)) fail('You do not have permission for this action.', 403);
    }
}
