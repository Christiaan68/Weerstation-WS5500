"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Container } from "@/components/layout/container";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log alleen server-side/console; geen stack trace tonen aan de
    // gebruiker (zie beveiligingsbaseline, punt 31).
    console.error("[app-error]", error);
  }, [error]);

  return (
    <Container className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <AlertTriangle className="text-danger h-10 w-10" aria-hidden="true" />
      <h1 className="text-foreground text-2xl font-semibold tracking-tight">
        Er ging iets mis
      </h1>
      <p className="text-muted-foreground max-w-md text-sm">
        Er is een onverwachte fout opgetreden. Probeer het opnieuw, of ga terug naar het
        dashboard als het probleem blijft bestaan.
      </p>
      <button
        type="button"
        onClick={reset}
        className="bg-primary text-primary-foreground mt-2 inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-colors hover:opacity-90"
      >
        Probeer opnieuw
      </button>
    </Container>
  );
}
