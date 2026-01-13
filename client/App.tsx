import React from "react";
import { StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/lib/theme-context";
import { DriverProvider } from "@/lib/driver-context";
import { PingPointColors } from "@/constants/theme";

const linking = {
  prefixes: [
    Linking.createURL("/"),
    "pingpoint://",
    "https://pingpoint.app",
  ],
  config: {
    screens: {
      Main: {
        screens: {
          Dashboard: "driver/:token",
        },
      },
    },
  },
};

export default function App() {
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
