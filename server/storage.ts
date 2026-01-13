import { type User, type InsertUser } from "@shared/schema";
import { randomUUID } from "crypto";

interface Stop {
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

interface DriverData {
  id: string;
  loadNumber: string;
  customerRef: string | null;
  status: "PLANNED" | "IN_TRANSIT" | "DELIVERED";
  rewardBalance: number;
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  stops: Stop[];
}

interface LocationPing {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: string;
}

interface ActionResult {
  success: boolean;
  pointsAwarded: number;
  newBalance: number;
}

const MOCK_DRIVERS: Record<string, DriverData> = {
  demo: {
    id: "load-demo",
    loadNumber: "172703",
    customerRef: null,
    status: "IN_TRANSIT",
    rewardBalance: 70,
    originCity: "Evansville",
    originState: "IN",
    destinationCity: "Carlsbad",
    destinationState: "CA",
    stops: [
      {
        id: "stop-1",
        type: "PICKUP",
        sequence: 1,
        companyName: "Windstream Supply",
        city: "Evansville",
        state: "IN",
        address: "14616 Foundation Ave",
        windowFrom: "2025-01-10T21:53:00Z",
        windowTo: null,
        status: "DEPARTED",
        arrivedAt: "2025-01-10T21:45:00Z",
        departedAt: "2025-01-10T22:30:00Z",
      },
      {
        id: "stop-2",
        type: "DELIVERY",
        sequence: 2,
        companyName: "Pacific Logistics Hub",
        city: "Carlsbad",
        state: "CA",
        address: "2891 Commerce Way",
        windowFrom: "2025-01-12T14:00:00Z",
        windowTo: null,
        status: "PLANNED",
        arrivedAt: null,
        departedAt: null,
      },
    ],
  },
  test: {
    id: "load-test",
    loadNumber: "172704",
    customerRef: "REF-001",
    status: "PLANNED",
    rewardBalance: 50,
    originCity: "Chicago",
    originState: "IL",
    destinationCity: "Dallas",
    destinationState: "TX",
    stops: [
      {
        id: "stop-t1",
        type: "PICKUP",
        sequence: 1,
        companyName: "Midwest Distribution",
        city: "Chicago",
        state: "IL",
        address: "500 Industrial Blvd",
        windowFrom: "2025-01-15T08:00:00Z",
        windowTo: null,
        status: "PLANNED",
        arrivedAt: null,
        departedAt: null,
      },
      {
        id: "stop-t2",
        type: "DELIVERY",
        sequence: 2,
        companyName: "Texas Freight Center",
        city: "Dallas",
        state: "TX",
        address: "1200 Cargo Lane",
        windowFrom: "2025-01-17T16:00:00Z",
        windowTo: null,
        status: "PLANNED",
        arrivedAt: null,
        departedAt: null,
      },
    ],
  },
};

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getDriverData(token: string): Promise<DriverData | null>;
  recordLocationPing(token: string, ping: Omit<LocationPing, "timestamp">): Promise<void>;
  markStopArrival(token: string, stopId: string): Promise<ActionResult | null>;
  markStopDeparture(token: string, stopId: string): Promise<ActionResult | null>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private drivers: Record<string, DriverData>;
  private locationPings: Record<string, LocationPing[]>;

  constructor() {
    this.users = new Map();
    this.drivers = JSON.parse(JSON.stringify(MOCK_DRIVERS));
    this.locationPings = {};
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getDriverData(token: string): Promise<DriverData | null> {
    return this.drivers[token] || null;
  }

  async recordLocationPing(token: string, ping: Omit<LocationPing, "timestamp">): Promise<void> {
    if (!this.locationPings[token]) {
      this.locationPings[token] = [];
    }

    this.locationPings[token].push({
      ...ping,
      timestamp: new Date().toISOString(),
    });

    if (this.locationPings[token].length > 100) {
      this.locationPings[token] = this.locationPings[token].slice(-100);
    }
  }

  async markStopArrival(token: string, stopId: string): Promise<ActionResult | null> {
    const driver = this.drivers[token];
    if (!driver) return null;

    const stop = driver.stops.find((s) => s.id === stopId);
    if (!stop) return null;

    stop.status = "ARRIVED";
    stop.arrivedAt = new Date().toISOString();

    const pointsAwarded = 10;
    driver.rewardBalance += pointsAwarded;

    if (driver.status === "PLANNED") {
      driver.status = "IN_TRANSIT";
    }

    return {
      success: true,
      pointsAwarded,
      newBalance: driver.rewardBalance,
    };
  }

  async markStopDeparture(token: string, stopId: string): Promise<ActionResult | null> {
    const driver = this.drivers[token];
    if (!driver) return null;

    const stop = driver.stops.find((s) => s.id === stopId);
    if (!stop) return null;

    stop.status = "DEPARTED";
    stop.departedAt = new Date().toISOString();

    const pointsAwarded = 20;
    driver.rewardBalance += pointsAwarded;

    const allDeparted = driver.stops.every((s) => s.status === "DEPARTED");
    if (allDeparted) {
      driver.status = "DELIVERED";
    }

    return {
      success: true,
      pointsAwarded,
      newBalance: driver.rewardBalance,
    };
  }
}

export const storage = new MemStorage();
