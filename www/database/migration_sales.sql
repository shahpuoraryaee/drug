-- ============================================================
-- Arya Pharma Manager — SALES MODULE migration (v1.1)
-- Run once on EXISTING installs:  mysql arya_pharma < migration_sales.sql
-- Fresh installs get all of this from schema.sql automatically.
-- ============================================================

-- New role for POS operators
ALTER TABLE users
  MODIFY role ENUM('owner','manager','storekeeper','accountant','cashier')
  NOT NULL DEFAULT 'storekeeper';

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

-- Data the module expects (idempotent)
INSERT IGNORE INTO income_categories (name) VALUES ('Medicine Sales');
INSERT IGNORE INTO settings (setting_key, setting_value) VALUES
  ('max_discount_percent', '10'),
  ('hold_expire_days', '7'),
  ('receipt_footer', 'Thank you — get well soon!');
