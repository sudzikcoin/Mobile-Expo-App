import { Share, Platform } from "react-native";
import * as Application from "expo-application";
import { getLogs, getTruckNumber, getDriverName, maskToken, getActiveToken } from "./storage";

// One-tap diagnostics export, used by both the hidden Logs screen and
// Settings → Send Diagnostics. Content is the on-device activity log plus a
// small header; the auth token is masked — never ship a raw token off-device.
export async function shareDiagnostics(title: string): Promise<void> {
  const [logs, truck, driver, token] = await Promise.all([
    getLogs(),
    getTruckNumber(),
    getDriverName(),
    getActiveToken(),
  ]);

  const header = [
    "PingPoint Driver diagnostics",
    `App: ${Application.nativeApplicationVersion ?? "?"} (${Application.nativeBuildVersion ?? "?"}) ${Platform.OS}`,
    `Truck: ${truck ?? "-"}  Driver: ${driver ?? "-"}  Token: ${maskToken(token)}`,
    `Exported: ${new Date().toISOString()}`,
    "----------------------------------------",
  ].join("\n");

  const body = logs.length
    ? logs
        .map(
          (l) =>
            `${l.timestamp}  ${l.action}${l.stopName ? `  (${l.stopName})` : ""}`,
        )
        .join("\n")
    : "(no log entries)";

  await Share.share(
    { title, message: `${header}\n${body}` },
    { dialogTitle: title },
  );
}
