# Ecowitt-veldreferentie

Overzicht van alle payload-velden die de parser
(`src/lib/weather/ecowitt/fields.ts` en `.../parse.ts`) op dit moment
herkent, plus de werkwijze om nieuwe velden toe te voegen zodra die uit
echte WS5500-data blijken. Dit document is een leesbare spiegel van
`fields.ts` — bij twijfel is de code de bron van waarheid.

**Achtergrond:** we hebben geen toegang tot een echt WS5500-station, dus
onderstaande lijst is samengesteld uit de publieke Ecowitt-protocol-
documentatie, Home Assistant's Ecowitt-integratie en het open-source
`ecowitt2mqtt`-project. Elk veld dat een echte upload wél stuurt maar dat
hieronder ontbreekt, gaat **niet verloren** — het wordt opgeslagen in
`raw_weather_packets.raw_payload` (het volledige, ruwe pakket) én apart
gerapporteerd via `unknownFields`, zichtbaar op `/station/diagnostics` en
via `npm run weather:unknown-fields`.

## Metadata (geen meetwaarde)

Deze velden worden herkend maar leveren zelf geen observatie of
sensormeting op — ze tellen puur mee als "wel herkend, dus niet onbekend".

| Veld                              | Betekenis                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `PASSKEY`                         | Unieke identifier van het station (Ecowitt "Customized"-protocol) — zie `docs/WS5500_SETUP.md`. |
| `stationtype`                     | Firmware-/apparaattype-string.                                                                  |
| `model`                           | Apparaatmodel.                                                                                  |
| `freq`                            | Radiofrequentie van de sensoren (bv. `868M`).                                                   |
| `dateutc`                         | Tijdstip van de meting in UTC (`YYYY-MM-DD HH:MM:SS`, of `now`).                                |
| `runtime`                         | Bedrijfstijd van het station in seconden.                                                       |
| `heap`                            | Vrij geheugen van het station (diagnostisch, firmware-intern).                                  |
| `interval`                        | Ingesteld uploadinterval in seconden.                                                           |
| `ID`                              | Station-identifier (legacy Wunderground-protocol, komt overeen met `PASSKEY`).                  |
| `PASSWORD`                        | Wachtwoord (legacy Wunderground-protocol).                                                      |
| `action`                          | Altijd `updateraw` (legacy Wunderground-protocol).                                              |
| `realtime`, `rtfreq`              | Realtime-modusvlaggen (legacy Wunderground-protocol).                                           |
| `softwaretype`                    | Firmwarenaam/-versie (legacy Wunderground-protocol).                                            |
| `weather`, `clouds`, `visibility` | Optionele, zelden gebruikte Wunderground-velden — geen bruikbare WS5500-meting.                 |
| `indoortempf`                     | Wunderground-variant van `tempinf` (zelden gebruikt door de WS5500).                            |

## Hoofdmeting: direct naar `weather_observations`

Onderstaande velden worden (na Fahrenheit/inch/mph → Celsius/mm/km/h-
conversie waar van toepassing) rechtstreeks opgeslagen in een kolom van
`weather_observations`. Plausibiliteitsbereik = de grenzen waarbinnen een
waarde als betrouwbaar geldt; erbuiten wordt het veld overgeslagen (met
waarschuwing), niet de hele payload.

| Veld             | Betekenis                                                            | Eenheid (brontaal) | Plausibiliteitsbereik |
| ---------------- | -------------------------------------------------------------------- | ------------------ | --------------------- |
| `tempinf`        | Binnentemperatuur                                                    | °F                 | −20 … 140             |
| `humidityin`     | Binnenluchtvochtigheid                                               | %                  | 0 … 100               |
| `baromrelin`     | Relatieve luchtdruk                                                  | inHg               | 15 … 35               |
| `baromabsin`     | Absolute luchtdruk                                                   | inHg               | 15 … 35               |
| `tempf`          | Buitentemperatuur                                                    | °F                 | −60 … 160             |
| `humidity`       | Buitenluchtvochtigheid                                               | %                  | 0 … 100               |
| `winddir`        | Windrichting                                                         | °                  | −360 … 720            |
| `windspeedmph`   | Windsnelheid                                                         | mph                | 0 … 200               |
| `windgustmph`    | Windvlaag                                                            | mph                | 0 … 200               |
| `maxdailygust`   | Hoogste windvlaag van de dag                                         | mph                | 0 … 200               |
| `rainratein`     | Regenintensiteit                                                     | inch/u             | 0 … 20                |
| `eventrainin`    | Regen deze bui                                                       | inch               | 0 … 50                |
| `hourlyrainin`   | Regen dit uur                                                        | inch               | 0 … 20                |
| `dailyrainin`    | Regen vandaag                                                        | inch               | 0 … 50                |
| `weeklyrainin`   | Regen deze week                                                      | inch               | 0 … 100               |
| `monthlyrainin`  | Regen deze maand                                                     | inch               | 0 … 200               |
| `yearlyrainin`   | Regen dit jaar                                                       | inch               | 0 … 400               |
| `totalrainin`    | Regen totaal (sinds reset)                                           | inch               | 0 … 4000              |
| `solarradiation` | Zonnestraling                                                        | W/m²               | 0 … 1800              |
| `uv`             | UV-index                                                             | index              | 0 … 16                |
| `dewptf`         | Dauwpunt (indien door het station zelf berekend)                     | °F                 | −60 … 160             |
| `windchillf`     | Gevoelstemperatuur door wind (indien door het station zelf berekend) | °F                 | −80 … 160             |
| `heatindexf`     | Hitte-index (indien door het station zelf berekend)                  | °F                 | −60 … 200             |
| `feelslikef`     | Gevoelstemperatuur algemeen (indien door het station zelf berekend)  | °F                 | −80 … 200             |

