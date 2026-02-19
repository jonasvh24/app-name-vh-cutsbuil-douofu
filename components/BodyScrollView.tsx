
import React from 'react';
import { ScrollView, StyleSheet, ViewStyle } from 'react-native';

interface BodyScrollViewProps {
  children: React.ReactNode;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
}

export default function BodyScrollView({ children, style, contentContainerStyle }: BodyScrollViewProps) {
  return (
    <ScrollView
      style={[styles.container, style]}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
