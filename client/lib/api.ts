import { getApiUrl } from "@/lib/query-client";
import { Load, Stop, LoadStatus, StopStatus, StopType } from "./types";
import { IOSiXData } from "./iosix/types";
import { IOSIX_MAC } from "./iosix/service";

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
    rpm: t?.rpm ?? null,
    engineLoadPct: t?.engineLoadPct ?? null,
    coolantTempC: t?.coolantTempC ?? null,
    oilPressureKpa: t?.oilPressureKpa ?? null,
    fuelRateGph: t?.fuelRateGph ?? null,
    totalFuelUsedGal: t?.totalFuelUsedGal ?? null,
    engineHours: t?.engineHours ?? null,
    throttlePct: t?.throttlePct ?? null,
    batteryVoltage: t?.batteryVoltage ?? null,
    odometerMiles: t?.odometerMiles ?? null,
    tripMiles: t?.tripMiles ?? null,
    currentGear: t?.currentGear ?? null,
    dpfSootLoadPct: t?.dpfSootLoadPct ?? null,
    defLevelPct: t?.defLevelPct ?? null,
    activeDtcCount: t?.activeDtcCount ?? null,
    activeDtcCodes: t?.activeDtcCodes ?? null,
    eldConnected: t?.connected ?? false,
    eldMac: t?.connected ? IOSIX_MAC : null,
    eldPacketCycleComplete: t?.packetCycleComplete ?? false,
  };
}

interface ActionResponse {
  success: boolean;
  pointsAwarded: number;
  newBalance: number;
}

function getProductionApiUrl(): string {
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
          ? ` iosix=ok rpm=${payload.iosix.rpm ?? "-"} fuel=${payload.iosix.fuelRateGph ?? "-"}gph`
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
