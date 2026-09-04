import { CircleDashed } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/**
 * Duidelijke placeholder voor pagina's waarvan de functionaliteit pas in
 * een latere fase wordt gebouwd (bv. grafieken, historiefilters,
 * recordberekeningen). Zie Fase 1-scope: "Wat je in deze fase NIET moet
 * bouwen".
 */
export function ComingSoon({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <CircleDashed className="text-muted-foreground h-8 w-8" aria-hidden="true" />
        <p className="text-muted-foreground max-w-md text-sm">{text}</p>
      </CardContent>
    </Card>
  );
}
