-- Reassign any machine operators before dropping the enum value.
UPDATE `users` SET `role` = 'ADMIN_STAFF' WHERE `role` = 'MACHINE_OPERATOR';

-- KPI definition templates for the removed MACHINE_OPERATOR role no longer
-- apply to any role once the enum value is dropped; remove them before the
-- enum alteration to avoid a data-truncation error.
DELETE FROM `kpi_definitions` WHERE `role` = 'MACHINE_OPERATOR';

-- Secondary MACHINE_OPERATOR role assignments must be removed before the enum
-- alteration to avoid a data-truncation error (mirrors the kpi_definitions guard).
DELETE FROM `user_role_assignments` WHERE `role` = 'MACHINE_OPERATOR';

-- DropForeignKey
ALTER TABLE `design_job_updates` DROP FOREIGN KEY `design_job_updates_author_id_fkey`;

-- DropForeignKey
ALTER TABLE `design_job_updates` DROP FOREIGN KEY `design_job_updates_design_job_id_fkey`;

-- DropForeignKey
ALTER TABLE `design_jobs` DROP FOREIGN KEY `design_jobs_designer_id_fkey`;

-- DropForeignKey
ALTER TABLE `design_jobs` DROP FOREIGN KEY `design_jobs_operator_id_fkey`;

-- DropForeignKey
ALTER TABLE `ink_refill_logs` DROP FOREIGN KEY `ink_refill_logs_machine_id_fkey`;

-- DropForeignKey
ALTER TABLE `ink_refill_logs` DROP FOREIGN KEY `ink_refill_logs_machine_ink_id_fkey`;

-- DropForeignKey
ALTER TABLE `ink_usage_logs` DROP FOREIGN KEY `ink_usage_logs_machine_id_fkey`;

-- DropForeignKey
ALTER TABLE `ink_usage_logs` DROP FOREIGN KEY `ink_usage_logs_machine_ink_id_fkey`;

-- DropForeignKey
ALTER TABLE `job_orders` DROP FOREIGN KEY `job_orders_design_job_id_fkey`;

-- DropForeignKey
ALTER TABLE `machine_inks` DROP FOREIGN KEY `machine_inks_machine_id_fkey`;

-- DropIndex
DROP INDEX `job_orders_design_job_id_key` ON `job_orders`;

-- AlterTable
ALTER TABLE `job_orders` DROP COLUMN `design_job_id`,
    DROP COLUMN `type`;

-- AlterTable
ALTER TABLE `kpi_definitions` MODIFY `role` ENUM('SUPER_ADMIN', 'INSTALLER', 'DEVELOPER', 'DESIGNER', 'LIAISON', 'ADMIN_STAFF', 'SALES_STAFF') NOT NULL;

-- AlterTable
ALTER TABLE `user_role_assignments` MODIFY `role` ENUM('SUPER_ADMIN', 'INSTALLER', 'DEVELOPER', 'DESIGNER', 'LIAISON', 'ADMIN_STAFF', 'SALES_STAFF') NOT NULL;

-- AlterTable
ALTER TABLE `users` MODIFY `role` ENUM('SUPER_ADMIN', 'INSTALLER', 'DEVELOPER', 'DESIGNER', 'LIAISON', 'ADMIN_STAFF', 'SALES_STAFF') NOT NULL;

-- DropTable
DROP TABLE `design_job_updates`;

-- DropTable
DROP TABLE `design_jobs`;

-- DropTable
DROP TABLE `ink_refill_logs`;

-- DropTable
DROP TABLE `ink_usage_logs`;

-- DropTable
DROP TABLE `machine_inks`;

-- DropTable
DROP TABLE `printer_machines`;

