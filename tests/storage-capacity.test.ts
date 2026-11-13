import { describe, expect, it } from "vitest";
import { formatStorageBytes, formatStoragePercent } from "@/lib/weather/storage-format";

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

it("formats measured percentages", () => {
  expect(formatStoragePercent(2.775)).toBe("2,78%");
});
