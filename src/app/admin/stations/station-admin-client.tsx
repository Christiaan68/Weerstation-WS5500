"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Station } from "@/lib/db/schema";
import type { StationCapabilities } from "@/lib/weather/capabilities";

import { setDefaultStationAction, toggleActiveAction } from "./actions";
import { StationForm, type StationFormValues } from "./station-form";

const CAPABILITY_LABELS: { key: keyof StationCapabilities; label: string }[] = [
  { key: "hasOutdoorTemperature", label: "Buitentemp." },
  { key: "hasIndoorTemperature", label: "Binnentemp." },
  { key: "hasWind", label: "Wind" },
  { key: "hasRain", label: "Regen" },
  { key: "hasUV", label: "UV" },
  { key: "hasSolar", label: "Zon" },
  { key: "hasPressure", label: "Luchtdruk" },
  { key: "hasLightning", label: "Bliksem" },
  { key: "hasSoilMoisture", label: "Bodemvocht" },
  { key: "hasLeafWetness", label: "Bladvocht" },
  { key: "hasAirQuality", label: "Luchtkwaliteit" },
  { key: "hasWaterLeak", label: "Waterlek" },
];

function CapabilitySummary({ capabilities }: { capabilities: StationCapabilities }) {
  const present = CAPABILITY_LABELS.filter(({ key }) => capabilities[key] === true);

  if (present.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        Nog geen sensoren gedetecteerd — verschijnt zodra dit station data heeft gestuurd.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {present.map(({ key, label }) => (
        <Badge key={key} variant="primary">
          {label}
        </Badge>
      ))}
      {capabilities.extraSensorTypes.length > 0 && (
        <Badge variant="default">+{capabilities.extraSensorTypes.length} overig</Badge>
      )}
    </div>
  );
}

function stationToFormValues(station: Station): StationFormValues {
  return {
    displayName: station.displayName,
    locationDescription: station.locationDescription ?? "",
    timezone: station.timezone,
    stationIdentifier: station.stationIdentifier,
    macAddress: station.macAddress ?? "",
    ecowittApplicationKey: station.ecowittApplicationKey ?? "",
    ecowittApiKey: station.ecowittApiKey ?? "",
    expectedUploadIntervalSeconds: String(station.expectedUploadIntervalSeconds),
  };
}

function StationRow({
  station,
  capabilities,
  adminKey,
  onChanged,
}: {
  station: Station;
  capabilities: StationCapabilities;
  adminKey: string;
  onChanged: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<string | undefined>(undefined);

  function handleSetDefault() {
    setRowError(undefined);
    startTransition(async () => {
      const result = await setDefaultStationAction(adminKey, station.id);
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      onChanged();
    });
  }

  function handleToggleActive() {
    setRowError(undefined);
    startTransition(async () => {
      const result = await toggleActiveAction(adminKey, station.id, !station.isActive);
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      onChanged();
    });
  }

  if (isEditing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{station.displayName} bewerken</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <StationForm
            adminKey={adminKey}
            mode="edit"
            stationId={station.id}
            initialValues={stationToFormValues(station)}
            onDone={() => {
              setIsEditing(false);
              onChanged();
            }}
            onCancel={() => setIsEditing(false)}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-foreground text-base font-semibold">{station.displayName}</h3>
              <Badge variant={station.isActive ? "success" : "default"}>
                {station.isActive ? "Actief" : "Inactief"}
              </Badge>
              {station.isDefault && <Badge variant="primary">Standaard</Badge>}
              {station.ecowittApplicationKey && (
                <Badge variant="default">Eigen Ecowitt-account</Badge>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              slug: {station.slug} · {station.manufacturer} {station.model} ·{" "}
              {station.timezone}
            </p>
            <p className="text-muted-foreground text-xs">
              Identifier: {station.stationIdentifier}
              {station.macAddress && ` · MAC: ${station.macAddress}`}
              {station.locationDescription && ` · ${station.locationDescription}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="border-border hover:bg-accent hover:text-accent-foreground rounded-md border px-3 py-1.5 text-xs font-medium"
            >
              Bewerken
            </button>
            {!station.isDefault && (
              <button
                type="button"
                onClick={handleSetDefault}
                disabled={isPending}
                className="border-border hover:bg-accent hover:text-accent-foreground rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-60"
              >
                Als standaard instellen
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleActive}
              disabled={isPending || (station.isDefault && station.isActive)}
              title={
                station.isDefault && station.isActive
                  ? "Het standaardstation kan niet gedeactiveerd worden"
                  : undefined
              }
              className="border-border hover:bg-accent hover:text-accent-foreground rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              {station.isActive ? "Deactiveren" : "Activeren"}
            </button>
          </div>
        </div>

        <CapabilitySummary capabilities={capabilities} />

        {rowError && <p className="text-danger text-xs">{rowError}</p>}
      </CardContent>
    </Card>
  );
}

export function StationAdminClient({
  adminKey,
  stations,
  capabilitiesByStationId,
}: {
  adminKey: string;
  stations: Station[];
  capabilitiesByStationId: Record<number, StationCapabilities>;
}) {
  const [isAdding, setIsAdding] = useState(false);
  // Server Actions herberekenen de RSC-payload al via `revalidatePath()`
  // (zie actions.ts) — deze `refreshKey` dwingt alleen de lokale client-state
  // van dit component (bv. het inklappen van het toevoegformulier) mee te
  // resetten na een geslaagde actie.
  const [refreshKey, setRefreshKey] = useState(0);

  function handleChanged() {
    setRefreshKey((value) => value + 1);
  }

  return (
    <div className="flex flex-col gap-6" key={refreshKey}>
      <div className="flex flex-col gap-4">
        {stations.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-muted-foreground text-sm">
                Nog geen stations geconfigureerd. Voeg het eerste station hieronder toe.
              </p>
            </CardContent>
          </Card>
        ) : (
          stations.map((station) => (
            <StationRow
              key={station.id}
              station={station}
              capabilities={
                capabilitiesByStationId[station.id] ?? {
                  hasOutdoorTemperature: false,
                  hasIndoorTemperature: false,
                  hasHumidityOutdoor: false,
                  hasHumidityIndoor: false,
                  hasWind: false,
                  hasRain: false,
                  hasUV: false,
                  hasSolar: false,
                  hasPressure: false,
                  hasLightning: false,
                  hasSoilMoisture: false,
                  hasLeafWetness: false,
                  hasAirQuality: false,
                  hasWaterLeak: false,
                  extraSensorTypes: [],
                }
              }
              adminKey={adminKey}
              onChanged={handleChanged}
            />
          ))
        )}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Nieuw station toevoegen</CardTitle>
          {!isAdding && (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-xs font-medium"
            >
              + Station toevoegen
            </button>
          )}
        </CardHeader>
        {isAdding && (
          <CardContent className="pt-0">
            <StationForm
              adminKey={adminKey}
              mode="create"
              onDone={() => {
                setIsAdding(false);
                handleChanged();
              }}
              onCancel={() => setIsAdding(false)}
            />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
