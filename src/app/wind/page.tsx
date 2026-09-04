import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Wind",
  description: "Windsnelheid, windstoten en windrichting.",
};

export default function WindPage() {
  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Wind"
        description="Windsnelheid, windstoten en windrichting van het weerstation."
      />
      <ComingSoon text="Een windroos en gedetailleerde windstatistieken volgen in een latere fase." />
    </Container>
  );
}
