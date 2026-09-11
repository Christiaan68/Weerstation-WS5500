"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  createStationAction,
  testEcowittConnectionAction,
  updateStationAction,
  type ActionResult,
} from "./actions";

/** Kleine, veelgebruikte selectie IANA-tijdzones — vrije tekstinvoer blijft mogelijk (datalist, geen dwingende dropdown). */
const COMMON_TIME_ZONES = [
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Lisbon",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Bucharest",
  "Europe/Moscow",
  "Atlantic/Azores",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

export interface StationFormValues {
  displayName: string;
  locationDescription: string;
  timezone: string;
  stationIdentifier: string;
  macAddress: string;
  /** Fase 6 — eigen Ecowitt-sleutels; leeg = gedeelde sleutel van dit project. */
  ecowittApplicationKey: string;
  ecowittApiKey: string;
  expectedUploadIntervalSeconds: string;
}

const EMPTY_VALUES: StationFormValues = {
  displayName: "",
  locationDescription: "",
  timezone: "Europe/Amsterdam",
  stationIdentifier: "",
  macAddress: "",
  ecowittApplicationKey: "",
  ecowittApiKey: "",
  expectedUploadIntervalSeconds: "300",
};

function Field({
  label,
  htmlFor,
  error,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-foreground text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-muted-foreground text-xs">{hint}</p>}
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  );
}

const inputClass =
  "border-border bg-background text-foreground focus-visible:outline-primary w-full rounded-md border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1";

export function StationForm({
  adminKey,
  mode,
  stationId,
  initialValues,
  onDone,
  onCancel,
}: {
  adminKey: string;
  mode: "create" | "edit";
  /** Verplicht bij `mode: "edit"`. */
  stationId?: number;
  initialValues?: Partial<StationFormValues>;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<StationFormValues>({
    ...EMPTY_VALUES,
    ...initialValues,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [testState, setTestState] = useState<
    | { status: "idle" }
    | { status: "testing" }
    | { status: "success"; temperatureOutdoorC: number | null; measuredAt: string | null }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [isPending, startTransition] = useTransition();
  const [isTesting, startTestTransition] = useTransition();

  function setField<K extends keyof StationFormValues>(key: K, value: StationFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleTestConnection() {
    if (!values.macAddress.trim()) {
      setTestState({ status: "error", message: "Vul eerst een MAC-adres in." });
      return;
    }
    setTestState({ status: "testing" });
    startTestTransition(async () => {
      const result = await testEcowittConnectionAction(
        adminKey,
        values.macAddress,
        values.ecowittApplicationKey,
        values.ecowittApiKey,
      );
      if (!result.ok) {
        setTestState({ status: "error", message: result.error ?? "Verbindingstest mislukt." });
        return;
      }
      setTestState({
        status: "success",
        temperatureOutdoorC: result.preview?.temperatureOutdoorC ?? null,
        measuredAt: result.preview?.measuredAt ?? null,
      });
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    startTransition(async () => {
      const payload = {
        displayName: values.displayName,
        locationDescription: values.locationDescription,
        timezone: values.timezone,
        stationIdentifier: values.stationIdentifier,
        macAddress: values.macAddress,
        ecowittApplicationKey: values.ecowittApplicationKey,
        ecowittApiKey: values.ecowittApiKey,
        expectedUploadIntervalSeconds: values.expectedUploadIntervalSeconds,
      };

      const result: ActionResult =
        mode === "create"
          ? await createStationAction(adminKey, payload)
          : await updateStationAction(adminKey, stationId!, payload);

      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {formError && (
        <p className="border-danger/30 bg-danger/10 text-danger rounded-md border px-3 py-2 text-sm">
          {formError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Naam" htmlFor="displayName" error={fieldErrors.displayName}>
          <input
            id="displayName"
            className={inputClass}
            value={values.displayName}
            onChange={(e) => setField("displayName", e.target.value)}
            placeholder="Bijv. Achtertuin"
            required
          />
        </Field>

        <Field
          label="Locatieomschrijving"
          htmlFor="locationDescription"
          error={fieldErrors.locationDescription}
          hint="Optioneel — bijv. 'Achtertuin, bij de schutting'."
        >
          <input
            id="locationDescription"
            className={inputClass}
            value={values.locationDescription}
            onChange={(e) => setField("locationDescription", e.target.value)}
          />
        </Field>

        <Field
          label="Tijdzone"
          htmlFor="timezone"
          error={fieldErrors.timezone}
          hint="IANA-tijdzone, bijv. Europe/Amsterdam."
        >
          <input
            id="timezone"
            className={inputClass}
            list="timezone-options"
            value={values.timezone}
            onChange={(e) => setField("timezone", e.target.value)}
            required
          />
          <datalist id="timezone-options">
            {COMMON_TIME_ZONES.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
        </Field>

        <Field
          label="Verwacht upload-interval"
          htmlFor="expectedUploadIntervalSeconds"
          error={fieldErrors.expectedUploadIntervalSeconds}
          hint="In seconden — hoe vaak het station normaal gesproken data stuurt."
        >
          <input
            id="expectedUploadIntervalSeconds"
            type="number"
            min={30}
            max={3600}
            className={inputClass}
            value={values.expectedUploadIntervalSeconds}
            onChange={(e) => setField("expectedUploadIntervalSeconds", e.target.value)}
            required
          />
        </Field>

        <Field
          label="Identifier (Ecowitt PASSKEY)"
          htmlFor="stationIdentifier"
          error={fieldErrors.stationIdentifier}
          hint="Van het station zelf, of hetzelfde als het MAC-adres."
        >
          <input
            id="stationIdentifier"
            className={inputClass}
            value={values.stationIdentifier}
            onChange={(e) => setField("stationIdentifier", e.target.value)}
            required
          />
        </Field>

        <Field
          label="MAC-adres"
          htmlFor="macAddress"
          error={fieldErrors.macAddress}
          hint="Vorm AA:BB:CC:DD:EE:FF — nodig voor de Ecowitt Cloud-koppeling."
        >
          <input
            id="macAddress"
            className={inputClass}
            value={values.macAddress}
            onChange={(e) => setField("macAddress", e.target.value)}
            placeholder="AA:BB:CC:DD:EE:FF"
          />
        </Field>
      </div>

      <div className="border-border/60 flex flex-col gap-2 border-t pt-4">
        <p className="text-foreground text-sm font-medium">
          Eigen Ecowitt-account (optioneel)
        </p>
        <p className="text-muted-foreground text-xs">
          Alleen invullen als dit station bij een ANDER Ecowitt.net-account hoort dan je overige
          stations. Leeg laten = dit station gebruikt hetzelfde account als de rest. Te vinden op{" "}
          ecowitt.net, ingelogd op het account van dit station: accountpagina → API Keys.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Ecowitt Application Key"
            htmlFor="ecowittApplicationKey"
            error={fieldErrors.ecowittApplicationKey}
          >
            <input
              id="ecowittApplicationKey"
              className={inputClass}
              value={values.ecowittApplicationKey}
              onChange={(e) => setField("ecowittApplicationKey", e.target.value)}
            />
          </Field>
          <Field
            label="Ecowitt API Key"
            htmlFor="ecowittApiKey"
            error={fieldErrors.ecowittApiKey}
          >
            <input
              id="ecowittApiKey"
              className={inputClass}
              value={values.ecowittApiKey}
              onChange={(e) => setField("ecowittApiKey", e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="border-border/60 flex flex-col gap-2 border-t pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="border-border hover:bg-accent hover:text-accent-foreground rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
          >
            {isTesting ? "Verbinding testen…" : "Verbinding testen"}
          </button>
          {testState.status === "success" && (
            <Badge variant="success">
              Gelukt
              {testState.temperatureOutdoorC !== null &&
                ` — ${testState.temperatureOutdoorC}°C ontvangen`}
            </Badge>
          )}
          {testState.status === "error" && (
            <span className="text-danger text-xs">{testState.message}</span>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          Test of de Ecowitt Cloud API data teruggeeft voor dit MAC-adres, vóórdat je opslaat
          (met het hierboven ingevulde eigen account, indien ingevuld) — er wordt niets bewaard
          door deze test.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60",
          )}
        >
          {isPending ? "Opslaan…" : mode === "create" ? "Station toevoegen" : "Wijzigingen opslaan"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Annuleren
          </button>
        )}
      </div>
    </form>
  );
}
