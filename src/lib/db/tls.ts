/** Vertrouw de CA van de databaseprovider zonder TLS-controle uit te zetten. */
export function getDatabaseTlsOptions(certificate?: string) {
  const ca = certificate?.replace(/\\n/g, "\n").trim();
  return {
    minVersion: "TLSv1.2" as const,
    rejectUnauthorized: true,
    ...(ca ? { ca } : {}),
  };
}
