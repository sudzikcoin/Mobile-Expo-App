import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";

// Lightweight i18n: a flat dictionary + context, no i18next runtime. The app
// ships exactly two languages (en/es) and every driver-facing string of the
// shipped screens lives here. {placeholders} are replaced via t(key, vars).

export type AppLanguage = "en" | "es";

const LANGUAGE_KEY = "@pingpoint_language";

// Default = device language when Spanish, else English. A driver's explicit
// pick in Settings overrides and persists.
export function systemLanguage(): AppLanguage {
  try {
    const code = getLocales()[0]?.languageCode?.toLowerCase();
    return code === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}

type Dict = Record<string, string>;

const en: Dict = {
  // Drawer menu
  "menu.dashboard": "Dashboard",
  "menu.history": "History",
  "menu.status": "Status",
  "menu.nav": "PingPoint NAV",
  "menu.settings": "Settings",

  // Dashboard
  "dash.loading": "Loading your assignment...",
  "dash.retry": "Retry",
  "dash.gpsActive": "GPS Active",
  "dash.lastUpdate": "Last update: {time}",
  "dash.stops": "STOPS",
  "dash.openTp": "OPEN ROUTE IN TRUCKER PATH",
  "dash.openGmaps": "OPEN IN GOOGLE MAPS",
  "dash.buildingRoute": "BUILDING ROUTE…",
  "dash.stopCoordsMissing": "Stop coordinates unavailable — ask dispatch to update the load.",
  "dash.noLoadTitle": "No Active Load",
  "dash.noLoadText": "Pull down to refresh when you have a new assignment.",
  "dash.tpNotInstalled": "Trucker Path app not installed",
  "dash.gmapsCantOpen": "Couldn't open Google Maps",
  "dash.routeEngineTitle": "Route engine unavailable",
  "dash.routeEngineRetry": "Couldn't build the truck-safe route. Try again in a minute.",
  "dash.routeEngineFallback": "Couldn't build the truck-safe route. Open a plain Google Maps route to your stops instead? It will NOT account for truck restrictions — watch for low bridges and weight limits yourself.",
  "dash.cancel": "Cancel",
  "dash.openAnyway": "Open anyway",
  "time.sAgo": "{n}s ago",
  "time.mAgo": "{n}m ago",

  // Load / stops
  "load.number": "LOAD #{number}",
  "load.planned": "PLANNED",
  "load.inTransit": "IN TRANSIT",
  "load.delivered": "DELIVERED",
  "stop.pickup": "PICKUP",
  "stop.delivery": "DELIVERY",
  "stop.arrived": "Arrived",
  "stop.departed": "Departed",
  "stop.arriveBtn": "Arrive",
  "stop.departBtn": "Depart",
  "load.locationActive": "Location Sharing Active",
  "load.locationEnable": "Enable Location Sharing",
  "load.openSettings": "Open Settings",
  "load.locationDenied": "Location permission was denied. Enable it in Settings to share your location.",

  // ELD pill
  "eld.scanning": "Scanning for ELD...",
  "eld.notConnected": "ELD Not Connected",
  "eld.blePermission": "ELD: Bluetooth permission denied",
  "eld.engineOff": "ENGINE OFF",

  // History
  "history.title": "History",
  "history.emptyTitle": "No Completed Loads",
  "history.emptyText": "Completed loads will appear here.",
  "history.delivered": "DELIVERED",
  "history.cancelled": "CANCELLED",
  "history.deliveredOn": "Delivered: {date}",
  "history.stopsCount": "{n} stops",
  "history.loadMore": "LOAD MORE",
  "history.loading": "Loading…",

  // History detail
  "historyDetail.title": "Load Details",
  "historyDetail.refs": "REFERENCES",
  "historyDetail.loadNumber": "Load number",
  "historyDetail.customerRef": "Customer ref",
  "historyDetail.status": "Status",
  "historyDetail.deliveredAt": "Delivered",
  "historyDetail.stops": "STOPS",
  "historyDetail.arrived": "Arrived",
  "historyDetail.departed": "Departed",

  // Status screen
  "status.title": "Status",

  // Legal
  "legal.privacy": "Privacy Policy",
  "legal.terms": "Terms of Service",

  // Settings
  "settings.title": "Settings",
  "settings.appearance": "APPEARANCE",
  "settings.arcadeDesc": "Neon glows & cyberpunk vibes",
  "settings.premiumDesc": "Clean & refined dark mode",
  "settings.truckDriver": "TRUCK & DRIVER",
  "settings.driver": "Driver",
  "settings.vin": "VIN (from ELD)",
  "settings.vinWaiting": "Waiting for ELD stream",
  "settings.truck": "Truck",
  "settings.notSet": "Not set",
  "settings.live": "LIVE",
  "settings.units": "UNITS",
  "settings.unitsMiles": "Miles · mph",
  "settings.unitsKm": "Kilometers · km/h",
  "settings.language": "LANGUAGE",
  "settings.appInfo": "APP INFO",
  "settings.version": "Version",
  "settings.support": "SUPPORT",
  "settings.sendDiagnostics": "Send Diagnostics",
  "settings.sendDiagnosticsDesc": "Share the app activity log with support",
  "settings.advanced": "ADVANCED",
  "settings.trackingLegacy": "Tracking Status (Legacy)",
  "settings.logs": "Logs",
  "settings.switchTruck": "Switch Truck",
  "settings.switchTitle": "Switch Truck?",
  "settings.switchBody": "This will sign out of the current truck. Tap a new load link (or use the service entrance) to bind again. Your tracking data on the server is not affected.",
  "settings.switchConfirm": "Switch",
  "settings.advancedHint": "{n} more…",
  "settings.diagShareTitle": "PingPoint Driver diagnostics",
  "settings.diagEmpty": "No activity logged yet.",

  // Logs screen
  "logs.title": "Logs",
  "logs.emptyTitle": "No Activity Yet",
  "logs.emptyText": "Your stop arrivals, departures, and location pings will be logged here.",
  "logs.arrive": "Arrived at stop",
  "logs.depart": "Departed from stop",
  "logs.locationEnabled": "Location sharing enabled",
  "logs.locationDisabled": "Location sharing disabled",
  "logs.locationPing": "Location sent",

  // Waiting screen
  "waiting.title": "Waiting for your load",
  "waiting.hint": "Tap the link from your dispatcher or broker to start.",
};

const es: Dict = {
  "menu.dashboard": "Panel",
  "menu.history": "Historial",
  "menu.status": "Estado",
  "menu.nav": "PingPoint NAV",
  "menu.settings": "Ajustes",

  "dash.loading": "Cargando su asignación...",
  "dash.retry": "Reintentar",
  "dash.gpsActive": "GPS Activo",
  "dash.lastUpdate": "Última actualización: {time}",
  "dash.stops": "PARADAS",
  "dash.openTp": "ABRIR RUTA EN TRUCKER PATH",
  "dash.openGmaps": "ABRIR EN GOOGLE MAPS",
  "dash.buildingRoute": "CREANDO RUTA…",
  "dash.stopCoordsMissing": "Coordenadas de parada no disponibles — pida a despacho que actualice la carga.",
  "dash.noLoadTitle": "Sin carga activa",
  "dash.noLoadText": "Deslice hacia abajo para actualizar cuando tenga una nueva asignación.",
  "dash.tpNotInstalled": "La aplicación Trucker Path no está instalada",
  "dash.gmapsCantOpen": "No se pudo abrir Google Maps",
  "dash.routeEngineTitle": "Motor de rutas no disponible",
  "dash.routeEngineRetry": "No se pudo crear la ruta para camión. Intente de nuevo en un minuto.",
  "dash.routeEngineFallback": "No se pudo crear la ruta para camión. ¿Abrir una ruta normal de Google Maps a sus paradas? NO tendrá en cuenta las restricciones para camiones — vigile usted mismo los puentes bajos y límites de peso.",
  "dash.cancel": "Cancelar",
  "dash.openAnyway": "Abrir de todos modos",
  "time.sAgo": "hace {n}s",
  "time.mAgo": "hace {n}m",

  "load.number": "CARGA #{number}",
  "load.planned": "PLANIFICADA",
  "load.inTransit": "EN TRÁNSITO",
  "load.delivered": "ENTREGADA",
  "stop.pickup": "RECOGIDA",
  "stop.delivery": "ENTREGA",
  "stop.arrived": "Llegada",
  "stop.departed": "Salida",
  "stop.arriveBtn": "Llegué",
  "stop.departBtn": "Salí",
  "load.locationActive": "Ubicación compartida activa",
  "load.locationEnable": "Activar ubicación compartida",
  "load.openSettings": "Abrir ajustes",
  "load.locationDenied": "Se denegó el permiso de ubicación. Actívelo en Ajustes para compartir su ubicación.",

  "eld.scanning": "Buscando ELD...",
  "eld.notConnected": "ELD no conectado",
  "eld.blePermission": "ELD: permiso de Bluetooth denegado",
  "eld.engineOff": "MOTOR APAGADO",

  "history.title": "Historial",
  "history.emptyTitle": "Sin cargas completadas",
  "history.emptyText": "Las cargas completadas aparecerán aquí.",
  "history.delivered": "ENTREGADA",
  "history.cancelled": "CANCELADA",
  "history.deliveredOn": "Entregada: {date}",
  "history.stopsCount": "{n} paradas",
  "history.loadMore": "CARGAR MÁS",
  "history.loading": "Cargando…",

  "historyDetail.title": "Detalles de carga",
  "historyDetail.refs": "REFERENCIAS",
  "historyDetail.loadNumber": "Número de carga",
  "historyDetail.customerRef": "Ref. del cliente",
  "historyDetail.status": "Estado",
  "historyDetail.deliveredAt": "Entregada",
  "historyDetail.stops": "PARADAS",
  "historyDetail.arrived": "Llegada",
  "historyDetail.departed": "Salida",

  "status.title": "Estado",

  "legal.privacy": "Política de privacidad",
  "legal.terms": "Términos de servicio",

  "settings.title": "Ajustes",
  "settings.appearance": "APARIENCIA",
  "settings.arcadeDesc": "Neón y estilo cyberpunk",
  "settings.premiumDesc": "Modo oscuro limpio y refinado",
  "settings.truckDriver": "CAMIÓN Y CONDUCTOR",
  "settings.driver": "Conductor",
  "settings.vin": "VIN (del ELD)",
  "settings.vinWaiting": "Esperando datos del ELD",
  "settings.truck": "Camión",
  "settings.notSet": "Sin configurar",
  "settings.live": "EN VIVO",
  "settings.units": "UNIDADES",
  "settings.unitsMiles": "Millas · mph",
  "settings.unitsKm": "Kilómetros · km/h",
  "settings.language": "IDIOMA",
  "settings.appInfo": "INFORMACIÓN",
  "settings.version": "Versión",
  "settings.support": "SOPORTE",
  "settings.sendDiagnostics": "Enviar diagnóstico",
  "settings.sendDiagnosticsDesc": "Compartir el registro de actividad con soporte",
  "settings.advanced": "AVANZADO",
  "settings.trackingLegacy": "Estado de rastreo (Legacy)",
  "settings.logs": "Registros",
  "settings.switchTruck": "Cambiar de camión",
  "settings.switchTitle": "¿Cambiar de camión?",
  "settings.switchBody": "Esto cerrará la sesión del camión actual. Toque un nuevo enlace de carga (o use la entrada de servicio) para vincular de nuevo. Sus datos de rastreo en el servidor no se ven afectados.",
  "settings.switchConfirm": "Cambiar",
  "settings.advancedHint": "{n} más…",
  "settings.diagShareTitle": "Diagnóstico de PingPoint Driver",
  "settings.diagEmpty": "Aún no hay actividad registrada.",

  "logs.title": "Registros",
  "logs.emptyTitle": "Sin actividad todavía",
  "logs.emptyText": "Sus llegadas, salidas y envíos de ubicación se registrarán aquí.",
  "logs.arrive": "Llegada a parada",
  "logs.depart": "Salida de parada",
  "logs.locationEnabled": "Ubicación compartida activada",
  "logs.locationDisabled": "Ubicación compartida desactivada",
  "logs.locationPing": "Ubicación enviada",

  "waiting.title": "Esperando su carga",
  "waiting.hint": "Toque el enlace de su despachador o broker para comenzar.",
};

const DICTS: Record<AppLanguage, Dict> = { en, es };

interface I18nContextType {
  lang: AppLanguage;
  // null = follow system; concrete value = user override from Settings.
  override: AppLanguage | null;
  setLanguage: (lang: AppLanguage | null) => Promise<void>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<AppLanguage | null>(null);
  const [lang, setLang] = useState<AppLanguage>(systemLanguage());

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_KEY)
      .then((saved) => {
        if (saved === "en" || saved === "es") {
          setOverride(saved);
          setLang(saved);
        }
      })
      .catch(() => {});
  }, []);

  const setLanguage = useCallback(async (next: AppLanguage | null) => {
    try {
      if (next === null) {
        await AsyncStorage.removeItem(LANGUAGE_KEY);
        setOverride(null);
        setLang(systemLanguage());
      } else {
        await AsyncStorage.setItem(LANGUAGE_KEY, next);
        setOverride(next);
        setLang(next);
      }
    } catch (e) {
      console.error("[i18n] Failed to persist language:", e);
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let s = DICTS[lang][key] ?? DICTS.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replace(`{${k}}`, String(v));
        }
      }
      return s;
    },
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, override, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}
