import { Platform } from 'react-native';
import { Stack } from 'expo-router';

export default function HomeLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: Platform.OS === 'ios',
          title: 'VH Cuts',
        }}
      />
      <Stack.Screen
        name="project"
        options={{
          headerShown: true,
          title: 'Project',
          headerStyle: { backgroundColor: '#0A0A0F' },
          headerTintColor: '#FFFFFF',
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}
