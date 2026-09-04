CREATE TABLE `app_settings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`setting_key` varchar(120) NOT NULL,
	`value` json NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now(3)),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now(3)) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_settings_key_unique` UNIQUE(`setting_key`)
);
--> statement-breakpoint
CREATE TABLE `daily_weather_summary` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`station_id` bigint unsigned NOT NULL,
	`local_date` date NOT NULL,
	`temperature_min_c` decimal(4,1),
	`temperature_max_c` decimal(4,1),
	`temperature_avg_c` decimal(4,1),
	`humidity_min_pct` decimal(4,1),
	`humidity_max_pct` decimal(4,1),
	`humidity_avg_pct` decimal(4,1),
	`pressure_min_hpa` decimal(6,1),
	`pressure_max_hpa` decimal(6,1),
	`pressure_avg_hpa` decimal(6,1),
	`wind_avg_kmh` decimal(5,1),
	`wind_max_kmh` decimal(5,1),
	`wind_gust_max_kmh` decimal(5,1),
	`rain_total_mm` decimal(8,2),
	`rain_rate_max_mm_h` decimal(6,2),
	`uv_max` decimal(3,1),
	`solar_radiation_max_wm2` decimal(6,1),
	`observation_count` int unsigned NOT NULL DEFAULT 0,
	`expected_observation_count` int unsigned,
	`coverage_pct` decimal(5,2),
	`created_at` timestamp(3) NOT NULL DEFAULT (now(3)),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now(3)) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `daily_weather_summary_id` PRIMARY KEY(`id`),
	CONSTRAINT `daily_summary_station_date_unique` UNIQUE(`station_id`,`local_date`)
);
--> statement-breakpoint
CREATE TABLE `monthly_weather_summary` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`station_id` bigint unsigned NOT NULL,
	`year` smallint unsigned NOT NULL,
	`month` tinyint unsigned NOT NULL,
	`temperature_min_c` decimal(4,1),
	`temperature_max_c` decimal(4,1),
	`temperature_avg_c` decimal(4,1),
	`humidity_min_pct` decimal(4,1),
	`humidity_max_pct` decimal(4,1),
	`humidity_avg_pct` decimal(4,1),
	`pressure_min_hpa` decimal(6,1),
	`pressure_max_hpa` decimal(6,1),
	`pressure_avg_hpa` decimal(6,1),
	`wind_avg_kmh` decimal(5,1),
	`wind_max_kmh` decimal(5,1),
	`wind_gust_max_kmh` decimal(5,1),
	`rain_total_mm` decimal(8,2),
	`rain_rate_max_mm_h` decimal(6,2),
	`uv_max` decimal(3,1),
	`solar_radiation_max_wm2` decimal(6,1),
	`observation_count` int unsigned NOT NULL DEFAULT 0,
	`expected_observation_count` int unsigned,
	`coverage_pct` decimal(5,2),
	`created_at` timestamp(3) NOT NULL DEFAULT (now(3)),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now(3)) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `monthly_weather_summary_id` PRIMARY KEY(`id`),
	CONSTRAINT `monthly_summary_station_year_month_unique` UNIQUE(`station_id`,`year`,`month`)
);
--> statement-breakpoint
CREATE TABLE `raw_weather_packets` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`station_id` bigint unsigned NOT NULL,
	`received_at` timestamp(3) NOT NULL DEFAULT (now(3)),
	`source` varchar(40) NOT NULL,
	`remote_timestamp` timestamp(3),
	`content_type` varchar(80),
	`raw_payload` json NOT NULL,
	`payload_hash` varchar(64),
	`parser_version` varchar(20),
	`processing_status` enum('pending','processed','error','ignored') NOT NULL DEFAULT 'pending',
	`processing_error` varchar(2000),
	`created_at` timestamp(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `raw_weather_packets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sensor_measurements` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`station_id` bigint unsigned NOT NULL,
	`observation_id` bigint unsigned,
	`measured_at` timestamp(3) NOT NULL,
	`sensor_type` varchar(40) NOT NULL,
	`channel` tinyint unsigned,
	`metric` varchar(60) NOT NULL,
	`value_numeric` decimal(12,4),
	`value_text` varchar(255),
	`unit` varchar(32),
	`metadata` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `sensor_measurements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stations` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(140) NOT NULL,
	`manufacturer` varchar(80) NOT NULL DEFAULT 'Alecto',
	`model` varchar(80) NOT NULL DEFAULT 'WS5500',
	`station_identifier` varchar(120) NOT NULL,
	`mac_address` varchar(17),
	`timezone` varchar(64) NOT NULL DEFAULT 'Europe/Amsterdam',
	`latitude` decimal(9,6),
	`longitude` decimal(9,6),
	`elevation_m` decimal(6,1),
	`expected_upload_interval_seconds` int unsigned NOT NULL DEFAULT 60,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT (now(3)),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now(3)) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `stations_id` PRIMARY KEY(`id`),
	CONSTRAINT `stations_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `stations_station_identifier_unique` UNIQUE(`station_identifier`)
);
--> statement-breakpoint
CREATE TABLE `weather_observations` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`station_id` bigint unsigned NOT NULL,
	`raw_packet_id` bigint unsigned,
	`measured_at` timestamp(3) NOT NULL,
	`received_at` timestamp(3) NOT NULL DEFAULT (now(3)),
	`temperature_outdoor_c` decimal(4,1),
	`temperature_indoor_c` decimal(4,1),
	`humidity_outdoor_pct` decimal(4,1),
	`humidity_indoor_pct` decimal(4,1),
	`dew_point_c` decimal(4,1),
	`feels_like_c` decimal(4,1),
	`wind_chill_c` decimal(4,1),
	`heat_index_c` decimal(4,1),
	`pressure_absolute_hpa` decimal(6,1),
	`pressure_relative_hpa` decimal(6,1),
	`wind_speed_kmh` decimal(5,1),
	`wind_gust_kmh` decimal(5,1),
	`wind_direction_deg` smallint unsigned,
	`rain_rate_mm_h` decimal(6,2),
	`rain_event_mm` decimal(7,2),
	`rain_hour_mm` decimal(7,2),
	`rain_day_mm` decimal(7,2),
	`rain_week_mm` decimal(8,2),
	`rain_month_mm` decimal(8,2),
	`rain_year_mm` decimal(9,2),
	`rain_total_mm` decimal(10,2),
	`uv_index` decimal(3,1),
	`solar_radiation_wm2` decimal(6,1),
	`quality_status` enum('ok','estimated','suspect','missing') NOT NULL DEFAULT 'ok',
	`quality_flags` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `weather_observations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `yearly_weather_summary` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`station_id` bigint unsigned NOT NULL,
	`year` smallint unsigned NOT NULL,
	`temperature_min_c` decimal(4,1),
	`temperature_max_c` decimal(4,1),
	`temperature_avg_c` decimal(4,1),
	`humidity_min_pct` decimal(4,1),
	`humidity_max_pct` decimal(4,1),
	`humidity_avg_pct` decimal(4,1),
	`pressure_min_hpa` decimal(6,1),
	`pressure_max_hpa` decimal(6,1),
	`pressure_avg_hpa` decimal(6,1),
	`wind_avg_kmh` decimal(5,1),
	`wind_max_kmh` decimal(5,1),
	`wind_gust_max_kmh` decimal(5,1),
	`rain_total_mm` decimal(8,2),
	`rain_rate_max_mm_h` decimal(6,2),
	`uv_max` decimal(3,1),
	`solar_radiation_max_wm2` decimal(6,1),
	`observation_count` int unsigned NOT NULL DEFAULT 0,
	`expected_observation_count` int unsigned,
	`coverage_pct` decimal(5,2),
	`created_at` timestamp(3) NOT NULL DEFAULT (now(3)),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now(3)) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `yearly_weather_summary_id` PRIMARY KEY(`id`),
	CONSTRAINT `yearly_summary_station_year_unique` UNIQUE(`station_id`,`year`)
);
--> statement-breakpoint
ALTER TABLE `daily_weather_summary` ADD CONSTRAINT `daily_weather_summary_station_id_stations_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `monthly_weather_summary` ADD CONSTRAINT `monthly_weather_summary_station_id_stations_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `raw_weather_packets` ADD CONSTRAINT `raw_weather_packets_station_id_stations_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sensor_measurements` ADD CONSTRAINT `sensor_measurements_station_id_stations_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sensor_measurements` ADD CONSTRAINT `sensor_measurements_observation_id_weather_observations_id_fk` FOREIGN KEY (`observation_id`) REFERENCES `weather_observations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weather_observations` ADD CONSTRAINT `weather_observations_station_id_stations_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weather_observations` ADD CONSTRAINT `weather_observations_raw_packet_id_raw_weather_packets_id_fk` FOREIGN KEY (`raw_packet_id`) REFERENCES `raw_weather_packets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `yearly_weather_summary` ADD CONSTRAINT `yearly_weather_summary_station_id_stations_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `raw_packets_station_received_idx` ON `raw_weather_packets` (`station_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `raw_packets_payload_hash_idx` ON `raw_weather_packets` (`payload_hash`);--> statement-breakpoint
CREATE INDEX `sensor_measurements_station_measured_idx` ON `sensor_measurements` (`station_id`,`measured_at`);--> statement-breakpoint
CREATE INDEX `sensor_measurements_type_metric_measured_idx` ON `sensor_measurements` (`sensor_type`,`metric`,`measured_at`);--> statement-breakpoint
CREATE INDEX `observations_station_measured_idx` ON `weather_observations` (`station_id`,`measured_at`);