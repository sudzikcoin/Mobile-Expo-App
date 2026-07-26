// Link-based driver binding.
//
// The universal link https://pingpoint.suverse.io/driver/drv_<token> is the
// canonical onboarding path: the app exchanges the per-load drv_ token for a
// permanent trk_ binding via POST /api/driver/bind and persists the same set
// of keys the legacy Select Company → Select Truck flow wrote, so everything
// downstream (tracking, pings, FCM, active-load polling) works unchanged.
//
// Deferred deep link (app was NOT installed when the link was tapped):
//   1. Android — Play Install Referrer carries `drv_token=<token>` through
//      the store install (primary mechanism).
//   2. Both platforms — POST /api/driver/pending-match: the server matched
//      fingerprint it recorded before redirecting the browser to the store
//      (fallback; one-shot, 30-minute TTL).

import { Platform } from "react-native";
import {
  setTruckToken,
  setTruckId,
  setTruckNumber,
  setCompanyId,
  setCompanyName,
  setDriverName,
  setTruckSetupComplete,
  maskToken,
} from "./storage";
import { getProductionApiUrl } from "./api";

export interface DriverBinding {
  token: string; // trk_ permanent token
  truck_id?: string; // absent in bind responses before 2026-07-26
  driver_name: string | null;
  truck_number: string | null;
  company_id: string;
  company_name: string | null;
  load: unknown | null;
}

export type BindResult =
  | { status: "bound"; binding: DriverBinding }
  | { status: "invalid" } // 404 — rotated/unknown link; do NOT drop current binding
  | { status: "error" }; // network/server hiccup — caller may fall back

export function isDrvToken(t: string | null | undefined): boolean {
  return typeof t === "string" && t.startsWith("drv_");
}

export async function bindDriverToken(drvToken: string): Promise<BindResult> {
  try {
    const res = await fetch(`${getProductionApiUrl()}/api/driver/bind`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: drvToken }),
    });
    if (res.status === 404 || res.status === 400) {
      console.warn("[Binding] drv token rejected:", maskToken(drvToken), res.status);
      return { status: "invalid" };
    }
    if (!res.ok) {
      console.warn("[Binding] bind failed with status", res.status);
      return { status: "error" };
    }
    const binding = (await res.json()) as DriverBinding;
    if (!binding?.token?.startsWith("trk_")) {
      console.warn("[Binding] unexpected bind response shape");
      return { status: "error" };
    }
    return { status: "bound", binding };
  } catch (e) {
    console.warn("[Binding] bind request error:", e);
    return { status: "error" };
  }
}

// Persist the binding exactly like the legacy confirm step did.
export async function persistBinding(binding: DriverBinding): Promise<void> {
  await setTruckToken(binding.token);
  // Older servers omitted truck_id from the bind response (bound-but-silent
  // bug) — never persist "undefined"; tracking falls back gracefully.
  if (binding.truck_id) {
    await setTruckId(binding.truck_id);
  } else {
    console.warn("[Binding] bind response missing truck_id — tracking will use a fallback id");
  }
  await setTruckNumber(binding.truck_number ?? "");
  await setCompanyId(binding.company_id);
  await setCompanyName(binding.company_name ?? "");
  await setDriverName(binding.driver_name ?? "");
  await setTruckSetupComplete(true);
  console.log(
    "[Binding] persisted trk binding:",
    maskToken(binding.token),
    "truck:",
    binding.truck_number || "<none>",
  );
}

function deviceLanguage(): string | null {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return locale ? locale.toLowerCase() : null;
  } catch {
    return null;
  }
}

// Android install referrer → drv token, or null. Never throws.
async function tokenFromInstallReferrer(): Promise<string | null> {
  if (Platform.OS !== "android") return null;
  try {
    const { PlayInstallReferrer } = require("react-native-play-install-referrer");
    const referrer: string | null = await new Promise((resolve) => {
      // The library never times out on its own; don't let a hung Play Store
      // connection block first launch.
      const timer = setTimeout(() => resolve(null), 8000);
      PlayInstallReferrer.getInstallReferrerInfo(
        (info: { installReferrer?: string } | null, error: unknown) => {
          clearTimeout(timer);
          if (error || !info?.installReferrer) resolve(null);
          else resolve(info.installReferrer);
        },
      );
    });
    if (!referrer) return null;
    // Play delivers the referrer decoded ("drv_token=drv_x"), but be lenient
    // about an extra encoding layer.
    const decoded = (() => {
      try {
        return decodeURIComponent(referrer);
      } catch {
        return referrer;
      }
    })();
    const m = decoded.match(/drv_token=(drv_[A-Za-z0-9]+)/);
    if (m) {
      console.log("[Binding] drv token from install referrer:", maskToken(m[1]));
      return m[1];
    }
    return null;
  } catch (e) {
    console.warn("[Binding] install referrer unavailable:", e);
    return null;
  }
}

// Server-side fingerprint match (one-shot on the server). Returns drv token
// or null. Never throws.
async function tokenFromPendingMatch(): Promise<string | null> {
  try {
    const res = await fetch(`${getProductionApiUrl()}/api/driver/pending-match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: Platform.OS === "ios" ? "ios" : "android",
        language: deviceLanguage(),
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string };
    if (data?.token?.startsWith("drv_")) {
      console.log("[Binding] drv token from pending-match:", maskToken(data.token));
      return data.token;
    }
    return null;
  } catch {
    return null;
  }
}

// Deferred deep link probe for an unbound launch. Install Referrer is the
// primary Android mechanism; the fingerprint match is the fallback (and the
// only iOS mechanism).
export async function findDeferredDrvToken(): Promise<string | null> {
  const fromReferrer = await tokenFromInstallReferrer();
  if (fromReferrer) return fromReferrer;
  return tokenFromPendingMatch();
}
