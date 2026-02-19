
import React from 'react';
import FloatingTabBar from '@/components/FloatingTabBar';
import { Stack } from 'expo-router';

export default function TabLayout() {
  const tabs = [
    {
      name: 'Home',
      label: 'Home',
      route: '/(tabs)/(home)',
      icon: 'home' as const,
    },
    {
      name: 'Account',
      label: 'Account',
      route: '/(tabs)/profile',
      icon: 'person' as const,
    },
  ];

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(home)" />
        <Stack.Screen name="profile" />
      </Stack>
      <FloatingTabBar tabs={tabs} />
    </>
  );
}