**Aliassen** (legacy Wunderground-namen die op hetzelfde plausibiliteits-
bereik en dezelfde betekenis afbeelden): `rainin` → zoals `hourlyrainin`;
`baromin` → zoals `baromabsin`. De oorspronkelijke veldnaam blijft
zichtbaar in waarschuwingen/diagnostiek; alleen het bereik en de
observatiekolom worden gedeeld.

## Directe extra sensoren (naar `sensor_measurements`, geen vast kanaal)

| Veld                | sensorType | metric                  | Eenheid | Toelichting                                                                     |
| ------------------- | ---------- | ----------------------- | ------- | ------------------------------------------------------------------------------- |
| `maxdailygust`      | `wind`     | `max_daily_gust_kmh`    | km/h    | Zie ook hierboven (telt hier als extra sensormeting, niet als observatiekolom). |
| `winddir_avg10m`    | `wind`     | `avg_10m_direction_deg` | °       | 10-minutengemiddelde windrichting.                                              |
| `windspdmph_avg10m` | `wind`     | `avg_10m_speed_kmh`     | km/h    | 10-minutengemiddelde windsnelheid.                                              |

## Batterijvelden — booleaans (0 = ok, 1 = laag)

| Veld       | Sensor                                                      |
| ---------- | ----------------------------------------------------------- |
| `wh65batt` | Buiten-sensorarray (WH65, de standaard WS5500-buitenmodule) |
| `wh25batt` | Binnenconsole/-sensor (WH25)                                |
| `wh26batt` | Buiten temperatuur/vocht (WH26)                             |
| `wh57batt` | Bliksemdetector (WH57)                                      |
| `co2_batt` | CO₂-sensor                                                  |

**Onzekerheid:** welke batterijconventie (booleaans 0/1, of een
spanningswaarde) een specifieke WS5500-uitvoering daadwerkelijk stuurt voor
`wh65batt` staat pas vast na een echte payload. Blijkt het een spanning te
zijn in plaats van 0/1, dan geeft de huidige parser een (onschadelijke)
verkeerde interpretatie van "ok"/"laag" — zie de aandachtspunten in
`docs/WS5500_INGESTION.md` §Onzekerheden. Dit is dan met één regel te
herstellen door het veld te verplaatsen van `BOOLEAN_BATTERY_FIELDS` naar
een numerieke spanningsregistratie zoals bij `soilbatt{n}` hieronder.

## Kanaalgebonden velden (patroon met kanaalnummer 1–8, of 1–4 voor lek/PM2.5)

