/** Synthetic, sanitized reconstruction of the reported 122-row Aiven shape.
 * Not a captured live response: column names, dates and values are fictitious.
 */
export function aivenDiskFixture() {
  return {
    metrics: {
      disk_usage: {
        data: {
          cols: [
            { type: "datetime", label: "Time" },
            { type: "number", label: "node-1" },
          ],
          rows: [
            [{ v: "Time" }, { v: "node-1" }],
            ...Array.from({ length: 121 }, (_, i) => {
              const date = new Date(Date.parse("2026-11-12T08:59:00Z") + i * 30_000);
              return [
                {
                  v: `Date(2026,10,12,${date.getUTCHours()},${date.getUTCMinutes()},${date.getUTCSeconds()})`,
                },
                { v: 38 + i / 100 },
              ];
            }),
          ],
        },
      },
    },
  };
}
