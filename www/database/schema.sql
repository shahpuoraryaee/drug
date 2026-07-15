-- ============================================================
-- ARYA PHARMA MANAGER — MySQL 8 / MariaDB 10.6+ schema
-- Normalized (3NF) · InnoDB · utf8mb4 · FKs · indexed search
-- ============================================================
SET FOREIGN_KEY_CHECKS = 0;

-- ---------- USERS ----------
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(120) NOT NULL,
  role          ENUM('owner','manager','storekeeper','accountant','cashier') NOT NULL DEFAULT 'storekeeper',
  phone         VARCHAR(30) NULL,
  status        TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- CATEGORIES (self-referencing: parent_id NULL = top level) ----------
CREATE TABLE IF NOT EXISTS categories (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  parent_id  INT UNSIGNED NULL,
  name       VARCHAR(100) NOT NULL,
  name_fa    VARCHAR(100) NULL,
  icon       VARCHAR(30) NULL,
  color      CHAR(7) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status     TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY idx_cat_parent (parent_id),
  KEY idx_cat_name (name),
  CONSTRAINT fk_cat_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- SUPPLIERS ----------
CREATE TABLE IF NOT EXISTS suppliers (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(150) NOT NULL,
  contact_person VARCHAR(120) NULL,
  phone          VARCHAR(40)  NULL,
  email          VARCHAR(120) NULL,
  address        VARCHAR(255) NULL,
  balance        DECIMAL(14,2) NOT NULL DEFAULT 0.00,  -- amount WE owe supplier
  notes          TEXT NULL,
  status         TINYINT(1) NOT NULL DEFAULT 1,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at     DATETIME NULL,
  KEY idx_sup_name (name),
  KEY idx_sup_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- PRODUCTS ----------
CREATE TABLE IF NOT EXISTS products (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_code   VARCHAR(30)  NOT NULL,
  barcode        VARCHAR(64)  NULL,
  medicine_name  VARCHAR(160) NOT NULL,
  generic_name   VARCHAR(160) NULL,
  brand_name     VARCHAR(120) NULL,
  category_id    INT UNSIGNED NULL,
  subcategory_id INT UNSIGNED NULL,
  supplier_id    INT UNSIGNED NULL,
  purchase_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,   -- last purchase price
  selling_price  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  average_cost   DECIMAL(12,4) NOT NULL DEFAULT 0.0000, -- moving average
  unit           VARCHAR(30)  NOT NULL DEFAULT 'pcs',
  quantity       INT NOT NULL DEFAULT 0,                -- cached SUM(batches.quantity)
  min_quantity   INT NOT NULL DEFAULT 0,
  max_quantity   INT NOT NULL DEFAULT 0,
  location       VARCHAR(60)  NULL,                     -- shelf / rack
  description    TEXT NULL,
  image_path     VARCHAR(255) NULL,
  status         ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_by     INT UNSIGNED NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at     DATETIME NULL,
  UNIQUE KEY uq_prod_code (product_code),
  UNIQUE KEY uq_prod_barcode (barcode),
  KEY idx_prod_name (medicine_name),
  KEY idx_prod_generic (generic_name),
  KEY idx_prod_brand (brand_name),
  KEY idx_prod_category (category_id),
  KEY idx_prod_subcategory (subcategory_id),
  KEY idx_prod_supplier (supplier_id),
  KEY idx_prod_qty (quantity),
  KEY idx_prod_status (status, deleted_at),
  FULLTEXT KEY ft_prod_search (medicine_name, generic_name, brand_name),
  CONSTRAINT fk_prod_cat    FOREIGN KEY (category_id)    REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_prod_subcat FOREIGN KEY (subcategory_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_prod_sup    FOREIGN KEY (supplier_id)    REFERENCES suppliers(id)  ON DELETE SET NULL,
  CONSTRAINT fk_prod_user   FOREIGN KEY (created_by)     REFERENCES users(id)      ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- PRODUCT BATCHES (expiry lives here) ----------
CREATE TABLE IF NOT EXISTS product_batches (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id         INT UNSIGNED NOT NULL,
  batch_number       VARCHAR(60) NOT NULL,
  quantity           INT NOT NULL DEFAULT 0,
  unit_cost          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  manufacturing_date DATE NULL,
  expiry_date        DATE NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_batch_product (product_id),
  KEY idx_batch_number (batch_number),
  KEY idx_batch_expiry (expiry_date),
  KEY idx_batch_expiry_qty (expiry_date, quantity),
  CONSTRAINT fk_batch_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- PURCHASES ----------
CREATE TABLE IF NOT EXISTS purchases (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(40) NOT NULL,
  supplier_id    INT UNSIGNED NOT NULL,
  purchase_date  DATE NOT NULL,
  subtotal       DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  discount       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  shipping       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tax            DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  grand_total    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  paid_amount    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  payment_status ENUM('paid','partial','unpaid') NOT NULL DEFAULT 'unpaid',
  notes          TEXT NULL,
  created_by     INT UNSIGNED NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at     DATETIME NULL,
  UNIQUE KEY uq_purch_invoice (invoice_number),
  KEY idx_purch_supplier (supplier_id),
  KEY idx_purch_date (purchase_date),
  KEY idx_purch_status (payment_status),
  CONSTRAINT fk_purch_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_purch_user     FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_items (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_id        INT UNSIGNED NOT NULL,
  product_id         INT UNSIGNED NOT NULL,
  batch_id           INT UNSIGNED NULL,
  batch_number       VARCHAR(60) NULL,
  manufacturing_date DATE NULL,
  expiry_date        DATE NULL,
  quantity           INT NOT NULL,
  returned_quantity  INT NOT NULL DEFAULT 0,
  unit_cost          DECIMAL(12,2) NOT NULL,
  line_total         DECIMAL(14,2) NOT NULL,
  KEY idx_pi_purchase (purchase_id),
  KEY idx_pi_product (product_id),
  CONSTRAINT fk_pi_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  CONSTRAINT fk_pi_batch    FOREIGN KEY (batch_id)    REFERENCES product_batches(id) ON DELETE SET NULL,
  CONSTRAINT fk_pi_product  FOREIGN KEY (product_id)  REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- INVENTORY MOVEMENTS (every stock change writes history) ----------
CREATE TABLE IF NOT EXISTS inventory_movements (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id      INT UNSIGNED NOT NULL,
  batch_id        INT UNSIGNED NULL,
  movement_type   ENUM('initial','purchase','sale','adjustment','damage','expired','lost','return') NOT NULL,
  quantity_change INT NOT NULL,             -- signed: +in / -out
  quantity_after  INT NOT NULL,             -- product quantity after this movement
  reference_type  VARCHAR(30) NULL,         -- e.g. 'purchase'
  reference_id    INT UNSIGNED NULL,
  note            VARCHAR(255) NULL,
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_im_product_date (product_id, created_at),
  KEY idx_im_type (movement_type),
  KEY idx_im_ref (reference_type, reference_id),
  KEY idx_im_date (created_at),
  CONSTRAINT fk_im_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_im_batch   FOREIGN KEY (batch_id)   REFERENCES product_batches(id) ON DELETE SET NULL,
  CONSTRAINT fk_im_user    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- SUPPLIER LEDGER ----------
CREATE TABLE IF NOT EXISTS supplier_ledger (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  supplier_id   INT UNSIGNED NOT NULL,
  entry_type    ENUM('purchase','payment','adjustment') NOT NULL,
  debit         DECIMAL(14,2) NOT NULL DEFAULT 0.00,  -- we owe more
  credit        DECIMAL(14,2) NOT NULL DEFAULT 0.00,  -- we paid
  balance_after DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  reference_id  INT UNSIGNED NULL,
  note          VARCHAR(255) NULL,
  created_by    INT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sl_supplier_date (supplier_id, created_at),
  CONSTRAINT fk_sl_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- EXPENSES ----------
CREATE TABLE IF NOT EXISTS expense_categories (
  id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name   VARCHAR(80) NOT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_expcat_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expenses (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  expense_category_id INT UNSIGNED NOT NULL,
  amount              DECIMAL(12,2) NOT NULL,
  expense_date        DATE NOT NULL,
  description         VARCHAR(255) NULL,
  paid_by             VARCHAR(120) NULL,
  attachment_path     VARCHAR(255) NULL,
  created_by          INT UNSIGNED NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at          DATETIME NULL,
  KEY idx_exp_date (expense_date),
  KEY idx_exp_cat (expense_category_id),
  CONSTRAINT fk_exp_cat  FOREIGN KEY (expense_category_id) REFERENCES expense_categories(id),
  CONSTRAINT fk_exp_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- INCOME ----------
CREATE TABLE IF NOT EXISTS income_categories (
  id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name   VARCHAR(80) NOT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_inccat_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS incomes (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  income_category_id INT UNSIGNED NOT NULL,
  amount             DECIMAL(12,2) NOT NULL,
  income_date        DATE NOT NULL,
  description        VARCHAR(255) NULL,
  created_by         INT UNSIGNED NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at         DATETIME NULL,
  KEY idx_inc_date (income_date),
  KEY idx_inc_cat (income_category_id),
  CONSTRAINT fk_inc_cat  FOREIGN KEY (income_category_id) REFERENCES income_categories(id),
  CONSTRAINT fk_inc_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- SETTINGS (key/value) ----------
CREATE TABLE IF NOT EXISTS settings (
  setting_key   VARCHAR(60) PRIMARY KEY,
  setting_value TEXT NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- AUDIT LOG ----------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NULL,
  action      VARCHAR(30) NOT NULL,          -- create / update / delete / login / backup / restore ...
  entity      VARCHAR(40) NOT NULL,          -- table / module name
  entity_id   BIGINT UNSIGNED NULL,
  old_data    JSON NULL,
  new_data    JSON NULL,
  ip_address  VARCHAR(45) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_entity (entity, entity_id),
  KEY idx_audit_user_date (user_id, created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- BACKUP HISTORY ----------
CREATE TABLE IF NOT EXISTS backups (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  filename    VARCHAR(190) NOT NULL,
  size_bytes  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  mode        ENUM('manual','automatic') NOT NULL DEFAULT 'manual',
  method      ENUM('mysqldump','php') NOT NULL DEFAULT 'php',
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_backup_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- SALES MODULE (v1.1)
-- ---------- SALES (header) ----------
CREATE TABLE IF NOT EXISTS sales (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(40) NOT NULL,
  sale_date      DATE NOT NULL,
  status         ENUM('completed','held','cancelled') NOT NULL DEFAULT 'completed',
  subtotal       DECIMAL(14,2) NOT NULL DEFAULT 0.00,  -- after per-line discounts
  discount       DECIMAL(12,2) NOT NULL DEFAULT 0.00,  -- invoice-level discount
  grand_total    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  paid_amount    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  change_amount  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_cost     DECIMAL(14,2) NOT NULL DEFAULT 0.00,  -- COGS at batch cost
  gross_profit   DECIMAL(14,2) NOT NULL DEFAULT 0.00,  -- grand_total - total_cost
  payment_method ENUM('cash','card','bank','mobile','mixed') NOT NULL DEFAULT 'cash',
  income_id      INT UNSIGNED NULL,                    -- auto-created income row
  notes          VARCHAR(255) NULL,
  created_by     INT UNSIGNED NULL,                    -- cashier
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sales_invoice (invoice_number),
  KEY idx_sales_date (sale_date),
  KEY idx_sales_status (status),
  KEY idx_sales_cashier_date (created_by, sale_date),
  CONSTRAINT fk_sales_income FOREIGN KEY (income_id) REFERENCES incomes(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_user   FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- SALE ITEMS ----------
-- One row per (product, batch) slice: a FEFO sale of one product can span
-- several batches, and returns must restore the exact batch.
CREATE TABLE IF NOT EXISTS sale_items (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_id           INT UNSIGNED NOT NULL,
  product_id        INT UNSIGNED NOT NULL,
  batch_id          INT UNSIGNED NULL,
  quantity          INT NOT NULL,
  returned_quantity INT NOT NULL DEFAULT 0,
  unit_price        DECIMAL(12,2) NOT NULL,            -- price actually charged
  unit_cost         DECIMAL(12,2) NOT NULL DEFAULT 0,  -- batch cost at sale time
  discount          DECIMAL(12,2) NOT NULL DEFAULT 0,  -- per-line discount amount
  line_total        DECIMAL(14,2) NOT NULL,            -- qty*price - discount
  KEY idx_si_sale (sale_id),
  KEY idx_si_product (product_id),
  CONSTRAINT fk_si_sale    FOREIGN KEY (sale_id)    REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_si_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_si_batch   FOREIGN KEY (batch_id)   REFERENCES product_batches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- SALE PAYMENTS (supports mixed payment) ----------
CREATE TABLE IF NOT EXISTS sale_payments (
  id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_id INT UNSIGNED NOT NULL,
  method  ENUM('cash','card','bank','mobile') NOT NULL,
  amount  DECIMAL(12,2) NOT NULL,
  KEY idx_sp_sale (sale_id),
  CONSTRAINT fk_sp_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- SALE RETURNS ----------
CREATE TABLE IF NOT EXISTS sale_returns (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  return_number VARCHAR(40) NOT NULL,
  sale_id       INT UNSIGNED NOT NULL,
  reason        ENUM('wrong_medicine','damaged','expired','changed_mind','duplicate','other') NOT NULL,
  refund_total  DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  cost_restored DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  income_id     INT UNSIGNED NULL,                     -- negative income adjustment
  note          VARCHAR(255) NULL,
  created_by    INT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sr_number (return_number),
  KEY idx_sr_sale (sale_id),
  KEY idx_sr_date (created_at),
  CONSTRAINT fk_sr_sale   FOREIGN KEY (sale_id)   REFERENCES sales(id),
  CONSTRAINT fk_sr_income FOREIGN KEY (income_id) REFERENCES incomes(id) ON DELETE SET NULL,
  CONSTRAINT fk_sr_user   FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sale_return_items (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_return_id INT UNSIGNED NOT NULL,
  sale_item_id   INT UNSIGNED NOT NULL,
  quantity       INT NOT NULL,
  refund_amount  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  KEY idx_sri_return (sale_return_id),
  KEY idx_sri_item (sale_item_id),
  CONSTRAINT fk_sri_return FOREIGN KEY (sale_return_id) REFERENCES sale_returns(id) ON DELETE CASCADE,
  CONSTRAINT fk_sri_item   FOREIGN KEY (sale_item_id)   REFERENCES sale_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- PHONE SCANNER (QR pairing) ----------
CREATE TABLE IF NOT EXISTS scan_sessions (
  token      CHAR(32) PRIMARY KEY,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_ss_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scan_events (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token      CHAR(32) NOT NULL,
  barcode    VARCHAR(80) NOT NULL,
  consumed   TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_se_token (token, consumed),
  CONSTRAINT fk_se_session FOREIGN KEY (token) REFERENCES scan_sessions(token) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- v1.2 additions
-- ---------- PURCHASE RETURNS (Module 5) ----------
CREATE TABLE IF NOT EXISTS purchase_returns (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  return_number VARCHAR(40) NOT NULL,
  purchase_id   INT UNSIGNED NOT NULL,
  supplier_id   INT UNSIGNED NOT NULL,
  reason        ENUM('damaged','expired','wrong_item','overstock','quality','other') NOT NULL,
  total_value   DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  note          VARCHAR(255) NULL,
  created_by    INT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pr_number (return_number),
  KEY idx_pr_purchase (purchase_id),
  KEY idx_pr_supplier (supplier_id),
  CONSTRAINT fk_pr_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id),
  CONSTRAINT fk_pr_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_pr_user     FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_return_id INT UNSIGNED NOT NULL,
  purchase_item_id   INT UNSIGNED NOT NULL,
  quantity           INT NOT NULL,
  value_amount       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  KEY idx_pri_return (purchase_return_id),
  KEY idx_pri_item (purchase_item_id),
  CONSTRAINT fk_pri_return FOREIGN KEY (purchase_return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
  CONSTRAINT fk_pri_item   FOREIGN KEY (purchase_item_id)   REFERENCES purchase_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
