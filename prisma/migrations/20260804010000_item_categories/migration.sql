-- CreateTable
CREATE TABLE `item_categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `job_order_type` ENUM('SOFTWARE', 'CCTV', 'SIGNAGE') NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `item_categories_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `inventory_items` ADD COLUMN `category_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `inventory_items_category_id_idx` ON `inventory_items`(`category_id`);

-- AddForeignKey
ALTER TABLE `inventory_items` ADD CONSTRAINT `inventory_items_category_id_fkey`
    FOREIGN KEY (`category_id`) REFERENCES `item_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the three starting categories
INSERT INTO `item_categories` (`id`, `name`, `job_order_type`, `sort_order`, `active`, `created_at`, `updated_at`)
VALUES
    (UUID(), 'POS Hardware', 'SOFTWARE', 0, true, NOW(3), NOW(3)),
    (UUID(), 'CCTV',         'CCTV',     1, true, NOW(3), NOW(3)),
    (UUID(), 'General',      NULL,       2, true, NOW(3), NOW(3));

-- Backfill: the ten existing rows are all POS hardware.
-- Names are matched exactly; an unmatched row stays uncategorised and keeps
-- appearing in every picker, which is the pre-migration behaviour.
UPDATE `inventory_items`
SET `category_id` = (SELECT `id` FROM `item_categories` WHERE `name` = 'POS Hardware')
WHERE `name` IN (
    'Complete Set',
    'Computer / PC',
    'Cash Drawer',
    'Thermal Printer 80mm',
    'Thermal Printer 58mm',
    'Barcode Scanner',
    'Keyboard & Mouse',
    'Monitor'
);

UPDATE `inventory_items`
SET `category_id` = (SELECT `id` FROM `item_categories` WHERE `name` = 'General')
WHERE `name` IN ('UPS / AVR', 'Network Switch');
