import { getApiUrl } from "@/lib/query-client";
import { Load, Stop, LoadStatus, StopStatus, StopType } from "./types";

const API_BASE_URL = getApiUrl();

interface APIStop {
  id: string;
  type: "PICKUP" | "DELIVERY";
  sequence: number;
  companyName: string;
  city: string;
  state: string;
  address: string;
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
}

interface ActionResponse {
  success: boolean;
  pointsAwarded: number;
  newBalance: number;
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
      scheduledTime: stop.windowFrom,
      arrivedAt: stop.arrivedAt || undefined,
      departedAt: stop.departedAt || undefined,
    })),
  };

  return { load, balance: data.rewardBalance };
}

export async function fetchDriverLoad(token: string): Promise<{ load: Load; balance: number } | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/driver/${token}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data: APILoadResponse = await response.json();
    return transformAPIResponse(data);
  } catch (error) {
    console.error("Failed to fetch driver load:", error);
    throw error;
  }
}

export async function sendLocationPing(
  token: string,
  payload: PingPayload,
  retries = 3
): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/driver/${token}/ping`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(`[GPS] Ping sent successfully: ${payload.lat}, ${payload.lng}`);
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
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/driver/${token}/stops/${stopId}/arrive`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to mark stop arrival:", error);
    throw error;
  }
}

export async function markStopDeparture(
  token: string,
  stopId: string
): Promise<ActionResponse> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/driver/${token}/stops/${stopId}/depart`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to mark stop departure:", error);
    throw error;
  }
}
