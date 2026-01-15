import React from "react";
import { StyleSheet } from "react-native";
import { NavigationContainer, LinkingOptions } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import RootStackNavigator, { RootStackParamList } from "@/navigation/RootStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/lib/theme-context";
import { DriverProvider } from "@/lib/driver-context";
import { PingPointColors } from "@/constants/theme";

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    Linking.createURL("/"),
    "pingpoint://",
    "https://pingpoint.app",
    "https://pingpoint.suverse.io",
  ],
  config: {
    screens: {
      Main: {
        screens: {
          Dashboard: {
            path: "driver/:token",
            parse: {
              token: (token: string) => token,
            },
            stringify: {
              token: (token: string) => token,
            },
          },
          LoadDetails: {
            path: "loads/:loadId",
            parse: {
              loadId: (loadId: string) => loadId,
            },
            stringify: {
              loadId: (loadId: string) => loadId,
            },
          },
        },
      },
    },
  },
};

export default function App() {
  React.useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      console.log("[App] Deep link received:", event.url);
    };

    const listener = Linking.addEventListener("url", handleDeepLink);

    return () => {
      listener.remove();
    };
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <DriverProvider>
          <QueryClientProvider client={queryClient}>
            <SafeAreaProvider>
              <GestureHandlerRootView style={styles.root}>
                <KeyboardProvider>
                  <NavigationContainer linking={linking}>
                    <RootStackNavigator />
                  </NavigationContainer>
                  <StatusBar style="light" />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </SafeAreaProvider>
          </QueryClientProvider>
        </DriverProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PingPointColors.background,
  },
});
