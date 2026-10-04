import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Stationbeheer is geen aparte pagina meer: het opent als venster vanuit het
 * hamburgermenu (zie src/components/layout/station-admin-dialog.tsx). Deze
 * route blijft alleen bestaan zodat een oude bladwijzer niet op een 404
 * uitkomt.
 */
export default function AdminStationsPage(): never {
  redirect("/dashboard");
}
