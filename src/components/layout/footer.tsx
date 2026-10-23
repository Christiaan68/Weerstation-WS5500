import { Container } from "@/components/layout/container";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-border bg-background border-t">
      <Container className="text-muted-foreground flex flex-col gap-2 py-6 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>© {year} I.H.C. ten Haaken</p>
      </Container>
    </footer>
  );
}
