export const STATION_PREFERENCE_COOKIE = "weather_station";

/** Only page navigation uses the browser preference; explicit links always win. */
export function shouldRestoreStation(pathname: string, params: URLSearchParams): boolean {
  return (
    !params.has("station") &&
    ([
      "/",
      "/dashboard",
      "/data",
      "/grafieken",
      "/regen",
      "/wind",
      "/records",
      "/data-quality",
      "/station",
    ].includes(pathname) ||
      pathname.startsWith("/station/"))
  );
}
