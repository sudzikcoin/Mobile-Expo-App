import { getApiUrl } from "@/lib/query-client";
import { Load, Stop, LoadStatus, StopStatus, StopType } from "./types";
import { IOSiXData } from "./iosix/types";
import { getEldMac } from "./iosix/service";

const PRODUCTION_API_BASE = "https://pingpoint.suverse.io";

const API_BASE_URL = getApiUrl();

console.log("[API Client] Initialized with base URL:", API_BASE_URL);
console.log("[API Client] Production fallback URL:", PRODUCTION_API_BASE);

interface APIStop {
  id: string;
  type: "PICKUP" | "DELIVERY";
  sequence: number;
  companyName: string;
  city: string;
  state: string;
  address: string;
  // Полный адрес — приходит с сервера, может отсутствовать
  fullAddress?: string;
  lat?: string | number | null;
  lng?: string | number | null;
  geofenceRadiusM?: number | string | null;
  windowFrom: string;
  windowTo: string | null;
  status: "PLANNED" | "ARRIVED" | "DEPARTED";
  arrivedAt: string | null;
  departedAt: string | null;
}

interface APILoadResponse {
  id: string;
  loadNumber: string;
  customerRef: string | null;
  status: "PLANNED" | "IN_TRANSIT" | "DELIVERED";
  rewardBalance: number;
  originCity?: string;
  originState?: string;
  destinationCity?: string;
  destinationState?: string;
  stops: APIStop[];
}

interface PingPayload {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  iosix?: IOSiXData | null;
}

// Build the wire-body for /api/driver/:token/ping. All IOSiX fields are
// flat + nullable; server accepts whichever are present and ignores the
// rest (see server/routes.ts :: extractIosixPingFields).
function buildPingBody(payload: PingPayload): Record<string, unknown> {
  const t = payload.iosix ?? null;
  return {
    lat: payload.lat,
    lng: payload.lng,
    accuracy: payload.accuracy,
    speed: payload.speed,
    // Prefer IOSiX GPS heading when available, else phone heading.
    heading: t?.heading ?? payload.heading,
    ignition: t?.ignition ?? null,
    rpm: t?.rpm ?? null,
    engineLoadPct: t?.engineLoadPct ?? null,
    coolantTempC: t?.coolantTempC ?? null,
    oilPressureKpa: t?.oilPressureKpa ?? null,
    hdop: t?.hdop ?? null,
    satellites: t?.satellites ?? null,
    altitudeM: t?.altitudeM ?? null,
    engineHours: t?.engineHours ?? null,
    engineHoursSinceStart: t?.engineHoursSinceStart ?? null,
    throttlePct: t?.throttlePct ?? null,
    batteryVoltage: t?.batteryVoltage ?? null,
    ecuSpeedKph: t?.ecuSpeedKph ?? null,
    odometerKm: t?.odometerKm ?? null,
    tripKm: t?.tripKm ?? null,
    // Version marker: distances are km end-to-end since 1.6.6. Pre-1.6.6
    // APKs sent raw km under the legacy *Miles field names with no unit;
    // the server treats those as km too.
    odometerUnit: "km",
    currentGear: t?.currentGear ?? null,
    dpfSootLoadPct: t?.dpfSootLoadPct ?? null,
    defLevelPct: t?.defLevelPct ?? null,
    activeDtcCount: t?.activeDtcCount ?? null,
    activeDtcCodes: t?.activeDtcCodes ?? null,
    eldConnected: t?.connected ?? false,
    eldMac: t?.connected ? getEldMac() : null,
    eldPacketCycleComplete: t?.packetCycleComplete ?? false,
  };
}

interface ActionResponse {
  success: boolean;
  pointsAwarded: number;
  newBalance: number;
}

export function getProductionApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.includes("pingpoint.suverse.io")) {
    return envUrl;
  }
  return PRODUCTION_API_BASE;
}

function mapStopStatus(status: string): StopStatus {
  switch (status) {
    case "ARRIVED":
      return "ARRIVED";
    case "DEPARTED":
      return "DEPARTED";
    default:
      return "PENDING";
  }
}

function mapLoadStatus(status: string): LoadStatus {
  switch (status) {
    case "IN_TRANSIT":
      return "IN_TRANSIT";
    case "DELIVERED":
      return "DELIVERED";
    default:
      return "PLANNED";
  }
}

