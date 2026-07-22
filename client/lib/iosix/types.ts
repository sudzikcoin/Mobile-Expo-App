export interface IOSiXData {
  ignition: boolean | null;
  rpm: number | null;
  engineLoadPct: number | null;
  coolantTempC: number | null;
  oilTempC: number | null;
  oilPressureKpa: number | null;
  fuelTempC: number | null;
  fuelPressureKpa: number | null;
  hdop: number | null;
  engineHours: number | null;
  // f7: engine-hours since engine start (0.05 h quantum). The PT30 stream
  // has NO fuel measurement — this field was previously misread as trip fuel.
  engineHoursSinceStart: number | null;
  turboTempC: number | null;
  boostPressureKpa: number | null;
  throttlePct: number | null;
  intakeAirTempC: number | null;

  currentGear: number | null;
  selectedGear: number | null;
  outputShaftSpeedRpm: number | null;
  transTempC: number | null;

  batteryVoltage: number | null;
  alternatorCurrent: number | null;

  odometerMiles: number | null;
  // f3: ECU road speed (hard 0 with engine off, governed at 120 km/h).
  ecuSpeedKph: number | null;
  // f13: GPS ground speed (works engine-off, drifts 0-4 km/h parked,
  // null when there is no GPS fix).
  gpsSpeedKph: number | null;
  // Convenience for UI/auto-arrive-depart: GPS speed, ECU fallback, in mph.
  speedMph: number | null;
  tripMiles: number | null;

  dpfSootLoadPct: number | null;
  dpfTempC: number | null;
  defLevelPct: number | null;
  defConsumptionLph: number | null;

  lat: number | null;
  lng: number | null;
  altitudeM: number | null;
  heading: number | null;
  satellites: number | null;
  gpsAccuracy: number | null;
  gpsTimeUtc: string | null;

  vin: string | null;
  engineSerial: string | null;

  // f18: device uptime seconds, uint16 (wraps mod 65536; keeps counting
  // through key-off). Server uses (date,time,f18) as the frame dedup key.
  deviceUptimeS: number | null;

  activeDtcCount: number | null;
  activeDtcCodes: string[] | null;
  historicDtcCodes: string[] | null;

  connected: boolean;
  lastUpdated: number | null;
  packetCycleComplete: boolean;
  signalDbm: number | null;
}

export function emptyIOSiXData(): IOSiXData {
  return {
    ignition: null,
    rpm: null,
    engineLoadPct: null,
    coolantTempC: null,
    oilTempC: null,
    oilPressureKpa: null,
    fuelTempC: null,
    fuelPressureKpa: null,
    hdop: null,
    engineHours: null,
    engineHoursSinceStart: null,
    turboTempC: null,
    boostPressureKpa: null,
    throttlePct: null,
    intakeAirTempC: null,
    currentGear: null,
    selectedGear: null,
    outputShaftSpeedRpm: null,
    transTempC: null,
    batteryVoltage: null,
    alternatorCurrent: null,
    odometerMiles: null,
    ecuSpeedKph: null,
    gpsSpeedKph: null,
    speedMph: null,
    tripMiles: null,
    dpfSootLoadPct: null,
    dpfTempC: null,
    defLevelPct: null,
    defConsumptionLph: null,
    lat: null,
    lng: null,
    altitudeM: null,
    heading: null,
    satellites: null,
    gpsAccuracy: null,
    gpsTimeUtc: null,
    vin: null,
    engineSerial: null,
    deviceUptimeS: null,
    activeDtcCount: null,
    activeDtcCodes: null,
    historicDtcCodes: null,
    connected: false,
    lastUpdated: null,
    packetCycleComplete: false,
    signalDbm: null,
  };
}
