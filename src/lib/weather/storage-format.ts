/** Decimal storage units: 1 KB = 1000 bytes. */
export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent =
    bytes === 0 ? 0 : Math.min(Math.floor(Math.log10(bytes) / 3), units.length - 1);
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(bytes / 1000 ** exponent)} ${units[exponent]}`;
}
