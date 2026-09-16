import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasValidSession } from "@/lib/auth/session-cookie";
import { publicEnv } from "@/lib/env";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Inloggen",
  description: "Log in om het weerstationdashboard te bekijken.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function safeNextPath(next: string | undefined): string | undefined {
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return undefined;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = safeNextPath(next);

  // Al ingelogd (bv. link uit een bladwijzer of een tweede tabblad) —
  // meteen doorsturen i.p.v. het inlogformulier nog eens te tonen.
  if (await hasValidSession()) {
    redirect(safeNext ?? "/dashboard");
  }

  return (
    <Container className="flex flex-1 items-center justify-center py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-foreground text-lg font-semibold">
            Inloggen — {publicEnv.NEXT_PUBLIC_STATION_NAME}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <LoginForm next={safeNext} />
        </CardContent>
      </Card>
    </Container>
  );
}
