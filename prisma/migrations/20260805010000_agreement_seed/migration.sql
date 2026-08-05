-- Seed version 1 from the source Google Doc. `created_by_id` is NULL: no user made it.
SET @version_id = UUID();

INSERT INTO `agreement_versions` (`id`, `version_no`, `note`, `created_by_id`, `created_at`)
VALUES (@version_id, 1, 'Imported from the original Google Doc', NULL, NOW(3));

INSERT INTO `agreement_sections` (`id`, `version_id`, `heading`, `body`, `sort_order`) VALUES
(UUID(), @version_id, '', 'KNOW ALL MEN BY THESE PRESENTS:

This Service Agreement made and entered into this {{date}} at Tagum City, Philippines, by and between:

Beulah Information Technology Services and Business Solutions a duly organized and existing under the laws of the Philippines, with principal place of business located at Blk.1 Lot.1 Maximo Village, Tagum City, Davao Del Norte, Philippines represented herein by its Sales Manager, Mrs. Michel Jean L. Rodulfa, and hereinafter referred to as the SERVICE PROVIDER;

-And-

{{client_name}}, duly organized and existing under the laws of the Philippines, with its principal place of business located at {{client_address}} and hereinafter referred to as the CLIENT;

WITNESSETH THAT:

WHEREAS, the SERVICE PROVIDER is engaged in the business of providing Point of Sales Systems to all retail, wholesaler, pharmacy, restaurant or all possible clients that need sales monitoring and inventory in the Philippines;

WHEREAS, the CLIENT is engaged in the business of providing products and services within various areas in the Philippines;

WHEREAS, the CLIENT has offered, and the SERVICE PROVIDER has agreed to provide its Point of Sales System Services to CLIENT''s {{package_label}}.', 0),

(UUID(), @version_id, 'I. SCOPE OF SERVICE:', 'a) The SERVICE PROVIDER shall set up {{package_label}} with the following:

{{main_set_items}}

Warranty Coverage:

All included computer set accessories and components are covered by a 7-Day Replacement Warranty for factory defects and a 3-Month Limited Service Warranty under normal use conditions. Warranty does not cover physical damage, misuse, liquid damage, electrical surges, unauthorized repairs, or improper handling.

The following accessories are covered by 7 Days Replacement Warranty for defects and 1 Month Limited Warranty under normal use. Warranty does not cover misuse or damage caused by improper handling.

{{accessory_items}}

b) The SERVICE PROVIDER shall install the above-listed equipment to {{client_address}} of the CLIENT.', 1),

(UUID(), @version_id, 'II. CLIENTS REQUIREMENTS: Customer responsibilities and/ requirements;', 'a) Completion of POS training- dedicated assigned personnel that will complete the training.
b) Person In-charge - the one who will communicate with the provider for any support and assistance.
c) POS Station - a well secured area in which POS is safe from dust, water, secured and well ventilated. (Not advisable for the POS to frequently change the area or uninstall)
d) Payment for the Package, Installation and Training
e) Database with updated inventory (Initial) we will send excel format.
f) Person in charge for database integration, update and monitoring.
g) Hardware care and maintenance - our hardware has 1 month warranty so we require the client to strictly observe proper use.
h) Thermal papers, usb hub are not part of the package so we required every client to prepare upon deployment.', 2),

(UUID(), @version_id, 'III. CONFIDENTIAL INFORMATION', 'a) The provisions entered into by the parties in this Agreement shall be considered strictly confidential and shall not be divulged to any person or entity. Further, the parties herein shall not, either during the term of this agreement or at any time thereafter, use or disclose to any person, firm or corporation any information concerning the business or affairs of the other party which it may have acquired by reason of this agreement, for its own benefit or to the detriment of the Other party;

b) Any information acquired from the POS shall not be divulged to any person, natural or juridical, unless ordered by the court or other government agency having authority to do so;

c) In default settings, each client account provides the POS PROVIDER''s support personnel the ability to log in and perform limited actions on the account. As such, the CLIENT''s POS or any data installed therein may be exposed to the said individuals or any third party who may find access to the said information. In this regard, the CLIENT may disable this function or request the SERVICE PROVIDER to disable the said function to ensure confidentiality, with an understanding that in doing so, the support access on the said account may be limited to a certain extent;', 3),

(UUID(), @version_id, 'IV. TRANSFERABILITY AND ASSIGNABILITY:', 'This agreement or any right there to shall not be assigned or transferred without the express written consent of the parties herein;', 4),

(UUID(), @version_id, 'V. ENTIRE AGREEMENT AND AMENDMENT', 'This Service Agreement constitutes the full and complete understanding between the parties hereto with respect to the subject matter of this agreement, and there are no other promises, representations or warranties affecting it. Any provisions in this agreement may not be altered, changed and/or modified in any manner, orally or otherwise, except by an instrument in writing signed by a duly authorized officer or representative of each of the parties hereto;', 5),

(UUID(), @version_id, 'VI. SEPARABILITY:', 'Each provision in this agreement is separate and independent from the others, and is not to be construed and/or interpreted as having any restrictive or expansive effect upon the meaning, intention, interpretation or execution of any other provision of this agreement either implicitly or explicitly, unless it so specifically provides;', 6),

(UUID(), @version_id, 'VII. CONFORMITY:', 'The parties have read and understood all terms and conditions of this agreement and hereby express their conformity thereof.', 7),

(UUID(), @version_id, 'VIII. OFFICIAL CONTACT PERSONS FOR THE SERVICE PROVIDER', 'Sales Manager - Michel Jean L. Rodulfa - 09755886714 - atty.mjbl.cpa@gmail.com
Operation Manager - Ronald Allan P. Rodulfa - 09552436673', 8),

(UUID(), @version_id, '', '__________________ | __________________
Mrs. Michel Jean L. Rodulfa | {{client_owner}}
Beulah Information Technology Services and Business Solutions | {{client_name}}', 9);
