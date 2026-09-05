CREATE INDEX `observations_station_temp_idx` ON `weather_observations` (`station_id`,`temperature_outdoor_c`);--> statement-breakpoint
CREATE INDEX `observations_station_wind_gust_idx` ON `weather_observations` (`station_id`,`wind_gust_kmh`);--> statement-breakpoint
CREATE INDEX `observations_station_wind_speed_idx` ON `weather_observations` (`station_id`,`wind_speed_kmh`);--> statement-breakpoint
CREATE INDEX `observations_station_rain_rate_idx` ON `weather_observations` (`station_id`,`rain_rate_mm_h`);--> statement-breakpoint
CREATE INDEX `observations_station_pressure_idx` ON `weather_observations` (`station_id`,`pressure_relative_hpa`);--> statement-breakpoint
CREATE INDEX `observations_station_humidity_idx` ON `weather_observations` (`station_id`,`humidity_outdoor_pct`);