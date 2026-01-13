import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";

interface PingPayload {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // GET /api/driver/:token - fetch load data
  app.get("/api/driver/:token", async (req: Request, res: Response) => {
    const { token } = req.params;

    try {
      const driverData = await storage.getDriverData(token);

      if (!driverData) {
        return res.status(404).json({ error: "Driver not found" });
      }

      return res.json(driverData);
    } catch (error) {
      console.error("Error fetching driver data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/driver/:token/ping - receive GPS coordinates
  app.post("/api/driver/:token/ping", async (req: Request, res: Response) => {
    const { token } = req.params;
    const payload: PingPayload = req.body;

    try {
      const driverData = await storage.getDriverData(token);

      if (!driverData) {
        return res.status(404).json({ error: "Driver not found" });
      }

      await storage.recordLocationPing(token, payload);

      console.log(`[GPS Ping] Token: ${token}, Lat: ${payload.lat}, Lng: ${payload.lng}, Accuracy: ${payload.accuracy}m`);

      return res.json({ success: true });
    } catch (error) {
      console.error("Error recording GPS ping:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/driver/:token/stops/:stopId/arrive - mark arrival
  app.post("/api/driver/:token/stops/:stopId/arrive", async (req: Request, res: Response) => {
    const { token, stopId } = req.params;

    try {
      const result = await storage.markStopArrival(token, stopId);

      if (!result) {
        return res.status(404).json({ error: "Stop not found" });
      }

      console.log(`[Stop Action] Driver ${token} arrived at stop ${stopId}`);

      return res.json(result);
    } catch (error) {
      console.error("Error marking stop arrival:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/driver/:token/stops/:stopId/depart - mark departure
  app.post("/api/driver/:token/stops/:stopId/depart", async (req: Request, res: Response) => {
    const { token, stopId } = req.params;

    try {
      const result = await storage.markStopDeparture(token, stopId);

      if (!result) {
        return res.status(404).json({ error: "Stop not found" });
      }

      console.log(`[Stop Action] Driver ${token} departed from stop ${stopId}`);

      return res.json(result);
    } catch (error) {
      console.error("Error marking stop departure:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
