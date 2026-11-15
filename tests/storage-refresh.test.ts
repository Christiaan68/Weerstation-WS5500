import { afterEach, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({
  effect: undefined as undefined | (() => () => void),
  refresh: vi.fn(),
  setClock: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: () => () => void) => {
    harness.effect = effect;
  },
  useState: () => [0, harness.setClock],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: harness.refresh }) }));
import { StorageRefresh } from "@/app/station/beheer/storage-refresh";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("throttles refreshes, pauses hidden/offline polling and expires at the actual deadline", () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const window = new EventTarget();
  const navigator = { onLine: true };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("navigator", navigator);
  StorageRefresh({ children: "measurement", expiresAt: Date.now() + 720_001 });
  const cleanup = harness.effect!();
  window.dispatchEvent(new Event("online"));
  document.dispatchEvent(new Event("visibilitychange"));
  expect(harness.refresh).not.toHaveBeenCalled();
  vi.advanceTimersByTime(300_000);
  expect(harness.refresh).toHaveBeenCalledTimes(1);
  document.visibilityState = "hidden";
  vi.advanceTimersByTime(300_000);
  expect(harness.refresh).toHaveBeenCalledTimes(1);
  document.visibilityState = "visible";
  navigator.onLine = false;
  document.dispatchEvent(new Event("visibilitychange"));
  expect(harness.refresh).toHaveBeenCalledTimes(1);
  navigator.onLine = true;
  window.dispatchEvent(new Event("online"));
  window.dispatchEvent(new Event("online"));
  expect(harness.refresh).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(120_001);
  expect(harness.setClock).toHaveBeenLastCalledWith(1_720_001);
  cleanup();
  vi.advanceTimersByTime(900_000);
  expect(harness.refresh).toHaveBeenCalledTimes(2);
});
