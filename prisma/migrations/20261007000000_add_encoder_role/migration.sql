-- ENCODER: data-entry role (clients, project job orders, installation
-- schedules and installer assignment). Additive enum change only.
ALTER TABLE `users` MODIFY `role` ENUM('SUPER_ADMIN', 'INSTALLER', 'DEVELOPER', 'DESIGNER', 'LIAISON', 'ADMIN_STAFF', 'SALES_STAFF', 'ENCODER') NOT NULL;
ALTER TABLE `user_role_assignments` MODIFY `role` ENUM('SUPER_ADMIN', 'INSTALLER', 'DEVELOPER', 'DESIGNER', 'LIAISON', 'ADMIN_STAFF', 'SALES_STAFF', 'ENCODER') NOT NULL;
ALTER TABLE `kpi_definitions` MODIFY `role` ENUM('SUPER_ADMIN', 'INSTALLER', 'DEVELOPER', 'DESIGNER', 'LIAISON', 'ADMIN_STAFF', 'SALES_STAFF', 'ENCODER') NOT NULL;
