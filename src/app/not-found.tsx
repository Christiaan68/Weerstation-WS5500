import { CompassIcon } from "lucide-react";
import Link from "next/link";

import { Container } from "@/components/layout/container";

export default function NotFound() {
  return (
    <Container className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <CompassIcon className="text-muted-foreground h-10 w-10" aria-hidden="true" />
      <h1 className="text-foreground text-2xl font-semibold tracking-tight">
        Pagina niet gevonden
      </h1>
      <p className="text-muted-foreground max-w-md text-sm">
        De pagina die je zoekt bestaat niet (meer). Controleer de link of ga terug naar
        het dashboard.
      </p>
      <Link
        href="/"
        className="bg-primary text-primary-foreground mt-2 inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-colors hover:opacity-90"
      >
        Terug naar de homepage
      </Link>
    </Container>
  );
}
