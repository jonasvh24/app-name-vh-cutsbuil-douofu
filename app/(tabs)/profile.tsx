
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, Platform, TouchableOpacity, ActivityIndicator } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/styles/commonStyles';
import { authenticatedGet, authenticatedPost, authenticatedDelete } from '@/utils/api';

interface SocialConnection {
  platform: string;
  connected: boolean;
}

export default function ProfileScreen() {
  const theme = useTheme();
  const { user, signOut } = useAuth();
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      console.log('[API] Fetching social connections...');
      // TODO: Backend Integration - GET /api/social/connections → [{ platform, connected }]
      const data = await authenticatedGet<SocialConnection[]>('/api/social/connections');
      setConnections(data);
    } catch (error: any) {
      console.error('[API] Failed to fetch connections:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (platform: string) => {
    console.log(`User tapped Connect ${platform}`);
    // TODO: Backend Integration - POST /api/social/connect/:platform with { accessToken, refreshToken? } → { success, platform }
    // For now, show a placeholder message
    alert(`${platform} connection coming soon! This will open OAuth flow.`);
  };

  const handleDisconnect = async (platform: string) => {
    try {
      console.log(`User tapped Disconnect ${platform}`);
      // TODO: Backend Integration - DELETE /api/social/disconnect/:platform → { success }
      await authenticatedDelete(`/api/social/disconnect/${platform}`);
      await fetchConnections();
    } catch (error: any) {
      console.error('[API] Failed to disconnect:', error.message);
    }
  };

  const handleSignOut = async () => {
    console.log('User tapped Sign Out');
    await signOut();
  };

  const tiktokConnection = connections.find(c => c.platform === 'tiktok');
  const youtubeConnection = connections.find(c => c.platform === 'youtube');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            <IconSymbol
              ios_icon_name="person.circle.fill"
              android_material_icon_name="account-circle"
              size={80}
              color={colors.primary}
            />
          </View>
          <Text style={styles.name}>{user?.name || 'User'}</Text>
          <Text style={styles.email}>{user?.email || 'user@example.com'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Social Media Connections</Text>
          
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
          ) : (
            <>
              <GlassView style={styles.connectionCard} intensity={Platform.OS === 'ios' ? 20 : 0}>
                <View style={styles.connectionHeader}>
                  <IconSymbol
                    ios_icon_name="music.note"
                    android_material_icon_name="music-note"
                    size={32}
                    color={colors.text}
                  />
                  <View style={styles.connectionInfo}>
                    <Text style={styles.connectionName}>TikTok</Text>
                    <Text style={styles.connectionStatus}>
                      {tiktokConnection?.connected ? 'Connected ✓' : 'Not connected'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.connectionButton,
                    tiktokConnection?.connected && styles.disconnectButton,
                  ]}
                  onPress={() => tiktokConnection?.connected ? handleDisconnect('tiktok') : handleConnect('tiktok')}
                >
                  <Text style={styles.connectionButtonText}>
                    {tiktokConnection?.connected ? 'Disconnect' : 'Connect'}
                  </Text>
                </TouchableOpacity>
              </GlassView>

              <GlassView style={styles.connectionCard} intensity={Platform.OS === 'ios' ? 20 : 0}>
                <View style={styles.connectionHeader}>
                  <IconSymbol
                    ios_icon_name="play.rectangle.fill"
                    android_material_icon_name="play-arrow"
                    size={32}
                    color={colors.text}
                  />
                  <View style={styles.connectionInfo}>
                    <Text style={styles.connectionName}>YouTube</Text>
                    <Text style={styles.connectionStatus}>
                      {youtubeConnection?.connected ? 'Connected ✓' : 'Not connected'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.connectionButton,
                    youtubeConnection?.connected && styles.disconnectButton,
                  ]}
                  onPress={() => youtubeConnection?.connected ? handleDisconnect('youtube') : handleConnect('youtube')}
                >
                  <Text style={styles.connectionButtonText}>
                    {youtubeConnection?.connected ? 'Disconnect' : 'Connect'}
                  </Text>
                </TouchableOpacity>
              </GlassView>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <IconSymbol
              ios_icon_name="arrow.right.square"
              android_material_icon_name="logout"
              size={24}
              color={colors.error}
            />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 48 : 0,
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  connectionCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  connectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  connectionInfo: {
    marginLeft: 12,
    flex: 1,
  },
  connectionName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  connectionStatus: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  connectionButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  disconnectButton: {
    backgroundColor: colors.error,
  },
  connectionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  signOutButton: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.error,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
  },
});
