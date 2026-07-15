-- ============================================================
-- Arya Pharma Manager — v1.2 migration (SRS gap closure)
-- Run once on EXISTING installs:  mysql arya_pharma < migration_v12.sql
-- Fresh installs get all of this from schema.sql automatically.
-- ============================================================

-- Products: optional photo (Module 4)
ALTER TABLE products ADD COLUMN image_path VARCHAR(255) NULL AFTER description;

-- Categories: icon name + colour label (Module 3)
ALTER TABLE categories
  ADD COLUMN name_fa VARCHAR(100) NULL AFTER name,
  ADD COLUMN icon  VARCHAR(30) NULL AFTER name_fa,
  ADD COLUMN color CHAR(7)     NULL AFTER icon;

-- Purchase items: track how much has been returned to the supplier,
-- and remember which batch the line created (returns leave that batch).
ALTER TABLE purchase_items
  ADD COLUMN returned_quantity INT NOT NULL DEFAULT 0 AFTER quantity,
  ADD COLUMN batch_id INT UNSIGNED NULL AFTER product_id,
  ADD CONSTRAINT fk_pi_batch FOREIGN KEY (batch_id)
      REFERENCES product_batches(id) ON DELETE SET NULL;

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
