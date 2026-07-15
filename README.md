# Arya Pharma Manager

Offline pharmacy **business management** system for Windows — built for Afghan pharmacy owners.
PHP 8.3 · MySQL/MariaDB · AJAX single-page app · runs inside [PHP Desktop](https://github.com/cztomczak/phpdesktop).

> Not a POS. It manages products, batches & expiry, purchases, supplier accounts,
> expenses, income, and financial reports — with full keyboard control (F1–F11, Ctrl+K).

---

## 1. What's in the box

```
settings.json            PHP Desktop configuration (copy next to phpdesktop-chrome.exe)
download-vendors.ps1     OPTIONAL nicer dialogs/charts/icons (needs internet, run once)
www/
  install.php            One-time installer (creates DB + demo data)
  login.php · index.php  Sign-in page and app shell
  api.php                Single AJAX endpoint: api.php?action=module.method
  config.php             DB credentials & paths  ← edit this first
  includes/              DB, helpers, Auth (role permission matrix)
  modules/               auth, dashboard, products, categories, suppliers, purchases,
                         inventory, expenses, income, reports, search, users, backup, settings
  database/schema.sql    Full 3NF schema (FULLTEXT product search, batch-level expiry)
  database/seed.sql      Demo data: 100 products, 20 categories, 6 suppliers,
                         batches across all expiry buckets, purchases, 45 days of income
  assets/                Vendor-free CSS/JS ("Dispensary" design system)
```

## 2. Install (Windows, fully offline)

**A. Database — MariaDB or MySQL**
Easiest: install [XAMPP](https://www.apachefriends.org/) or MariaDB MSI and make sure
the MySQL service is running on `127.0.0.1:3306`.

**B. Configure**
Open `www/config.php` and set `DB_USER` / `DB_PASS` for your MySQL.
Optional: point `MYSQLDUMP_PATH` at `C:\xampp\mysql\bin\mysqldump.exe` for faster native
backups (otherwise a built-in pure-PHP backup is used — works fine).

**C. Run inside PHP Desktop**
1. Download PHP Desktop Chrome, unzip.
2. Replace its `www/` folder with this project's `www/` folder.
3. Copy this project's `settings.json` over the one next to `phpdesktop-chrome.exe`.
4. Make sure the bundled `php/` is PHP 8.x with `pdo_mysql` enabled
   (in `php/php.ini`: `extension=pdo_mysql`).
5. Start `phpdesktop-chrome.exe` → the installer opens automatically.

*(Alternative for testing without PHP Desktop: `cd www && php -S 127.0.0.1:8080`
then open http://127.0.0.1:8080 in a browser.)*

**D. Install**
Click **Install now**. It creates database `arya_pharma`, imports the schema and the
demo data, and locks itself (`www/install.lock` — delete that file to re-run).

## 3. Sign in

| Username | Password | Role | Person |
|---|---|---|---|
| `owner` | `arya123` | owner — everything | Nadia Rahimi |
| `manager` | `arya123` | manager | Farid Ahmadi |
| `store` | `arya123` | storekeeper | Jawed Karimi |
| `accounts` | `arya123` | accountant | Zahra Noori |

**Change all passwords after first sign-in** (Users screen → pencil icon, or the
"Change password" button which every role can use for their own account).

## 4. Keyboard map

| Key | Action |
|---|---|
| `F1`–`F9` | Dashboard · Products · Inventory · Purchases · Expenses · Income · Reports · Suppliers · Categories |
| `F10` / `F11` | Backup / Settings |
| `F12` | Sales (POS) |
| `Ctrl K` | Global search (medicine, generic, barcode, batch, supplier) |
| `Ctrl N` | New record on Products / Purchases / Expenses / Income |
| `↑ ↓` + `Enter` | Move through table rows, open selected |
| `Ctrl S` | Save the open form |
| `Esc` | Close form / search |

Languages: English, دری (Dari), پښتو (Pashto) — switch from the top bar; RTL is automatic.
Dark mode: moon button. Both preferences persist.

## 5. How the important parts work

- **Batches & expiry** — stock lives in `product_batches` with per-batch expiry.
  The dashboard "Expiry ledger" heat bar buckets everything into 180+/90/60/30/15/expired.
  Stock reductions (adjust/damage/expired) use **FEFO** — first-expiring batch first.
- **Purchases** — a saved invoice atomically: creates/merges batches, recalculates the
  product's **moving-average cost**, writes an inventory movement, debits the supplier
  ledger, and (if you paid something) credits it back. Partial payments allowed; pay the
  rest later from the Purchases list or the Supplier ledger.
- **Reports** — financial summary, inventory value, low stock, expiry, dead stock,
  purchases, expenses, income. Every report exports to CSV (Excel-compatible, UTF-8 BOM)
  and prints cleanly (Ctrl+P — the app chrome is hidden by print CSS).
- **Backup** — one click; uses `mysqldump` if configured, otherwise a pure-PHP dump.
  Files land in `www/backups/`. Restore from the same screen (owner only).
- **Security** — prepared statements everywhere, `password_hash`, session hardening,
  role matrix enforced server-side on every request, audit log on all mutations,
  soft deletes throughout.

## 6. Sales module (POS) — v1.1

A full point-of-sale for **walk-in customers** (no customer records, by design).

**Enable it**
- *Fresh install:* nothing to do — `schema.sql` already contains everything.
- *Existing install:* run once
  `mysql -u root arya_pharma < www/database/migration_sales.sql`
  (or paste the file into phpMyAdmin). The dashboard and all other screens keep
  working even before the migration; the Sales screen simply reports the missing tables.

**Using it**
- `F12` opens the POS. `F2` focuses the medicine search, `F3` opens Scan-with-Phone.
- USB / Bluetooth barcode scanners just work: they type into the search box and
  press Enter, which does an exact barcode lookup and drops the item in the cart.
- `Ctrl S` completes the sale (payments accept mixed methods: cash / card / bank /
  mobile money). The receipt (80 mm) prints automatically; `Esc` clears the cart;
  **Hold** parks a cart so the next customer can be served.
- Completing a sale runs **one database transaction** that deducts stock batch-by-batch
  (FEFO, expired batches are never sellable), writes inventory movements, creates the
  income entry under *Medicine Sales*, computes gross profit at batch cost, and audits —
  any failure rolls the whole thing back.
- **Returns** (full or partial): Sales list → return icon, or the Return button →
  find invoice → quantities + reason. Stock goes back to the *original batch*,
  a negative income entry reverses the revenue, reports and dashboard follow.
- **Cancel** (manager/owner) fully reverses an untouched completed sale.
- New **cashier** role: sell, print, return and see *their own* sales only; price/batch
  override and above-limit discounts need a manager (limit: Settings → *POS max discount %*).
- New reports: **Sales (POS)** (daily revenue / returns / net / COGS / profit) and
  **Best sellers** — both export to CSV like every other report.

**Scan with phone**
The POS shows a QR code; any Android/iPhone on the same Wi-Fi scans it, gets a
camera page (no app install), and every barcode it reads lands in the cart within
about a second. Requirements: in `settings.json` change `"listen_on"` from
`["127.0.0.1", 0]` to `["0.0.0.0", 8666]`, allow the port in Windows Firewall,
and run `download-vendors.ps1` once so the QR code renders (without it the POS
shows the address to type by hand — scanning still works). Android Chrome decodes
barcodes natively; iPhones use the optional html5-qrcode vendor file, or manual entry.

## 7. v1.2 additions (SRS gap closure)

- **Purchase returns** — open a purchase invoice → *Return*: goods leave the exact
  batch the invoice created (blocked if that stock was already sold), the supplier
  ledger is credited, movements and audit entries are written. Reason + note required.
- **Product photos** — edit a product → upload JPG/PNG/WebP (max 1 MB).
- **Barcode labels** — Products list → label icon: prints CODE 128 labels (A4, 60 mm)
  with name and price. Generated locally, no library. *Verify one printed label with
  your scanner before printing in bulk.*
- **Category icons & colour labels**, plus the Dari category name now actually saves
  (fixed a v1.0 column that was missing).
- **Expense attachments** — attach a receipt photo or PDF (max 4 MB) to any expense.
- **Company logo** — Settings → upload; appears on POS receipts.
- **Audit log screen** (owner) — filter by module/action/user, view before/after data,
  plus a Login history tab. Read-only by design.
- **New reports** — *Worst sellers* (stock on hand, fewest sales) and *Cash flow*
  (income vs expenses vs supplier payments per day). *Financial summary* is your P&L.
- Dashboard now also shows **today's purchases**.
- Fixed pre-existing bugs found during integration: swapped `audit()` arguments in
  three modules (would crash under strict types) and a response-shape mismatch in
  `purchases.get`.

**Existing installs:** run `www/database/migration_v12.sql` once (after
`migration_sales.sql` if you haven't run that yet). Fresh installs need nothing —
`schema.sql` contains everything. Uploads are stored in `www/uploads/`; include that
folder in your file backups (database backups cover data only).

## 8. v1.3 — POS polish (detailed sales checklist)

- **Percentage discounts**: type `50` for a fixed amount or `5%` in any discount box
  (per line and invoice level); percent follows quantity/price changes. Zero or
  negative selling prices are now rejected server-side.
- **Cart**: expiry column (shows the FEFO batch's expiry as soon as it's known),
  − / + quantity buttons, true *sellable* stock (expired stock excluded) per line.
- **Shortcuts added**: `F4` jump to payment · `Ctrl B` focus barcode/search ·
  `Ctrl P` reprint the last completed receipt.
- **Sales history**: filter by date range, cashier and payment method; **Duplicate**
  starts a new cart with the same items (fresh FEFO batches, current stock).
- **Printing**: A4 invoice from the sale view (use Windows "Print to PDF" for PDF
  copies), an 80 mm **return receipt** prints after each return, and the sale receipt
  shows an invoice-number **QR code** when the optional qrcodejs vendor file exists.
- **Held sales expire** automatically (Settings → *Held sales expire after*, default 7 days).
- **Phone scanner**: closing the scan window now explicitly ends the session server-side.
- **Reports**: Sales report groups by day / week / month / year and shows **Margin %**;
  new **Cashier sales** and **Sales returns** reports (all export to CSV).
- **Dashboard**: this-month sales count/revenue, month profit, top products and recent
  returns are included in the stats payload; the KPI strip shows the month figures.
- Audit entries for completed sales now record the total discount given explicitly.

No new migration is needed for v1.3 beyond the two existing files —
`migration_sales.sql` gained one settings row (`hold_expire_days`), which
`sales_held` also self-heals via its default.

## 9. Optional extras (internet needed once)

Run `download-vendors.ps1` to fetch SweetAlert2 (prettier confirm dialogs), Chart.js
(smoother dashboard chart), Bootstrap Icons, qrcode.js (Scan-with-Phone QR display)
and html5-qrcode (iPhone camera decoding). The app detects them automatically.
Without them it uses its own built-in dialogs, SVG chart and inline SVG icons —
**nothing is lost functionally.**

## 10. Important honesty note

This build was written in an environment **without PHP or MySQL available**, so it has
not been executed end-to-end. The JavaScript passes syntax checks and the SQL/PHP follow
the tested patterns from the approved prototype, but expect the possibility of small
first-run issues. If something fails: check `www/php-error.log` first — every API error
is logged there with details.
