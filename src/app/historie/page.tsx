import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Historie",
  description: "Historische weergegevens van het weerstation.",
};

export default function HistoriePage() {
  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Historie"
        description="Blader terug door eerdere metingen van het weerstation."
      />
      <ComingSoon text="Historische overzichten met filters per dag, maand en jaar volgen in een latere fase. De database is hier al op voorbereid (dag-, maand- en jaartabellen)." />
    </Container>
  );
}
