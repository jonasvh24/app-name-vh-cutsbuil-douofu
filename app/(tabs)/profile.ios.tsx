
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { AppModal } from '@/components/LoadingButton';
import { authenticatedGet, authenticatedPost, authenticatedDelete } from '@/utils/api';
import { useRouter } from 'expo-router';

interface SocialConnection {
  platform: string;
  connected: boolean;
}

interface CreditInfo {
  credits: number;
  subscriptionStatus: 'free' | 'monthly' | 'yearly';
  subscriptionEndDate: string | null;
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [connections, setConnections] = useState<SocialConnection[]>([
    { platform: 'tiktok', connected: false },
    { platform: 'youtube', connected: false },
  ]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [disconnectingPlatform, setDisconnectingPlatform] = useState<string | null>(null);
  const [creditInfo, setCreditInfo] = useState<CreditInfo | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalButtons, setModalButtons] = useState<any[]>([]);

  const [signOutModalVisible, setSignOutModalVisible] = useState(false);

  const showModal = (title: string, message: string, buttons?: any[]) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalButtons(buttons || [{ text: 'OK', onPress: () => setModalVisible(false), style: 'default' }]);
    setModalVisible(true);
  };

  const fetchCredits = async () => {
    setLoadingCredits(true);
    try {
      console.log('[Profile] Fetching credits...');
      const data = await authenticatedGet<CreditInfo>('/api/user/credits');
      setCreditInfo(data);
      console.log('[Profile] Credits fetched:', data);
    } catch (error: any) {
      console.error('[Profile] Failed to fetch credits:', error.message);
    } finally {
      setLoadingCredits(false);
    }
  };

  const fetchConnections = useCallback(async () => {
    setLoadingConnections(true);
    try {
      console.log('[Profile] Fetching social connections...');
      const data = await authenticatedGet<SocialConnection[]>('/api/social/connections');
      console.log('[Profile] Connections fetched:', data);
      const tiktok = data.find((c) => c.platform === 'tiktok') || { platform: 'tiktok', connected: false };
      const youtube = data.find((c) => c.platform === 'youtube') || { platform: 'youtube', connected: false };
      setConnections([tiktok, youtube]);
    } catch (error: any) {
      console.error('[Profile] Failed to fetch connections:', error.message);
      setConnections([
        { platform: 'tiktok', connected: false },
        { platform: 'youtube', connected: false },
      ]);
    } finally {
      setLoadingConnections(false);
    }
  }, []);

  useEffect(() => {
    fetchCredits();
    fetchConnections();
  }, [fetchConnections]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', () => {
      console.log('[Profile] Deep link received, refreshing connections...');
      setTimeout(() => fetchConnections(), 1000);
    });
    return () => subscription.remove();
  }, [fetchConnections]);

  const handleConnect = async (platform: string) => {
    console.log(`[Profile] User tapped Connect button for platform: ${platform}`);
    setConnectingPlatform(platform);
    try {
      const endpoint = `/api/social/connect/${platform}`;
      console.log(`[Profile] Calling endpoint: ${endpoint}`);
      const data = await authenticatedPost<{ authUrl: string }>(endpoint, {});
      console.log(`[Profile] Received auth URL for ${platform}:`, data.authUrl);

      if (!data.authUrl) {
        throw new Error(`No authorization URL returned for ${platform}`);
      }

      const canOpen = await Linking.canOpenURL(data.authUrl);
      if (canOpen) {
        console.log(`[Profile] Opening auth URL for ${platform}`);
        await Linking.openURL(data.authUrl);
        const platformDisplayName = platform === 'tiktok' ? 'TikTok' : 'YouTube';
        showModal(
          'Authorization Opened',
          `Complete the ${platformDisplayName} authorization in your browser. Once done, return here and tap "Refresh" to update your connection status.`,
          [
            {
              text: 'Refresh',
              onPress: () => {
                setModalVisible(false);
                fetchConnections();
              },
              style: 'default',
            },
            {
              text: 'Later',
              onPress: () => setModalVisible(false),
              style: 'cancel',
            },
          ]
        );
      } else {
        const platformDisplayName = platform === 'tiktok' ? 'TikTok' : 'YouTube';
        showModal('Cannot Open Link', `Unable to open the authorization URL for ${platformDisplayName}. Please try again.`);
      }
    } catch (error: any) {
      console.error(`[Profile] Failed to connect ${platform}:`, error);
      console.error(`[Profile] Error details:`, error.message, error.response);
      const platformDisplayName = platform === 'tiktok' ? 'TikTok' : 'YouTube';
      let errorMsg = error.message || `Failed to connect to ${platformDisplayName}. Please try again.`;
      if (errorMsg.includes('401') || errorMsg.includes('Authentication')) {
        errorMsg = 'Please sign in again to connect your social accounts.';
      } else if (errorMsg.includes('400')) {
        errorMsg = 'Invalid platform. Only TikTok and YouTube are supported.';
      } else if (errorMsg.includes('404')) {
        errorMsg = 'The social connection endpoint is not available. Please contact support.';
      } else if (errorMsg.includes('500')) {
        errorMsg = `The ${platformDisplayName} connection service is temporarily unavailable. Please try again later.`;
      }
      showModal('Connection Failed', errorMsg);
    } finally {
      setConnectingPlatform(null);
    }
  };

  const handleDisconnect = async (platform: string) => {
    console.log(`[Profile] User tapped Disconnect button for platform: ${platform}`);
    const platformDisplayName = platform === 'tiktok' ? 'TikTok' : 'YouTube';
    showModal(
      `Disconnect ${platformDisplayName}`,
      `Are you sure you want to disconnect your ${platformDisplayName} account?`,
      [
        {
          text: 'Cancel',
          onPress: () => setModalVisible(false),
          style: 'cancel',
        },
        {
          text: 'Disconnect',
          onPress: async () => {
            setModalVisible(false);
            setDisconnectingPlatform(platform);
            try {
              const endpoint = `/api/social/disconnect/${platform}`;
              console.log(`[Profile] Calling endpoint: ${endpoint}`);
              await authenticatedDelete(endpoint);
              console.log(`[Profile] ${platform} disconnected successfully`);
              setConnections((prev) =>
                prev.map((c) => (c.platform === platform ? { ...c, connected: false } : c))
              );
              showModal('Disconnected', `Your ${platformDisplayName} account has been disconnected.`);
            } catch (error: any) {
              console.error(`[Profile] Failed to disconnect ${platform}:`, error);
              let errorMsg = error.message || `Failed to disconnect ${platformDisplayName}. Please try again.`;
              if (errorMsg.includes('404')) {
                errorMsg = `Your ${platformDisplayName} account is not connected.`;
                fetchConnections();
              }
              showModal('Error', errorMsg);
            } finally {
              setDisconnectingPlatform(null);
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const handleSubscribe = (plan: 'monthly' | 'yearly') => {
    console.log(`[Profile] User tapped Subscribe to ${plan}`);
    router.push('/payment');
  };

  const handleSignOut = () => {
    setSignOutModalVisible(true);
  };

  const confirmSignOut = async () => {
    console.log('[Profile] User confirmed sign out');
    setSignOutModalVisible(false);
    try {
      await signOut();
      console.log('[Profile] User signed out successfully');
    } catch (error: any) {
      console.error('[Profile] Sign out error:', error);
      showModal('Error', 'Failed to sign out. Please try again.');
    }
  };

  const hasActiveSubscription = creditInfo
    ? (creditInfo.subscriptionStatus === 'monthly' || creditInfo.subscriptionStatus === 'yearly') &&
      creditInfo.subscriptionEndDate !== null &&
      new Date(creditInfo.subscriptionEndDate) > new Date()
    : false;

  const isSubscribed = hasActiveSubscription;
  const infiniteSymbol = '∞';
  const creditsDisplay = isSubscribed ? `${infiniteSymbol} Unlimited edits` : `${creditInfo?.credits || 0} free edits remaining`;

  const userName = user?.name || 'User';
  const userEmail = user?.email || '';

  const yearlyEmoji = '⭐';
  const monthlyEmoji = '✨';
  const freeEmoji = '⚡';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            <IconSymbol ios_icon_name="person.circle.fill" android_material_icon_name="account-circle" size={80} color={colors.primary} />
          </View>
          <Text style={styles.userName}>{userName}</Text>
          <Text style={styles.userEmail}>{userEmail}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Credits & Subscription</Text>
          {loadingCredits ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : (
            <>
              <View
                style={[
                  styles.creditCard,
                  isSubscribed && creditInfo?.subscriptionStatus === 'yearly'
                    ? styles.creditCardYearly
                    : isSubscribed
                    ? styles.creditCardSubscribed
                    : styles.creditCardFree,
                ]}
              >
                <View style={styles.creditCardHeader}>
                  <Text style={styles.creditCardEmoji}>
                    {isSubscribed && creditInfo?.subscriptionStatus === 'yearly' ? yearlyEmoji : isSubscribed ? monthlyEmoji : freeEmoji}
                  </Text>
                  <View style={styles.creditCardInfo}>
                    <Text style={styles.creditCardTitle}>
                      {isSubscribed
                        ? creditInfo?.subscriptionStatus === 'yearly'
                          ? 'Yearly Subscriber'
                          : 'Monthly Subscriber'
                        : 'Free Plan'}
                    </Text>
                    <Text style={styles.creditCardCredits}>{creditsDisplay}</Text>
                  </View>
                </View>
                {isSubscribed && creditInfo?.subscriptionEndDate && (
                  <Text style={styles.creditCardExpiry}>
                    Active until {new Date(creditInfo.subscriptionEndDate).toLocaleDateString()}
                  </Text>
                )}
              </View>

              {!isSubscribed && (
                <View style={styles.upgradeSection}>
                  <Text style={styles.upgradeTitle}>Upgrade for Unlimited Edits</Text>

                  <TouchableOpacity
                    style={[styles.subscriptionCard, styles.subscriptionCardMonthly]}
                    onPress={() => handleSubscribe('monthly')}
                    activeOpacity={0.8}
                  >
                    <View style={styles.subscriptionHeader}>
                      <Text style={styles.subscriptionEmoji}>{monthlyEmoji}</Text>
                      <View style={styles.subscriptionInfo}>
                        <Text style={styles.subscriptionName}>Monthly Plan</Text>
                        <Text style={styles.subscriptionPrice}>€5/month</Text>
                      </View>
                    </View>
                    <View style={styles.subscriptionPerks}>
                      <Text style={styles.perkText}>• Unlimited video edits</Text>
                      <Text style={styles.perkText}>• Priority processing</Text>
                      <Text style={styles.perkText}>• Direct social media posting</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.subscriptionCard, styles.subscriptionCardYearly]}
                    onPress={() => handleSubscribe('yearly')}
                    activeOpacity={0.8}
                  >
                    <View style={styles.bestValueBadge}>
                      <Text style={styles.bestValueText}>BEST VALUE</Text>
                    </View>
                    <View style={styles.subscriptionHeader}>
                      <Text style={styles.subscriptionEmoji}>{yearlyEmoji}</Text>
                      <View style={styles.subscriptionInfo}>
                        <Text style={styles.subscriptionName}>Yearly Plan</Text>
                        <Text style={styles.subscriptionPrice}>€50/year</Text>
                      </View>
                    </View>
                    <View style={styles.subscriptionPerks}>
                      <Text style={styles.perkText}>• Unlimited video edits</Text>
                      <Text style={styles.perkText}>• Highest priority processing</Text>
                      <Text style={styles.perkText}>• Direct social media posting</Text>
                      <Text style={styles.perkText}>• Early access to new features</Text>
                      <Text style={styles.perkText}>• Exclusive templates & effects</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Social Media Connections</Text>
            <TouchableOpacity
              onPress={fetchConnections}
              disabled={loadingConnections}
              style={styles.refreshButton}
            >
              {loadingConnections ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <IconSymbol
                  ios_icon_name="arrow.clockwise"
                  android_material_icon_name="refresh"
                  size={18}
                  color={colors.primary}
                />
              )}
            </TouchableOpacity>
          </View>
          {connections.map((conn) => {
            const platformName = conn.platform === 'tiktok' ? 'TikTok' : 'YouTube';
            const checkmark = '✓';
            const statusText = conn.connected ? `${checkmark} Connected` : 'Not connected';
            const isConnecting = connectingPlatform === conn.platform;
            const isDisconnecting = disconnectingPlatform === conn.platform;
            const isLoading = isConnecting || isDisconnecting;

            return (
              <View key={conn.platform} style={styles.connectionCard}>
                <View style={styles.connectionInfo}>
                  <IconSymbol
                    ios_icon_name={conn.platform === 'tiktok' ? 'music.note' : 'play.rectangle.fill'}
                    android_material_icon_name={conn.platform === 'tiktok' ? 'music-note' : 'play-arrow'}
                    size={32}
                    color={conn.connected ? colors.success : colors.textMuted}
                  />
                  <View style={styles.connectionText}>
                    <Text style={styles.connectionPlatform}>{platformName}</Text>
                    <Text style={[styles.connectionStatus, conn.connected && styles.connectionStatusConnected]}>
                      {statusText}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.connectionButton,
                    conn.connected && styles.connectionButtonDisconnect,
                    isLoading && styles.connectionButtonLoading,
                  ]}
                  onPress={() => (conn.connected ? handleDisconnect(conn.platform) : handleConnect(conn.platform))}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <Text style={styles.connectionButtonText}>
                      {conn.connected ? 'Disconnect' : 'Connect'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <IconSymbol ios_icon_name="arrow.right.square.fill" android_material_icon_name="logout" size={20} color={colors.error} />
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <AppModal
        visible={modalVisible}
        title={modalTitle}
        message={modalMessage}
        onClose={() => setModalVisible(false)}
        buttons={modalButtons}
      />

      <AppModal
        visible={signOutModalVisible}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        onClose={() => setSignOutModalVisible(false)}
        buttons={[
          {
            text: 'Cancel',
            onPress: () => setSignOutModalVisible(false),
            style: 'cancel',
          },
          {
            text: 'Sign Out',
            onPress: confirmSignOut,
            style: 'destructive',
          },
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  refreshButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    marginBottom: 16,
  },
  creditCardFree: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  creditCardSubscribed: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary + '60',
  },
  creditCardYearly: {
    backgroundColor: '#F59E0B15',
    borderColor: '#F59E0B60',
  },
  creditCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  creditCardEmoji: {
    fontSize: 32,
  },
  creditCardInfo: {
    flex: 1,
  },
  creditCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  creditCardCredits: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
  },
  creditCardExpiry: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 12,
  },
  upgradeSection: {
    gap: 12,
  },
  upgradeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  subscriptionCard: {
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    position: 'relative',
  },
  subscriptionCardMonthly: {
    backgroundColor: colors.primary + '10',
    borderColor: colors.primary + '60',
  },
  subscriptionCardYearly: {
    backgroundColor: '#F59E0B10',
    borderColor: '#F59E0B60',
  },
  bestValueBadge: {
    position: 'absolute',
    top: -8,
    right: 16,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bestValueText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.text,
    letterSpacing: 0.5,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  subscriptionEmoji: {
    fontSize: 28,
  },
  subscriptionInfo: {
    flex: 1,
  },
  subscriptionName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  subscriptionPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
    marginTop: 2,
  },
  subscriptionPerks: {
    gap: 4,
  },
  perkText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  connectionCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connectionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  connectionText: {
    flex: 1,
  },
  connectionPlatform: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  connectionStatus: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  connectionStatusConnected: {
    color: colors.success,
  },
  connectionButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  connectionButtonDisconnect: {
    backgroundColor: colors.error,
  },
  connectionButtonLoading: {
    opacity: 0.7,
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
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.error + '40',
  },
  signOutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
  },
});
