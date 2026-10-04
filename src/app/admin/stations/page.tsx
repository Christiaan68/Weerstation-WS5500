import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Oude locatie van het stationbeheer. Het beheer staat nu op het tabblad
 * Beheer van de pagina Stations; deze redirect houdt bestaande bladwijzers
 * werkend.
 */
export default function AdminStationsPage(): never {
  redirect("/station/beheer");
}
