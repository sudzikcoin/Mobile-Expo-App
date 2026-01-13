import { Load, Stop } from "./types";

export const MOCK_LOAD: Load = {
  id: "load-1",
  loadNumber: "172703",
  status: "IN_TRANSIT",
  originCity: "Evansville",
  originState: "IN",
  destinationCity: "Carlsbad",
  destinationState: "CA",
  stops: [
    {
      id: "stop-1",
      sequence: 1,
      type: "PICKUP",
      status: "DEPARTED",
      companyName: "Windstream Supply",
      city: "Evansville",
      state: "IN",
      address: "14616 Foundation Ave",
      scheduledTime: "2024-01-10T21:53:00Z",
      arrivedAt: "2024-01-10T21:45:00Z",
      departedAt: "2024-01-10T22:30:00Z",
    },
    {
      id: "stop-2",
      sequence: 2,
      type: "DELIVERY",
      status: "PENDING",
      companyName: "Pacific Logistics Hub",
      city: "Carlsbad",
      state: "CA",
      address: "2891 Commerce Way",
      scheduledTime: "2024-01-12T14:00:00Z",
    },
  ],
};

export const MOCK_COMPLETED_LOADS: Load[] = [
  {
    id: "load-0",
    loadNumber: "172680",
    status: "DELIVERED",
    originCity: "Chicago",
    originState: "IL",
    destinationCity: "Dallas",
    destinationState: "TX",
    stops: [
      {
        id: "stop-0-1",
        sequence: 1,
        type: "PICKUP",
        status: "DEPARTED",
        companyName: "Midwest Distribution",
        city: "Chicago",
        state: "IL",
        address: "500 Industrial Blvd",
        scheduledTime: "2024-01-05T08:00:00Z",
        arrivedAt: "2024-01-05T07:55:00Z",
        departedAt: "2024-01-05T09:30:00Z",
      },
      {
        id: "stop-0-2",
        sequence: 2,
        type: "DELIVERY",
        status: "DEPARTED",
        companyName: "Texas Freight Center",
        city: "Dallas",
        state: "TX",
        address: "1200 Cargo Lane",
        scheduledTime: "2024-01-07T16:00:00Z",
        arrivedAt: "2024-01-07T15:45:00Z",
        departedAt: "2024-01-07T17:00:00Z",
      },
    ],
  },
];

export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${month} ${day}, ${hours}:${minutes}`;
}

export function getStopActionLabel(stop: Stop): string | null {
  if (stop.status === "PENDING") {
    return "Arrive";
  }
  if (stop.status === "ARRIVED") {
    return "Depart";
  }
  return null;
}

export function isStopCompleted(stop: Stop): boolean {
  return stop.status === "DEPARTED";
}

export function isStopCurrent(stop: Stop, allStops: Stop[]): boolean {
  const firstPending = allStops.find((s) => s.status !== "DEPARTED");
  return firstPending?.id === stop.id;
}
