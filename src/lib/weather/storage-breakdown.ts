/**
 * Presentation-only reconstruction of the Aiven service disk.
 *
 * Aiven provides the total disk *percentage*. information_schema provides
 * approximate logical table+index bytes, not physical disk usage. We never
 * silently turn one into the other or imply that SQL covers MySQL overhead.
 */
export type StorageSliceKind = "weather" | "other" | "overhead" | "used" | "free";

export type StorageSlice = {
  kind: StorageSliceKind;
  bytes: number;
  percent: number;
};

export type StorageBreakdown = {
  limitBytes: number;
  usedBytes: number;
  freeBytes: number;
  mode: "detailed" | "total";
  slices: StorageSlice[];
  /** Explains why a reliable per-database split is unavailable. */
  detailUnavailableReason: "metadata" | "mismatch" | null;
};

type SqlUsage =
  { status: "ok"; weatherBytes: number; otherBytes: number } | { status: "unavailable" };

function usableBytes(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** Returns null when real, sufficiently recent Aiven capacity/usage is missing. */
export function buildStorageBreakdown(
  limitBytes: number | null,
  diskPercent: number | null,
  sql: SqlUsage,
): StorageBreakdown | null {
  if (
    limitBytes === null ||
    !Number.isSafeInteger(limitBytes) ||
    limitBytes <= 0 ||
    diskPercent === null ||
    !Number.isFinite(diskPercent) ||
    diskPercent < 0 ||
    diskPercent > 100
  )
    return null;

  const usedBytes = (limitBytes * diskPercent) / 100;
  const freeBytes = limitBytes - usedBytes;
  const toSlice = (kind: StorageSliceKind, bytes: number): StorageSlice => ({
    kind,
    bytes,
    percent: (bytes / limitBytes) * 100,
  });
  const totalOnly = (reason: "metadata" | "mismatch"): StorageBreakdown => ({
    limitBytes,
    usedBytes,
    freeBytes,
    mode: "total",
    slices: [toSlice("used", usedBytes), toSlice("free", freeBytes)],
    detailUnavailableReason: reason,
  });

  if (sql.status !== "ok") return totalOnly("metadata");
  const { weatherBytes, otherBytes } = sql;
  if (
    !usableBytes(weatherBytes) ||
    !usableBytes(otherBytes) ||
    !Number.isSafeInteger(weatherBytes + otherBytes) ||
    weatherBytes + otherBytes > usedBytes
  )
    return totalOnly("mismatch");

  const slices = [
    toSlice("weather", weatherBytes),
    toSlice("other", otherBytes),
    toSlice("overhead", usedBytes - weatherBytes - otherBytes),
    toSlice("free", freeBytes),
  ];
  // Assign rounding residual to the last non-zero segment, keeping zero free
  // space truly zero at 100% and the displayed widths summing exactly to 100.
  const last = slices.findLastIndex((slice) => slice.bytes > 0);
  if (last >= 0)
    slices[last].percent =
      100 - slices.slice(0, last).reduce((sum, slice) => sum + slice.percent, 0);
  return {
    limitBytes,
    usedBytes,
    freeBytes,
    mode: "detailed",
    slices,
    detailUnavailableReason: null,
  };
}
