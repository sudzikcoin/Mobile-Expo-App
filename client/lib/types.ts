export type StopType = "PICKUP" | "DELIVERY";
export type StopStatus = "PENDING" | "ARRIVED" | "DEPARTED";
export type LoadStatus = "PLANNED" | "IN_TRANSIT" | "DELIVERED";

export interface Stop {
  id: string;
  sequence: number;
  type: StopType;
  status: StopStatus;
  companyName: string;
  city: string;
  state: string;
  address: string;
  // Полный адрес (если доступен с сервера) — используется для отображения вместо city/state
  fullAddress?: string;
  scheduledTime: string;
  arrivedAt?: string;
  departedAt?: string;
}

export interface Load {
  id: string;
  loadNumber: string;
  status: LoadStatus;
  // originCity/originState теперь опциональны — на сервере их нет, вычисляем из stops[]
  originCity?: string;
  originState?: string;
  destinationCity?: string;
  destinationState?: string;
  // Дата/время доставки с сервера
  deliveredAt?: string;
  stops: Stop[];
}

export interface DriverData {
  token: string;
  balance: number;
  load: Load | null;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  action: "ARRIVE" | "DEPART" | "LOCATION_PING" | "LOCATION_ENABLED" | "LOCATION_DISABLED";
  stopId?: string;
  stopName?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}
