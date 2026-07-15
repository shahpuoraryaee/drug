-- ============================================================
-- Arya Pharma Manager — v1.3 migration (bug-fix pass)
-- Run once on EXISTING installs:  mysql arya_pharma < migration_v13_fixes.sql
-- Fresh installs get all of this from schema.sql automatically.
--
-- Fixes, each mapped to the php-error.log symptom it resolves:
--   1) users.phone column was missing -> "Unknown column 'phone' in
--      field list" on every user list/save, which also blocked
--      creating new users.
--   2) backups.method column was missing -> "Unknown column 'method'
--      in field list", which made every backup attempt fail.
-- ============================================================

ALTER TABLE users
  ADD COLUMN phone VARCHAR(30) NULL AFTER role;

ALTER TABLE backups
  ADD COLUMN method ENUM('mysqldump','php') NOT NULL DEFAULT 'php' AFTER mode;
