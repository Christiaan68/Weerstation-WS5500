import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Regen",
  description: "Neerslaggegevens van het weerstation.",
};

export default function RegenPage() {
  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader title="Regen" description="Neerslag per uur, dag, maand en jaar." />
      <ComingSoon text="Uitgebreide regenanalyse volgt in een latere fase. De genormaliseerde metingen bevatten al regen per uur, dag, week, maand en jaar." />
    </Container>
  );
}
