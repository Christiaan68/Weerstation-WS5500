import { expect, it } from "vitest";
import { parseSqlStorageBytes } from "@/lib/db/storage-metadata";

it.each([null, undefined, "", " ", "bad", "1e3", true, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects unusable metadata %s", (value) => {
  expect(parseSqlStorageBytes(value)).toBeNull();
});
it.each([0, 42, "0", "42", " 42 "])("accepts SQL byte count %s", (value) => {
  expect(parseSqlStorageBytes(value)).toBe(Number(value));
});
