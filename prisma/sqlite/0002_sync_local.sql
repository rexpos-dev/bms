-- Local sync bookkeeping (desktop app only). Generated from src/sync-tables.ts by `npm run gen:sqlite`.

-- key/value: applying ('1' while a pulled batch is being written, so triggers stay quiet),
-- initial_done, since_seq (highest server change seq pulled), last_sync_at
CREATE TABLE "_sync_state" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);
INSERT INTO "_sync_state" ("key", "value") VALUES ('applying', '0'), ('initial_done', '0'), ('since_seq', '0');

-- Rows changed locally and not yet pushed. One entry per row; op_id is stable across
-- retries of the same content and reset whenever the row changes again.
CREATE TABLE "_sync_outbox" (
    "table_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "op_id" TEXT,
    "queued_at" TEXT NOT NULL,
    PRIMARY KEY ("table_name", "record_id")
);

-- The server version (updatedAt, ISO) of each row as of the last sync: the optimistic-lock base.
CREATE TABLE "_sync_row_meta" (
    "table_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    PRIMARY KEY ("table_name", "record_id")
);

-- Local edits the server refused (server wins). Shown to the user, then marked seen.
CREATE TABLE "_sync_rejected" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "table_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "local_row" TEXT,
    "created_at" TEXT NOT NULL,
    "seen_at" TEXT
);

CREATE TRIGGER "trg_sync_clients_i" AFTER INSERT ON "clients"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('clients', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_clients_u" AFTER UPDATE ON "clients"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('clients', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_clients_d" AFTER DELETE ON "clients"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('clients', OLD."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_item_categories_i" AFTER INSERT ON "item_categories"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('item_categories', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_item_categories_u" AFTER UPDATE ON "item_categories"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('item_categories', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_item_categories_d" AFTER DELETE ON "item_categories"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('item_categories', OLD."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_inventory_items_i" AFTER INSERT ON "inventory_items"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('inventory_items', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_inventory_items_u" AFTER UPDATE OF "id", "name", "description", "barcode", "unit_price", "low_stock_alert", "sort_order", "active", "category_id", "created_at" ON "inventory_items"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('inventory_items', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_inventory_items_d" AFTER DELETE ON "inventory_items"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('inventory_items', OLD."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_item_packages_i" AFTER INSERT ON "item_packages"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('item_packages', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_item_packages_u" AFTER UPDATE ON "item_packages"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('item_packages', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_item_packages_d" AFTER DELETE ON "item_packages"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('item_packages', OLD."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_item_package_items_i" AFTER INSERT ON "item_package_items"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('item_package_items', NEW."id", NEW."package_id", NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('item_packages', NEW."package_id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_item_package_items_u" AFTER UPDATE ON "item_package_items"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('item_package_items', NEW."id", NEW."package_id", NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('item_packages', NEW."package_id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_item_package_items_d" AFTER DELETE ON "item_package_items"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('item_package_items', OLD."id", OLD."package_id", NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('item_packages', OLD."package_id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_licenses_i" AFTER INSERT ON "licenses"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('licenses', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_licenses_u" AFTER UPDATE OF "id", "license_key", "client_id", "product_id", "activation_date", "expiration_date", "status", "is_trial", "trial_days", "notes", "created_at", "voided_at", "voided_by_id", "void_reason", "transferred_to_nenpos_client_id" ON "licenses"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('licenses', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_licenses_d" AFTER DELETE ON "licenses"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('licenses', OLD."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_nenpos_clients_i" AFTER INSERT ON "nenpos_clients"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('nenpos_clients', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_nenpos_clients_u" AFTER UPDATE ON "nenpos_clients"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('nenpos_clients', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_nenpos_clients_d" AFTER DELETE ON "nenpos_clients"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('nenpos_clients', OLD."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_job_orders_i" AFTER INSERT ON "job_orders"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('job_orders', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_job_orders_u" AFTER UPDATE ON "job_orders"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('job_orders', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_job_orders_d" AFTER DELETE ON "job_orders"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('job_orders', OLD."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_job_order_units_i" AFTER INSERT ON "job_order_units"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('job_order_units', NEW."id", NEW."job_order_id", NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('job_orders', NEW."job_order_id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_job_order_units_u" AFTER UPDATE ON "job_order_units"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('job_order_units', NEW."id", NEW."job_order_id", NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('job_orders', NEW."job_order_id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_job_order_units_d" AFTER DELETE ON "job_order_units"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('job_order_units', OLD."id", OLD."job_order_id", NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('job_orders', OLD."job_order_id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_job_order_items_i" AFTER INSERT ON "job_order_items"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('job_order_items', NEW."id", NEW."job_order_id", NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('job_orders', NEW."job_order_id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_job_order_items_u" AFTER UPDATE ON "job_order_items"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('job_order_items', NEW."id", NEW."job_order_id", NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('job_orders', NEW."job_order_id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_job_order_items_d" AFTER DELETE ON "job_order_items"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('job_order_items', OLD."id", OLD."job_order_id", NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('job_orders', OLD."job_order_id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_payments_i" AFTER INSERT ON "payments"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('payments', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_payments_u" AFTER UPDATE ON "payments"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('payments', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_payments_d" AFTER DELETE ON "payments"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('payments', OLD."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_stock_movements_i" AFTER INSERT ON "stock_movements"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('stock_movements', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_stock_movements_u" AFTER UPDATE ON "stock_movements"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('stock_movements', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_stock_movements_d" AFTER DELETE ON "stock_movements"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('stock_movements', OLD."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_audit_logs_i" AFTER INSERT ON "audit_logs"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('audit_logs', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_audit_logs_u" AFTER UPDATE ON "audit_logs"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('audit_logs', NEW."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;

CREATE TRIGGER "trg_sync_audit_logs_d" AFTER DELETE ON "audit_logs"
WHEN (SELECT "value" FROM "_sync_state" WHERE "key" = 'applying') = '0'
BEGIN
    INSERT INTO "_sync_outbox" ("table_name", "record_id", "parent_id", "op_id", "queued_at")
    VALUES ('audit_logs', OLD."id", NULL, NULL, datetime('now'))
    ON CONFLICT ("table_name", "record_id") DO UPDATE SET "op_id" = NULL, "queued_at" = excluded."queued_at", "parent_id" = excluded."parent_id";
END;
