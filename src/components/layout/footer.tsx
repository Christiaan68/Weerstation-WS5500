import { Container } from "@/components/layout/container";
import { publicEnv } from "@/lib/env";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-border bg-background border-t">
      <Container className="text-muted-foreground flex flex-col gap-2 py-6 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {year} {publicEnv.NEXT_PUBLIC_STATION_NAME} · Cloudgebaseerd weerdashboard
        </p>
        <p>Gebouwd met Next.js, TypeScript en TiDB Cloud</p>
      </Container>
    </footer>
  );
}
