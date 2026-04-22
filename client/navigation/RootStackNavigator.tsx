import React, { useState, useEffect } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { NavigatorScreenParams } from "@react-navigation/native";
import DrawerNavigator, { DrawerParamList } from "@/navigation/DrawerNavigator";
import TruckSetupScreen from "@/screens/TruckSetupScreen";
import { PingPointColors } from "@/constants/theme";
import { getTruckSetupComplete } from "@/lib/storage";
import { View, ActivityIndicator } from "react-native";

export type RootStackParamList = {
  TruckSetup: undefined;
  Main: NavigatorScreenParams<DrawerParamList>;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);

  useEffect(() => {
    checkSetup();
  }, []);

  const checkSetup = async () => {
    const complete = await getTruckSetupComplete();
    setSetupComplete(complete);
  };

  // Показываем загрузку пока проверяем AsyncStorage
  if (setupComplete === null) {
    return (
      <View style={{ flex: 1, backgroundColor: PingPointColors.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={PingPointColors.cyan} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName={setupComplete ? "Main" : "TruckSetup"}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: PingPointColors.background },
        animation: "fade",
      }}
    >
      <Stack.Screen name="TruckSetup">
        {(props) => (
          <TruckSetupScreen
            {...props}
            onComplete={() => {
              setSetupComplete(true);
              props.navigation.replace("Main");
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Main" component={DrawerNavigator} />
    </Stack.Navigator>
  );
}