| Patroon              | sensorType                | metric                       | Eenheid | Sensor (Ecowitt-typenummer)    |
| -------------------- | ------------------------- | ---------------------------- | ------- | ------------------------------ |
| `temp{n}f`           | `extra_temperature`       | `temperature_c`              | °C      | WH31/WH32 extra temperatuur    |
| `humidity{n}`        | `extra_humidity`          | `humidity_pct`               | %       | WH31/WH32 extra vocht          |
| `batt{n}`            | `extra_temperature`       | `battery_state`              | ok/laag | WH31/WH32 batterij             |
| `soilmoisture{n}`    | `soil_moisture`           | `moisture_pct`               | %       | WH51 bodemvocht                |
| `soilbatt{n}`        | `soil_moisture`           | `battery_voltage`            | V       | WH51 batterijspanning          |
| `tf_ch{n}`           | `extra_temperature_probe` | `temperature_c`              | °C      | WH34 kabelsensor               |
| `tf_batt{n}`         | `extra_temperature_probe` | `battery_voltage`            | V       | WH34 batterijspanning          |
| `leafwetness_ch{n}`  | `leaf_wetness`            | `wetness_pct`                | %       | WH35 bladvocht                 |
| `leaf_batt{n}`       | `leaf_wetness`            | `battery_voltage`            | V       | WH35 batterijspanning          |
| `leak_ch{n}`         | `water_leak`              | `leak_detected`              | —       | WH55 waterlekkage (1–4)        |
| `leakbatt{n}`        | `water_leak`              | `battery_state`              | ok/laag | WH55 batterij (1–4)            |
| `pm25_ch{n}`         | `pm25`                    | `concentration_ugm3`         | µg/m³   | WH41/WH43 fijnstof (1–4)       |
| `pm25_avg_24h_ch{n}` | `pm25`                    | `concentration_24h_avg_ugm3` | µg/m³   | WH41/WH43 24u-gemiddelde (1–4) |
| `pm25batt{n}`        | `pm25`                    | `battery_state`              | ok/laag | WH41/WH43 batterij (1–4)       |

## Overige, niet-kanaalgebonden sensoren

| Veld             | sensorType  | metric                      | Eenheid        |
| ---------------- | ----------- | --------------------------- | -------------- |
| `co2`            | `co2`       | `concentration_ppm`         | ppm            |
| `co2_24h`        | `co2`       | `concentration_24h_avg_ppm` | ppm            |
| `lightning_num`  | `lightning` | `strike_count`              | —              |
| `lightning`      | `lightning` | `distance_km`               | km             |
| `lightning_time` | `lightning` | `last_strike_at`            | ISO 8601-tekst |

`lightning_time` is een uitzondering op de rest van deze tabel: de ruwe
waarde is Unix-epoch-seconden, maar die passen niet in de gedeelde
`value_numeric`-kolom (`decimal(12,4)`, max. 8 cijfers vóór de komma — een
epoch-tijdstip heeft er 10). De parser zet deze waarde daarom om naar een
leesbare ISO 8601-tekst en slaat die op in `value_text` in plaats van
`value_numeric` (zie `epochSecondsAsIsoText` in `fields.ts`). Dit is de
enige velden waarvoor dat geldt; kom je in een echte payload een ander
epoch-tijdstip-veld tegen, gebruik dan dezelfde aanpak.

De WS5500 in zijn standaarduitvoering (alleen de meegeleverde buiten-array
WH65/WH69) stuurt waarschijnlijk **geen** van de kanaalgebonden of
CO₂/bliksem-velden — die zijn alleen relevant als er losse Ecowitt-
sensoren zijn bijgekocht. Ze staan er nu al in zodat ze niet als "onbekend"
verschijnen mocht dat wél het geval zijn.

## Een nieuw veld toevoegen (workflow na een echte upload)

1. **Waar:** terminal, projectmap.
2. **Wat:**
   ```powershell
   npm run weather:unknown-fields
   ```
   Dit toont elk veld dat recent niet herkend werd, met hoe vaak het
   voorkwam en een voorbeeldwaarde.
3. **Waar:** `src/lib/weather/ecowitt/fields.ts`.
4. **Wat:** bepaal het type veld en voeg het toe aan de juiste plek:
   - Puur informatief, geen meetwaarde → `METADATA_FIELDS`.
   - Hoofdmeting die in een vaste kolom past → `DIRECT_OBSERVATION_FIELDS`
     én een regel in `PLAUSIBLE_RANGES`, én een mapping in
     `buildObservationRow` in `src/lib/weather/normalize.ts`.
   - Hoofdmeting zonder eigen kolom (zoals `maxdailygust`) →
     `EXTRA_SENSOR_DIRECT_FIELDS`.
   - Kanaalgebonden (bevat een kanaalnummer) → een nieuw item in
     `CHANNEL_FIELD_PATTERNS`.
   - Overig, ongebonden sensorveld → `MISC_SENSOR_FIELDS`.
5. **Controle:** voeg (indien zinvol) een testfixture of testgeval toe in
   `tests/weather-parse.test.ts`, draai `npm test`, en herverwerk eerder
   ontvangen pakketten met dat veld:
   ```powershell
   npm run weather:reprocess -- <pakket-id>
   ```
   Het pakket moet daarna op `normalized` staan (of, als er nog andere
   onbekende velden overblijven, alsnog `partial`) en het veld verschijnt
   niet meer in `unknownFields`.
