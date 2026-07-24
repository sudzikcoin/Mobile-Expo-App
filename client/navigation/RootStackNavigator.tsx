import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { NavigatorScreenParams } from "@react-navigation/native";
import DrawerNavigator, { DrawerParamList } from "@/navigation/DrawerNavigator";
import TruckSetupScreen from "@/screens/TruckSetupScreen";
import WaitingScreen from "@/screens/WaitingScreen";
import { PingPointColors } from "@/constants/theme";
import { useDriver } from "@/lib/driver-context";
import { View, ActivityIndicator } from "react-native";

export type RootStackParamList = {
  Waiting: undefined;
  TruckSetup: undefined;
  Main: NavigatorScreenParams<DrawerParamList>;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  // Binding state lives in DriverContext: true once a token is persisted
  // (link-based bind, deferred deep link, or the hidden legacy flow).
  const { isBound } = useDriver();

  // Показываем загрузку пока восстанавливаем сессию из AsyncStorage
  if (isBound === null) {
    return (
      <View style={{ flex: 1, backgroundColor: PingPointColors.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={PingPointColors.cyan} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName={isBound ? "Main" : "Waiting"}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: PingPointColors.background },
        animation: "fade",
      }}
    >
      <Stack.Screen name="Waiting" component={WaitingScreen} />
      {/* Legacy Select Company → Select Truck flow. Reachable ONLY through
          the hidden service entrance on the waiting screen (5 taps on the
          logo) — never the default onboarding path. */}
      <Stack.Screen name="TruckSetup">
        {(props) => (
          <TruckSetupScreen
            {...props}
            onComplete={() => {
              props.navigation.replace("Main");
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Main" component={DrawerNavigator} />
    </Stack.Navigator>
  );
}
