"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  getStationAdminDataAction,
  type StationAdminData,
} from "@/app/admin/stations/actions";
import { StationAdminClient } from "@/app/admin/stations/station-admin-client";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: StationAdminData };

/**
 * Stationbeheer als venster over de huidige pagina (i.p.v. de vroegere aparte
 * pagina `/admin/stations`). Wordt alleen gemount zolang het venster open is,
 * en haalt de stationgegevens dan pas op via een Server Action.
 *
 * Rendert via een portal naar `document.body`: de sticky header heeft een
 * `backdrop-filter`, en dat maakt van de header het "containing block" voor
 * `position: fixed`-kinderen — zonder portal zou dit venster binnen de
 * header-hoogte vastzitten.
 */
export function StationAdminDialog({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Altijd de nieuwste `onClose`, zonder dat een nieuwe functie-identiteit van
  // de ouder de effecten hieronder opnieuw laat draaien (en bv. de focus
  // terug op de sluitknop zet terwijl iemand in het formulier typt).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Hoogt op om de stationgegevens opnieuw op te halen (na een wijziging of
  // bij "Opnieuw proberen"). De setState-aanroepen staan bewust in de
  // `.then`-callbacks en niet synchroon in de effect-body.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getStationAdminDataAction()
      .then((result) => {
        if (cancelled) return;
        setState(
          result.ok
            ? { status: "ready", data: result.data }
            : { status: "error", message: result.error },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: "error", message: "Laden van de stations is mislukt." });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Escape sluit het venster; de achtergrond scrolt niet mee zolang het open is.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-black/50 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stationbeheer-titel"
        className="border-border bg-background mx-auto my-4 w-full max-w-3xl rounded-lg border shadow-xl sm:my-8"
      >
        <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h2 id="stationbeheer-titel" className="text-foreground text-lg font-semibold">
              Stationbeheer
            </h2>
            <p className="text-muted-foreground text-xs">
              Weerstations toevoegen, bewerken en de standaardweergave instellen.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Sluit stationbeheer"
            className="border-border text-foreground hover:bg-accent hover:text-accent-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-md border"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {state.status === "loading" && (
            <p className="text-muted-foreground py-10 text-center text-sm">Laden…</p>
          )}
          {state.status === "error" && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-danger text-sm" role="alert">
                {state.message}
              </p>
              <button
                type="button"
                onClick={() => {
                  setState({ status: "loading" });
                  setReloadKey((value) => value + 1);
                }}
                className="border-border hover:bg-accent hover:text-accent-foreground rounded-md border px-3 py-1.5 text-xs font-medium"
              >
                Opnieuw proberen
              </button>
            </div>
          )}
          {state.status === "ready" && (
            <StationAdminClient
              stations={state.data.stations}
              capabilitiesByStationId={state.data.capabilitiesByStationId}
              onChanged={() => setReloadKey((value) => value + 1)}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
