import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { NavigatorScreenParams } from "@react-navigation/native";
import DrawerNavigator, { DrawerParamList } from "@/navigation/DrawerNavigator";
import { PingPointColors } from "@/constants/theme";

export type RootStackParamList = {
  Main: NavigatorScreenParams<DrawerParamList>;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: PingPointColors.background },
      }}
    >
      <Stack.Screen name="Main" component={DrawerNavigator} />
    </Stack.Navigator>
  );
}
