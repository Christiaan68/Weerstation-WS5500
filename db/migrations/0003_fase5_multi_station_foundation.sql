-- Fase 5.1 — fundament voor meerdere Ecowitt-compatibele weerstations.
--
-- Veilig voor bestaande productiedata: geen enkele DROP van data, alleen
-- een kolomhernoeming (behoudt de waarde), nieuwe optionele/default-kolommen,
-- en een nieuwe index. Het bestaande WS5500-station verliest geen historie en
-- wordt aan het eind expliciet het default-station.
--
-- 1) Menselijke naam: `name` -> `display_name` (waarde blijft ongewijzigd,
--    bv. "Mijn Alecto WS5500" blijft gewoon staan — alleen de kolomnaam
--    verandert, om het onderscheid met de technische identiteit
--    (station_identifier/mac_address/model) expliciet te maken).
ALTER TABLE `stations` RENAME COLUMN `name` TO `display_name`;--> statement-breakpoint

-- 2) Nieuwe stationvelden (Fase 5, §3).
ALTER TABLE `stations` ADD COLUMN `provider` varchar(40) NOT NULL DEFAULT 'ecowitt_cloud';--> statement-breakpoint
ALTER TABLE `stations` ADD COLUMN `firmware_version` varchar(60);--> statement-breakpoint
ALTER TABLE `stations` ADD COLUMN `location_description` varchar(160);--> statement-breakpoint
ALTER TABLE `stations` ADD COLUMN `is_default` boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- 3) Precies één default-station: het bestaande (eerst aangemaakte) station
--    wordt default, zodat de site zonder `?station=`-parameter exact zoals
--    voorheen het huidige WS5500 blijft tonen (Fase 5, §10).
UPDATE `stations` SET `is_default` = true WHERE `id` = (
  SELECT * FROM (SELECT MIN(`id`) FROM `stations`) AS `first_station`
);--> statement-breakpoint

-- 4) Samengestelde dedup-index (Fase 5, §34) — de per-station deduplicatie in
--    `findDuplicateRawPacket()` filterde al correct op (station_id,
--    payload_hash) samen; deze index laat TiDB dat voortaan direct via de
--    index doen i.p.v. via de losse payload_hash-index plus filter.
CREATE INDEX `raw_packets_station_payload_hash_idx` ON `raw_weather_packets` (`station_id`,`payload_hash`);--> statement-breakpoint

-- 5) Twee stations mogen nooit hetzelfde MAC-adres hebben (voorkomt een
--    ingestie- of Ecowitt-pollverwarring tussen stations). NULL blijft
--    toegestaan (meerdere stations zonder mac_address).
CREATE UNIQUE INDEX `stations_mac_address_unique` ON `stations` (`mac_address`);
