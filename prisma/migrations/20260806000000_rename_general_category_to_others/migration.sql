-- Rename the seeded "General" category to "Others" to match current naming.
-- Items already assigned to it keep their category_id — this only changes
-- the display name.
UPDATE `item_categories` SET `name` = 'Others' WHERE `name` = 'General';
