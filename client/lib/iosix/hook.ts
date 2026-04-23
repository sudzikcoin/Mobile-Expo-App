import { useEffect, useState } from "react";
import { getIOSiXService, ServiceSnapshot } from "./service";
import { emptyIOSiXData } from "./types";

export interface UseIOSiXTelemetryResult {
  telemetry: ServiceSnapshot["telemetry"];
  connected: boolean;
  scanning: boolean;
  status: ServiceSnapshot["status"];
  error: string | null;
  signalDbm: number | null;
}

export function useIOSiXTelemetry(enabled: boolean = true): UseIOSiXTelemetryResult {
  const [snap, setSnap] = useState<ServiceSnapshot>({
    status: "idle",
    telemetry: emptyIOSiXData(),
    error: null,
    lastRssi: null,
  });

  useEffect(() => {
    if (!enabled) return;
    const svc = getIOSiXService();
    const unsub = svc.subscribe(setSnap);
    svc.start().catch(() => {});
    return () => {
      unsub();
    };
  }, [enabled]);

  return {
    telemetry: snap.telemetry,
    connected: snap.status === "connected",
    scanning: snap.status === "scanning" || snap.status === "connecting",
    status: snap.status,
    error: snap.error,
    signalDbm: snap.lastRssi,
  };
}