function transformAPIResponse(data: APILoadResponse): { load: Load; balance: number } {
  const stops = data.stops || [];
  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];

  const load: Load = {
    id: data.id,
    loadNumber: data.loadNumber,
    status: mapLoadStatus(data.status),
    originCity: data.originCity || firstStop?.city || "Unknown",
    originState: data.originState || firstStop?.state || "",
    destinationCity: data.destinationCity || lastStop?.city || "Unknown",
    destinationState: data.destinationState || lastStop?.state || "",
    stops: stops.map((stop): Stop => ({
      id: stop.id,
      sequence: stop.sequence,
      type: stop.type as StopType,
      status: mapStopStatus(stop.status),
      companyName: stop.companyName,
      city: stop.city,
      state: stop.state,
      address: stop.address,
      // Пробрасываем полный адрес если пришёл с сервера
      fullAddress: stop.fullAddress,
      lat: stop.lat != null ? Number(stop.lat) : null,
      lng: stop.lng != null ? Number(stop.lng) : null,
      geofenceRadiusM: stop.geofenceRadiusM != null ? Number(stop.geofenceRadiusM) : null,
      scheduledTime: stop.windowFrom,
      arrivedAt: stop.arrivedAt || undefined,
      departedAt: stop.departedAt || undefined,
    })),
  };

  return { load, balance: data.rewardBalance };
}

async function handleApiResponse<T>(
  response: Response,
  action: string
): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  
  console.log(`[API] ${action} - Status:`, response.status);
  console.log(`[API] ${action} - Content-Type:`, contentType);
  console.log(`[API] ${action} - Response preview:`, text.substring(0, 300));

  if (text.startsWith("<!") || text.startsWith("<html") || contentType.includes("text/html")) {
    console.error(`[API] ${action} - ERROR: Received HTML instead of JSON`);
    throw new Error(
      `Expected JSON but received HTML. Check API base URL. Status: ${response.status}`
    );
  }

  if (!response.ok) {
    console.error(`[API] ${action} - ERROR: Status ${response.status}`);
    throw new Error(`API error: ${response.status} - ${text.substring(0, 100)}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch (parseError) {
    console.error(`[API] ${action} - JSON parse error:`, parseError);
    throw new Error(`Failed to parse JSON response: ${text.substring(0, 100)}`);
  }
}

// ============================================================================
// Per-truck (trk_xxx) endpoints — new no-login flow.
// ============================================================================

// Returns load + stops in the same shape as the legacy /api/driver/:token
// surface, so we can run it through the existing transformAPIResponse mapper.
export async function fetchActiveLoadForTruck(
  truckToken: string,
): Promise<{ load: Load; balance: number; legacyDriverToken: string | null } | null> {
  const baseUrl = getProductionApiUrl();
  const url = `${baseUrl}/api/truck/${truckToken}/active-load`;
  console.log("[API] Fetching truck active load:", url);
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    });
    if (!r.ok) {
      if (r.status === 404) return null;
      throw new Error(`active-load ${r.status}`);
    }
    const body = (await r.json()) as {
      load: (APILoadResponse & { driverToken?: string }) | null;
    };
    if (!body.load) return null;
    const mapped = transformAPIResponse(body.load);
    return {
      load: mapped.load,
      balance: mapped.balance,
      legacyDriverToken: body.load.driverToken ?? null,
    };
  } catch (e) {
    console.error("[API] fetchActiveLoadForTruck error:", e);
    throw e;
  }
}

// ============================================================================
// Multi-active-load surfaces (server >= 2026-07-29, app >= 1.9.0).
// A load is ACTIVE from pickup to delivery; several can be active at once
// (partials/LTL). GPS is server-side attached to ALL active loads — the
// selection below only decides whose buttons the driver is pressing.
// ============================================================================

export interface LoadsOverview {
  active: Load[];
  waiting: Load[];
  defaultLoadId: string | null;
  balance: number;
}

// Grouped view of the driver's world. Returns null when the endpoint is
// unavailable (older server) so callers can fall back to single-load mode.
export async function fetchLoadsOverview(
  truckToken: string,
): Promise<LoadsOverview | null> {
  const baseUrl = getProductionApiUrl();
  try {
    const r = await fetch(`${baseUrl}/api/truck/${truckToken}/loads-overview`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const body = (await r.json()) as {
      active?: APILoadResponse[];
      waiting?: APILoadResponse[];
      defaultLoadId?: string | null;
    };
    const mapAll = (arr?: APILoadResponse[]) =>
      (arr ?? []).map((raw) => transformAPIResponse(raw).load);
    const balance =
      (body.active ?? []).find((l) => typeof l.rewardBalance === "number")
        ?.rewardBalance ?? 0;
    return {
      active: mapAll(body.active),
      waiting: mapAll(body.waiting),
      defaultLoadId: body.defaultLoadId ?? null,
      balance,
    };
  } catch (e) {
    console.warn("[API] fetchLoadsOverview error:", e);
    return null;
  }
}

// One specific load of the bound driver — used when the driver switches the
// selected load on the main screen.
export async function fetchTruckLoadById(
  truckToken: string,
  loadId: string,
): Promise<{ load: Load; balance: number } | null> {
  const baseUrl = getProductionApiUrl();
  try {
    const r = await fetch(`${baseUrl}/api/truck/${truckToken}/loads/${loadId}`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const body = (await r.json()) as { load: APILoadResponse | null };
    if (!body.load) return null;
    return transformAPIResponse(body.load);
  } catch (e) {
    console.warn("[API] fetchTruckLoadById error:", e);
    return null;
  }
}

// Open geofence questions ("Arrived at delivery for load X?") raised while
// two or more loads are active. Nothing is marked until the driver answers.
export interface StopConfirmationAlternative {
  loadId: string;
  loadNumber: string;
  stopId: string;
  stopType: "PICKUP" | "DELIVERY";
  name: string;
  city: string;
  state: string;
  distanceM: number | null;
}

export interface StopConfirmation {
  id: string;
  action: "ARRIVE" | "DEPART";
  distanceM: number | null;
  createdAt: string;
  load: { id: string; loadNumber: string };
  stop: { id: string; type: "PICKUP" | "DELIVERY"; name: string; city: string; state: string };
  alternatives: StopConfirmationAlternative[];
}

export async function fetchStopConfirmations(
  truckToken: string,
): Promise<StopConfirmation[]> {
  const baseUrl = getProductionApiUrl();
  try {
    const r = await fetch(`${baseUrl}/api/truck/${truckToken}/confirmations`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return [];
    const body = (await r.json()) as { confirmations?: StopConfirmation[] };
    return body.confirmations ?? [];
  } catch (e) {
    console.warn("[API] fetchStopConfirmations error:", e);
    return [];
  }
}

export async function respondStopConfirmation(
  truckToken: string,
  confirmationId: string,
  action: "confirm" | "dismiss",
  stopId?: string,
): Promise<boolean> {
  const baseUrl = getProductionApiUrl();
  try {
    const r = await fetch(
      `${baseUrl}/api/truck/${truckToken}/confirmations/${confirmationId}/${action}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(stopId ? { stopId } : {}),
      },
    );
    return r.ok;
  } catch (e) {
    console.warn("[API] respondStopConfirmation error:", e);
    return false;
  }
}

