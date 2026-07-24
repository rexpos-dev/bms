-- AlterTable
ALTER TABLE `licenses`
    ADD COLUMN `is_trial` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `trial_days` INTEGER NULL;
