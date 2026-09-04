import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Grafieken",
  description: "Grafieken van temperatuur, luchtdruk, wind en meer.",
};

export default function GrafiekenPage() {
  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Grafieken"
        description="Verloop van temperatuur, luchtdruk, wind en meer over tijd."
      />
      <ComingSoon text="Interactieve grafieken volgen in een latere fase, zodra er echte metingen binnenkomen." />
    </Container>
  );
}