export async function sendTruckPing(
  truckToken: string,
  payload: PingPayload,
  retries = 3,
): Promise<boolean> {
  const baseUrl = getProductionApiUrl();
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const url = `${baseUrl}/api/truck/${truckToken}/ping`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(buildPingBody(payload)),
      });
      if (r.ok) {
        console.log(`[GPS][truck] ping sent: ${payload.lat},${payload.lng}`);
        return true;
      }
      console.warn(`[GPS][truck] ping ${r.status}, attempt ${attempt + 1}`);
    } catch (e) {
      console.warn(`[GPS][truck] ping error attempt ${attempt + 1}:`, e);
    }
    if (attempt < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  return false;
}

export async function registerTruckFcm(
  truckToken: string,
  fcmToken: string,
): Promise<boolean> {
  const baseUrl = getProductionApiUrl();
  try {
    const r = await fetch(`${baseUrl}/api/truck/${truckToken}/fcm-register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fcmToken }),
    });
    return r.ok;
  } catch (e) {
    console.error("[API] registerTruckFcm error:", e);
    return false;
  }
}

export async function fetchDriverLoad(token: string): Promise<{ load: Load; balance: number } | null> {
  const baseUrl = getProductionApiUrl();
  const url = `${baseUrl}/api/driver/${token}`;
  console.log("[API] Fetching driver load from:", url);
  
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    });

    console.log("[API] Response status:", response.status);
    console.log("[API] Content-Type:", response.headers.get("content-type"));

    const text = await response.text();
    console.log("[API] Response body preview:", text.substring(0, 200));

    if (!response.ok) {
      if (response.status === 404) {
        console.log("[API] Driver not found (404)");
        return null;
      }
      throw new Error(`API error: ${response.status}`);
    }

    if (text.startsWith("<!") || text.startsWith("<html")) {
      console.error("[API] Received HTML instead of JSON");
      throw new Error("Server returned HTML instead of JSON. Check API URL.");
    }

    const data: APILoadResponse = JSON.parse(text);
    console.log("[API] Successfully fetched driver data:", data.loadNumber);
    return transformAPIResponse(data);
  } catch (error) {
    console.error("[API] Failed to fetch driver load:", error);
    throw error;
  }
}

export async function sendLocationPing(
  token: string,
  payload: PingPayload,
  retries = 3
): Promise<boolean> {
  const baseUrl = getProductionApiUrl();
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const url = `${baseUrl}/api/driver/${token}/ping`;
      console.log(`[GPS] Sending ping to: ${url} (attempt ${attempt + 1})`);
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(buildPingBody(payload)),
      });

      if (response.ok) {
        const iosixInfo = payload.iosix?.connected
          ? ` iosix=ok rpm=${payload.iosix.rpm ?? "-"} hdop=${payload.iosix.hdop ?? "-"}`
          : "";
        console.log(`[GPS] Ping sent successfully: ${payload.lat}, ${payload.lng}${iosixInfo}`);
        return true;
      }

      console.warn(`[GPS] Ping failed with status ${response.status}, attempt ${attempt + 1}`);
    } catch (error) {
      console.warn(`[GPS] Ping error, attempt ${attempt + 1}:`, error);
    }

    if (attempt < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  console.error("[GPS] All ping attempts failed");
  return false;
}

export async function markStopArrival(
  token: string,
  stopId: string
): Promise<ActionResponse> {
  const baseUrl = getProductionApiUrl();
  const url = `${baseUrl}/api/driver/${token}/stops/${stopId}/arrive`;
  
  console.log("[API] ===== ARRIVE REQUEST =====");
  console.log("[API] Arrive - URL:", url);
  console.log("[API] Arrive - Method: POST");
  console.log("[API] Arrive - Token:", token.substring(0, 8) + "...");
  console.log("[API] Arrive - StopId:", stopId);
  console.log("[API] Arrive - Base URL used:", baseUrl);
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
      }),
    });

    const result = await handleApiResponse<ActionResponse>(response, "Arrive");
    console.log("[API] Arrive - Success! Points awarded:", result.pointsAwarded);
    return result;
  } catch (error) {
    console.error("[API] Arrive - FAILED:", error);
    throw error;
  }
}

export async function markStopDeparture(
  token: string,
  stopId: string
): Promise<ActionResponse> {
  const baseUrl = getProductionApiUrl();
  const url = `${baseUrl}/api/driver/${token}/stops/${stopId}/depart`;
  
  console.log("[API] ===== DEPART REQUEST =====");
  console.log("[API] Depart - URL:", url);
  console.log("[API] Depart - Method: POST");
  console.log("[API] Depart - Token:", token.substring(0, 8) + "...");
  console.log("[API] Depart - StopId:", stopId);
  console.log("[API] Depart - Base URL used:", baseUrl);
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
      }),
    });

    const result = await handleApiResponse<ActionResponse>(response, "Depart");
    console.log("[API] Depart - Success! Points awarded:", result.pointsAwarded);
    return result;
  } catch (error) {
    console.error("[API] Depart - FAILED:", error);
    throw error;
  }
}

// ============================================================================
// Broker invitations (multi-broker driver identity).
// A load from a broker the driver has no ACTIVE link with shows up here as a
// PENDING invitation; nothing of that broker's loads is visible until the
// driver accepts.
// ============================================================================

export interface BrokerInvitation {
  id: string;
  brokerName: string;
  loadNumber: string | null;
  createdAt: string;
}

export async function fetchBrokerInvitations(
  truckToken: string,
): Promise<BrokerInvitation[]> {
  const baseUrl = getProductionApiUrl();
  try {
    const r = await fetch(`${baseUrl}/api/truck/${truckToken}/invitations`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return [];
    const body = (await r.json()) as { invitations?: BrokerInvitation[] };
    return body.invitations ?? [];
  } catch (e) {
    console.warn("[API] fetchBrokerInvitations error:", e);
    return [];
  }
}

export async function respondBrokerInvitation(
  truckToken: string,
  invitationId: string,
  action: "accept" | "decline",
): Promise<boolean> {
  const baseUrl = getProductionApiUrl();
  try {
    const r = await fetch(
      `${baseUrl}/api/truck/${truckToken}/invitations/${invitationId}/${action}`,
      { method: "POST", headers: { Accept: "application/json" } },
    );
    return r.ok;
  } catch (e) {
    console.warn("[API] respondBrokerInvitation error:", e);
    return false;
  }
}
