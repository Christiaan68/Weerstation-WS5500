"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { hasValidSession } from "@/lib/auth/session-cookie";
import { BASE_PATH, withBasePath } from "@/lib/base-path";
import { getStation } from "@/lib/db/queries";
import { STATION_PREFERENCE_COOKIE } from "@/lib/station-preference";

export async function selectStation(formData: FormData): Promise<void> {
  if (!(await hasValidSession())) redirect(withBasePath("/login"));
  const slug = formData.get("station");
  if (typeof slug !== "string" || !slug) return;
  const station = await getStation(slug);
  if (!station?.isActive) return;

  (await cookies()).set(STATION_PREFERENCE_COOKIE, station.slug, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: BASE_PATH || "/",
  });
  redirect(withBasePath(`/station?station=${encodeURIComponent(station.slug)}`));
}
