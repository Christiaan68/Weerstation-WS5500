import { Database } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServiceStorageSummary } from "./service-storage-summary";

/** One clear service-wide overview; no duplicate per-table SQL queries. */
export function DatabaseStorageCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-4 w-4" aria-hidden="true" /> Database-opslag
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ServiceStorageSummary />
      </CardContent>
    </Card>
  );
}
