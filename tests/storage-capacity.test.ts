import { describe, expect, it } from "vitest";
import {
  formatStorageBytes,
  formatStoragePercent,
  getStorageCapacity,
  parseStorageLimit,
} from "@/lib/weather/storage-format";

describe("storage capacity", () => {
  it.each([
    undefined,
    "",
    " ",
    "bad",
    "0",
    "-1",
    "1.5",
    "Infinity",
    "1e9",
    "9007199254740992",
  ])("rejects invalid limit %s", (value) => {
    expect(parseStorageLimit(value)).toBeNull();
  });
  it("reads a positive safe integer in bytes", () => {
    expect(parseStorageLimit(" 1000000000 ")).toBe(1000000000);
  });
  it.each([
    [0, 1000, 0],
    [500, 500, 50],
    [1000, 0, 100],
    [1200, 0, 120],
  ])("calculates usage %s", (used, remaining, percent) => {
    expect(getStorageCapacity(used, 1000)).toEqual({
      limitBytes: 1000,
      remainingBytes: remaining,
      percent,
      barPercent: Math.min(100, percent),
      overLimitBytes: Math.max(0, used - 1000),
    });
  });
  it.each([null, 0, -1, NaN, Infinity, 0.5])(
    "rejects unknown/invalid capacity %s",
    (limit) => {
      expect(getStorageCapacity(10, limit)).toBeNull();
    },
  );
  it.each([-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid usage %s",
    (used) => {
      expect(getStorageCapacity(used, 1000)).toBeNull();
    },
  );
  it("calculates the requested decimal GB example", () => {
    const result = getStorageCapacity(27750000, 1000000000)!;
    expect(formatStorageBytes(result.remainingBytes, 2)).toBe("972,25 MB");
    expect(formatStoragePercent(result.percent)).toBe("2,78%");
  });
});
describe("storage formatting boundaries", () => {
  it.each([
    [0, "0,00 B"],
    [1, "1,00 B"],
    [1000, "1,00 KB"],
    [1000000, "1,00 MB"],
    [1000000000, "1,00 GB"],
    [27750000, "27,75 MB"],
    [0.5, "0,50 B"],
  ])("formats %s with two decimals", (bytes, expected) => {
    expect(formatStorageBytes(bytes, 2)).toBe(expected);
  });
  it.each([-1, NaN, Infinity])("hides invalid size %s", (bytes) => {
    expect(formatStorageBytes(bytes)).toBe("—");
  });
});
