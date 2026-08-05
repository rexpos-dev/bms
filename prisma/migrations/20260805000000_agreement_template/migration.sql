-- CreateTable
CREATE TABLE `agreement_versions` (
    `id` VARCHAR(191) NOT NULL,
    `version_no` INTEGER NOT NULL,
    `note` TEXT NULL,
    `created_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `agreement_versions_version_no_key`(`version_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agreement_sections` (
    `id` VARCHAR(191) NOT NULL,
    `version_id` VARCHAR(191) NOT NULL,
    `heading` TEXT NOT NULL,
    `body` TEXT NOT NULL,
    `sort_order` INTEGER NOT NULL,

    INDEX `agreement_sections_version_id_idx`(`version_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `agreement_versions` ADD CONSTRAINT `agreement_versions_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agreement_sections` ADD CONSTRAINT `agreement_sections_version_id_fkey`
    FOREIGN KEY (`version_id`) REFERENCES `agreement_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `job_order_items`
    ADD COLUMN `warranty_tier` ENUM('MAIN_SET', 'ACCESSORY', 'NONE') NOT NULL DEFAULT 'ACCESSORY';

-- AlterTable
ALTER TABLE `job_orders`
    ADD COLUMN `include_agreement` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `agreement_version_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `job_orders_agreement_version_id_idx` ON `job_orders`(`agreement_version_id`);

-- AddForeignKey
ALTER TABLE `job_orders` ADD CONSTRAINT `job_orders_agreement_version_id_fkey`
    FOREIGN KEY (`agreement_version_id`) REFERENCES `agreement_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
