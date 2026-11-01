/** Decimal storage units: 1 KB = 1000 bytes. */
export function formatStorageBytes(bytes: number, minimumFractionDigits = 0): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent =
    bytes === 0
      ? 0
      : Math.max(0, Math.min(Math.floor(Math.log10(bytes) / 3), units.length - 1));
  return `${new Intl.NumberFormat("nl-NL", { minimumFractionDigits, maximumFractionDigits: 2 }).format(bytes / 1000 ** exponent)} ${units[exponent]}`;
}

/** An absent or invalid limit must never imply unlimited or zero capacity. */
export function parseStorageLimit(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null;
}

export function getStorageCapacity(usedBytes: number, limitBytes: number | null) {
  if (
    !Number.isSafeInteger(usedBytes) ||
    usedBytes < 0 ||
    limitBytes === null ||
    !Number.isSafeInteger(limitBytes) ||
    limitBytes <= 0
  )
    return null;
  const percent = (usedBytes / limitBytes) * 100;
  return {
    limitBytes,
    remainingBytes: Math.max(0, limitBytes - usedBytes),
    overLimitBytes: Math.max(0, usedBytes - limitBytes),
    percent,
    barPercent: Math.min(100, percent),
  };
}

export function formatStoragePercent(percent: number): string {
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(percent)}%`;
}
