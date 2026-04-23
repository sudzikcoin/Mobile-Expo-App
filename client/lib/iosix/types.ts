export interface IOSiXData {
  rpm: number | null;
  engineLoadPct: number | null;
  coolantTempC: number | null;
  oilTempC: number | null;
  oilPressureKpa: number | null;
  fuelTempC: number | null;
  fuelPressureKpa: number | null;
  fuelRateGph: number | null;
  totalFuelUsedGal: number | null;
  engineHours: number | null;
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
    rpm: null,
    engineLoadPct: null,
    coolantTempC: null,
    oilTempC: null,
    oilPressureKpa: null,
    fuelTempC: null,
    fuelPressureKpa: null,
    fuelRateGph: null,
    totalFuelUsedGal: null,
    engineHours: null,
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
    activeDtcCount: null,
    activeDtcCodes: null,
    historicDtcCodes: null,
    connected: false,
    lastUpdated: null,
    packetCycleComplete: false,
    signalDbm: null,
  };
}
