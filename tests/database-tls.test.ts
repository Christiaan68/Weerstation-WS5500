import { describe, expect, it } from "vitest";

import { getDatabaseTlsOptions } from "@/lib/db/tls";

describe("database TLS", () => {
  it("blijft certificaten controleren met de standaard trust store voor TiDB", () => {
    const options = getDatabaseTlsOptions();
    expect(options.rejectUnauthorized).toBe(true);
    expect(options.minVersion).toBe("TLSv1.2");
    expect(options.ca).toBeUndefined();
  });

  it("ondersteunt een PEM-bundel met letterlijke regeleinden uit Vercel", () => {
    const bundle =
      "-----BEGIN CERTIFICATE-----\nfirst\n-----END CERTIFICATE-----\n" +
      "-----BEGIN CERTIFICATE-----\nsecond\n-----END CERTIFICATE-----";
    const options = getDatabaseTlsOptions(bundle.replace(/\n/g, "\\n"));
    expect(options.ca).toBe(bundle);
    expect(options.rejectUnauthorized).toBe(true);
  });

  it("accepteert echte regeleinden en laat een lege CA de systeemcertificaten gebruiken", () => {
    expect(getDatabaseTlsOptions("  PEM\nCONTENTS\n ").ca).toBe("PEM\nCONTENTS");
    expect(getDatabaseTlsOptions(" \n ").ca).toBeUndefined();
  });
});
