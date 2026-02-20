
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
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
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
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
      console.log('[API] Fetching credits...');
      const data = await authenticatedGet<CreditInfo>('/api/user/credits');
      setCreditInfo(data);
      console.log('[API] Credits fetched:', data);
    } catch (error: any) {
      console.error('[API] Failed to fetch credits:', error.message);
    } finally {
      setLoadingCredits(false);
    }
  };

  const fetchConnections = async () => {
    setLoadingConnections(true);
    try {
      console.log('[API] Fetching social connections...');
      const data = await authenticatedGet<SocialConnection[]>('/api/social/connections');
      setConnections(data);
      console.log('[API] Connections fetched:', data);
    } catch (error: any) {
      console.error('[API] Failed to fetch connections:', error.message);
      setConnections([
        { platform: 'tiktok', connected: false },
        { platform: 'youtube', connected: false },
      ]);
    } finally {
      setLoadingConnections(false);
    }
  };

  useEffect(() => {
    fetchCredits();
    fetchConnections();
  }, []);

  const handleConnect = async (platform: string) => {
    console.log(`User tapped Connect ${platform}`);
    try {
      const data = await authenticatedPost<{ authUrl: string }>(`/api/social/connect/${platform}`, {});
      console.log(`[API] Opening ${platform} auth URL:`, data.authUrl);
      await Linking.openURL(data.authUrl);
      showModal('Redirected', `Complete the ${platform} authorization in your browser.`);
    } catch (error: any) {
      console.error(`[API] Failed to connect ${platform}:`, error.message);
      showModal('Connection Failed', error.message || `Failed to connect to ${platform}.`);
    }
  };

  const handleDisconnect = async (platform: string) => {
    console.log(`User tapped Disconnect ${platform}`);
    try {
      await authenticatedDelete(`/api/social/disconnect/${platform}`);
      showModal('Disconnected', `${platform} has been disconnected.`);
      fetchConnections();
    } catch (error: any) {
      console.error(`[API] Failed to disconnect ${platform}:`, error.message);
      showModal('Error', error.message || `Failed to disconnect ${platform}.`);
    }
  };

  const handleSubscribe = (plan: 'monthly' | 'yearly') => {
    console.log(`User tapped Subscribe to ${plan}`);
    router.push('/payment');
  };

  const handleSignOut = () => {
    setSignOutModalVisible(true);
  };

  const confirmSignOut = async () => {
    console.log('User confirmed sign out');
    setSignOutModalVisible(false);
    try {
      await signOut();
      console.log('User signed out successfully');
    } catch (error: any) {
      console.error('Sign out error:', error);
      showModal('Error', 'Failed to sign out. Please try again.');
    }
  };

  const hasActiveSubscription = creditInfo
    ? (creditInfo.subscriptionStatus === 'monthly' || creditInfo.subscriptionStatus === 'yearly') &&
      creditInfo.subscriptionEndDate !== null &&
      new Date(creditInfo.subscriptionEndDate) > new Date()
    : false;

  const isSubscribed = hasActiveSubscription;
  const creditsDisplay = isSubscribed ? '∞ Unlimited edits' : `${creditInfo?.credits || 0} free edits remaining`;

  const userName = user?.name || 'User';
  const userEmail = user?.email || '';

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
                    {isSubscribed && creditInfo?.subscriptionStatus === 'yearly' ? '⭐' : isSubscribed ? '✨' : '⚡'}
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
                      <Text style={styles.subscriptionEmoji}>✨</Text>
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
                      <Text style={styles.subscriptionEmoji}>⭐</Text>
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
          <Text style={styles.sectionTitle}>Social Media Connections</Text>
          {loadingConnections ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : (
            connections.map((conn) => (
              <View key={conn.platform} style={styles.connectionCard}>
                <View style={styles.connectionInfo}>
                  <IconSymbol
                    ios_icon_name={conn.platform === 'tiktok' ? 'music.note' : 'play.rectangle.fill'}
                    android_material_icon_name={conn.platform === 'tiktok' ? 'music-note' : 'play-arrow'}
                    size={32}
                    color={conn.connected ? colors.success : colors.textMuted}
                  />
                  <View style={styles.connectionText}>
                    <Text style={styles.connectionPlatform}>{conn.platform === 'tiktok' ? 'TikTok' : 'YouTube'}</Text>
                    <Text style={styles.connectionStatus}>
                      {conn.connected ? '✓ Connected' : 'Not connected'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.connectionButton, conn.connected && styles.connectionButtonDisconnect]}
                  onPress={() => (conn.connected ? handleDisconnect(conn.platform) : handleConnect(conn.platform))}
                >
                  <Text style={styles.connectionButtonText}>{conn.connected ? 'Disconnect' : 'Connect'}</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
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
    textTransform: 'capitalize',
  },
  connectionStatus: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  connectionButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  connectionButtonDisconnect: {
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
