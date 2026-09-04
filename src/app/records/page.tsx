import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Records",
  description: "Records van het weerstation, bv. hoogste temperatuur.",
};

export default function RecordsPage() {
  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Records"
        description="Hoogste en laagste waarden sinds de start van dit station."
      />
      <ComingSoon text="Recordberekeningen (bv. hoogste temperatuur, meeste regen op één dag) volgen in een latere fase, zodra er voldoende historische data is." />
    </Container>
  );
}
