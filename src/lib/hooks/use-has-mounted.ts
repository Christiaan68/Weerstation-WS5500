import { useSyncExternalStore } from "react";

function subscribe() {
  // Er is niets om te abonneren op; deze store verandert nooit na de
  // initiële client-render. `useSyncExternalStore` is hier puur een manier
  // om server- en client-render bewust te laten verschillen zonder een
  // `useEffect` + `setState` (wat React 19's lint-regels afraden).
  return () => {};
}

/**
 * Geeft `false` terug tijdens server-rendering én tijdens de eerste
 * client-render (zodat de HTML overeenkomt, geen hydration-mismatch), en
 * daarna `true`. Handig voor UI die afhankelijk is van client-only state
 * zoals het actieve thema.
 */
export function useHasMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
