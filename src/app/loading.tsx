import { Loader2 } from "lucide-react";

import { Container } from "@/components/layout/container";

export default function Loading() {
  return (
    <Container className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
      <Loader2
        className="text-muted-foreground h-6 w-6 animate-spin"
        aria-hidden="true"
      />
      <p className="text-muted-foreground text-sm">Bezig met laden…</p>
    </Container>
  );
}
