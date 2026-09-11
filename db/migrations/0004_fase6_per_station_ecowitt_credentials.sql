-- Fase 6 — eigen Ecowitt Cloud-sleutels per station.
--
-- Veilig voor bestaande productiedata: twee nieuwe, optionele (NULL
-- toegestaan) kolommen, geen wijziging aan bestaande kolommen of data. Een
-- bestaand station met beide kolommen leeg blijft exact het gedrag van vóór
-- Fase 6 gebruiken (de gedeelde ECOWITT_APPLICATION_KEY/ECOWITT_API_KEY
-- environment-variabelen) — zie fetchCurrent() in ecowitt-cloud.ts.
ALTER TABLE `stations` ADD `ecowitt_application_key` varchar(80);--> statement-breakpoint
ALTER TABLE `stations` ADD `ecowitt_api_key` varchar(80);