-- Fase 2 — WS5500 data-ingestie.
--
-- Let op (TiDB-specifiek, zie 0000_white_warhawk.sql): `timestamp(3)`-kolommen
-- vereisen dat het `DEFAULT`/`ON UPDATE`-getal exact dezelfde precisie heeft
-- (dus `now(3)` / `CURRENT_TIMESTAMP(3)`, niet `now()` / `CURRENT_TIMESTAMP`).
-- Dat is in dit bestand al met de hand gecorrigeerd na het genereren met
-- `drizzle-kit generate`.
--
-- `processing_status` krijgt een nieuwe, fijnmaziger waardenset. Bestaande
-- rijen (bv. uit `npm run demo`) met een oude waarde moeten omgezet worden
-- naar de dichtstbijzijnde nieuwe waarde. Een enum-kolom accepteert echter
-- nooit een waarde die niet in zijn (op dat moment geldende) waardenlijst
-- staat, en de oude en nieuwe waardenset hebben geen overlap — daarom eerst
-- de kolom verbreden naar de VERENIGING van oude + nieuwe waarden, dan de
-- data omzetten, en pas daarna de kolom versmallen naar alleen de nieuwe
-- waarden.
ALTER TABLE `raw_weather_packets` MODIFY COLUMN `processing_status` enum('pending','processed','error','ignored','received','normalized','partial','failed','duplicate') NOT NULL DEFAULT 'received';--> statement-breakpoint
UPDATE `raw_weather_packets` SET `processing_status` = 'received' WHERE `processing_status` = 'pending';--> statement-breakpoint
UPDATE `raw_weather_packets` SET `processing_status` = 'normalized' WHERE `processing_status` = 'processed';--> statement-breakpoint
UPDATE `raw_weather_packets` SET `processing_status` = 'failed' WHERE `processing_status` IN ('error', 'ignored');--> statement-breakpoint
ALTER TABLE `raw_weather_packets` MODIFY COLUMN `processing_status` enum('received','normalized','partial','failed','duplicate') NOT NULL DEFAULT 'received';--> statement-breakpoint
CREATE TABLE `weather_provider_state` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`station_id` bigint unsigned NOT NULL,
	`provider` varchar(40) NOT NULL,
	`last_polled_at` timestamp(3),
	`last_success_at` timestamp(3),
	`last_error_at` timestamp(3),
	`last_error` varchar(2000),
	`last_payload_hash` varchar(64),
	`last_raw_packet_id` bigint unsigned,
	`created_at` timestamp(3) NOT NULL DEFAULT (now(3)),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now(3)) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `weather_provider_state_id` PRIMARY KEY(`id`),
	CONSTRAINT `provider_state_station_provider_unique` UNIQUE(`station_id`,`provider`)
);
--> statement-breakpoint
ALTER TABLE `raw_weather_packets` MODIFY COLUMN `station_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `raw_weather_packets` ADD `http_method` varchar(10);--> statement-breakpoint
ALTER TABLE `raw_weather_packets` ADD `raw_body_text` mediumtext;--> statement-breakpoint
ALTER TABLE `raw_weather_packets` ADD `remote_address` varchar(64);--> statement-breakpoint
ALTER TABLE `raw_weather_packets` ADD `unknown_fields` json;--> statement-breakpoint
ALTER TABLE `raw_weather_packets` ADD `parse_warnings` json;--> statement-breakpoint
ALTER TABLE `weather_provider_state` ADD CONSTRAINT `weather_provider_state_station_id_stations_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weather_provider_state` ADD CONSTRAINT `provider_state_last_packet_fk` FOREIGN KEY (`last_raw_packet_id`) REFERENCES `raw_weather_packets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `raw_packets_status_idx` ON `raw_weather_packets` (`processing_status`);
