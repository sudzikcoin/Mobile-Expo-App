import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { NavigatorScreenParams } from "@react-navigation/native";
import { ActivityIndicator, View } from "react-native";
import DrawerNavigator, { DrawerParamList } from "@/navigation/DrawerNavigator";
import TruckSetupScreen from "@/screens/TruckSetupScreen";
import { PingPointColors } from "@/constants/theme";
import { useDriver } from "@/lib/driver-context";

export type RootStackParamList = {
  TruckSetup: undefined;
  Main: NavigatorScreenParams<DrawerParamList>;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const { truckSetupComplete } = useDriver();

  if (truckSetupComplete === null) {
    return (
      <View style={{ flex: 1, backgroundColor: PingPointColors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={PingPointColors.cyan} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: PingPointColors.background },
      }}
    >
      {!truckSetupComplete ? (
        <Stack.Screen name="TruckSetup" component={TruckSetupScreen} />
      ) : (
        <Stack.Screen name="Main" component={DrawerNavigator} />
      )}
    </Stack.Navigator>
  );
}
