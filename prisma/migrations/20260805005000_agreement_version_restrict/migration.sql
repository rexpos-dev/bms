-- Agreement versions are never deleted — make that a database invariant rather
-- than a convention. RESTRICT refuses to drop a version that any job order is
-- pinned to, where SET NULL would silently unpin the order and change which
-- agreement text it is considered to have been signed under.
ALTER TABLE `job_orders` DROP FOREIGN KEY `job_orders_agreement_version_id_fkey`;

ALTER TABLE `job_orders` ADD CONSTRAINT `job_orders_agreement_version_id_fkey`
    FOREIGN KEY (`agreement_version_id`) REFERENCES `agreement_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
