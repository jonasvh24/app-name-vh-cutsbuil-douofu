
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
import { authenticatedGet, authenticatedPost, authenticatedDelete } from '@/utils/api';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { AppModal } from '@/components/LoadingButton';

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
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creditInfo, setCreditInfo] = useState<CreditInfo | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const { user, signOut } = useAuth();

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalButtons, setModalButtons] = useState<any[]>([]);

  const showModal = (title: string, message: string, buttons?: any[]) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalButtons(buttons || [{ text: 'OK', onPress: () => setModalVisible(false), style: 'default' }]);
    setModalVisible(true);
  };

  useEffect(() => {
    fetchConnections();
    fetchCredits();
  }, []);

  const fetchCredits = async () => {
    try {
      console.log('[API] Fetching credits...');
      const data = await authenticatedGet<CreditInfo>('/api/user/credits');
      setCreditInfo(data);
      console.log('[API] Credits fetched:', data);
    } catch (error: any) {
      console.error('[API] Failed to fetch credits:', error.message);
    }
  };

  const fetchConnections = async () => {
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
      setLoading(false);
    }
  };

  const handleConnect = async (platform: string) => {
    try {
      console.log(`[API] Connecting to ${platform}...`);
      const data = await authenticatedPost<{ success: boolean; authUrl?: string }>(
        '/api/social/connect',
        { platform }
      );
      if (data.authUrl) {
        showModal('Connect Account', `Please visit: ${data.authUrl}`);
      }
      await fetchConnections();
    } catch (error: any) {
      showModal('Connection Failed', error.message || `Failed to connect to ${platform}`);
    }
  };

  const handleDisconnect = async (platform: string) => {
    try {
      console.log(`[API] Disconnecting from ${platform}...`);
      await authenticatedDelete(`/api/social/disconnect/${platform}`);
      await fetchConnections();
      showModal('Disconnected', `Successfully disconnected from ${platform}`);
    } catch (error: any) {
      showModal('Disconnect Failed', error.message || `Failed to disconnect from ${platform}`);
    }
  };

  const handleSubscribe = async (plan: 'monthly' | 'yearly') => {
    setSubscribing(true);
    try {
      console.log(`[API] Creating checkout session for ${plan} plan...`);
      const data = await authenticatedPost<{ checkoutUrl: string; sessionId: string }>(
        '/api/subscriptions/create-checkout',
        { plan }
      );
      if (data.checkoutUrl) {
        console.log('[API] Checkout URL received, opening browser...');
        const canOpen = await Linking.canOpenURL(data.checkoutUrl);
        if (canOpen) {
          await Linking.openURL(data.checkoutUrl);
          showModal(
            '🔗 Payment Page Opened',
            'Complete your payment in the browser. Your subscription will activate automatically after payment.',
            [
              {
                text: 'Refresh Status',
                onPress: async () => {
                  setModalVisible(false);
                  await fetchCredits();
                },
                style: 'default',
              },
              { text: 'OK', onPress: () => setModalVisible(false), style: 'cancel' },
            ]
          );
        } else {
          showModal(
            '💳 Complete Payment',
            `Please visit this URL to complete your payment:\n\n${data.checkoutUrl}`,
            [{ text: 'OK', onPress: () => setModalVisible(false), style: 'default' }]
          );
        }
      } else {
        showModal('✅ Success', `Successfully subscribed to ${plan} plan!`);
        await fetchCredits();
      }
    } catch (error: any) {
      showModal('Subscription Failed', error.message || 'Failed to start subscription process');
    } finally {
      setSubscribing(false);
    }
  };

  const handleSignOut = () => {
    showModal(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          onPress: () => setModalVisible(false),
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          onPress: async () => {
            setModalVisible(false);
            try {
              await signOut();
            } catch (error) {
              console.error('[Auth] Sign out error:', error);
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  // Check if subscription is truly active (not expired)
  const hasActiveSubscription = creditInfo
    ? (creditInfo.subscriptionStatus === 'monthly' || creditInfo.subscriptionStatus === 'yearly') &&
      creditInfo.subscriptionEndDate !== null &&
      new Date(creditInfo.subscriptionEndDate) > new Date()
    : false;

  const subscriptionStatusText = !hasActiveSubscription
    ? 'Free Plan'
    : creditInfo?.subscriptionStatus === 'monthly'
    ? '✨ Monthly Subscription'
    : '⭐ Yearly Subscription';

  const subscriptionStatusEmoji = !hasActiveSubscription ? '🆓' : creditInfo?.subscriptionStatus === 'yearly' ? '⭐' : '✨';

  const creditsText = !hasActiveSubscription
    ? `${creditInfo?.credits ?? 0} free edit${(creditInfo?.credits ?? 0) !== 1 ? 's' : ''} remaining`
    : '∞ Unlimited edits';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>

        {user && (
          <View style={styles.userCard}>
            <View style={styles.userInfo}>
              <View style={styles.avatarPlaceholder}>
                <IconSymbol
                  ios_icon_name="person.fill"
                  android_material_icon_name="person"
                  size={40}
                  color={colors.primary}
                />
              </View>
              <View style={styles.userDetails}>
                <Text style={styles.userName}>{user.name || 'User'}</Text>
                <Text style={styles.userEmail}>{user.email}</Text>
              </View>
            </View>
          </View>
        )}

        {creditInfo && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Credits & Subscription</Text>

            <View style={[
              styles.creditCard,
              hasActiveSubscription && creditInfo.subscriptionStatus === 'yearly'
                ? styles.creditCardYearly
                : hasActiveSubscription
                ? styles.creditCardPremium
                : styles.creditCardFree
            ]}>
              <View style={styles.creditHeader}>
                <Text style={[
                  styles.creditTitle,
                  hasActiveSubscription && creditInfo.subscriptionStatus === 'yearly' && styles.creditTitleYearly,
                ]}>
                  {subscriptionStatusText}
                </Text>
                {hasActiveSubscription && creditInfo.subscriptionEndDate && (
                  <Text style={styles.creditExpiry}>
                    Active until: {new Date(creditInfo.subscriptionEndDate).toLocaleDateString()}
                  </Text>
                )}
              </View>
              <Text style={[
                styles.creditAmount,
                hasActiveSubscription && styles.creditAmountUnlimited,
              ]}>{creditsText}</Text>

              {hasActiveSubscription && creditInfo.subscriptionStatus === 'yearly' && (
                <View style={styles.yearlyPerksContainer}>
                  <Text style={styles.yearlyPerksTitle}>Your Yearly Perks:</Text>
                  <Text style={styles.yearlyPerkItem}>⚡ Highest priority processing queue</Text>
                  <Text style={styles.yearlyPerkItem}>🎁 Early access to new features</Text>
                  <Text style={styles.yearlyPerkItem}>💬 Priority customer support</Text>
                  <Text style={styles.yearlyPerkItem}>🎨 Exclusive templates & effects</Text>
                  <Text style={styles.yearlyPerkItem}>📊 Advanced analytics dashboard</Text>
                  <Text style={styles.yearlyPerkItem}>📤 Direct social media posting</Text>
                </View>
              )}

              {hasActiveSubscription && creditInfo.subscriptionStatus === 'monthly' && (
                <View style={styles.monthlyPerksContainer}>
                  <Text style={styles.monthlyPerkItem}>🎬 Priority processing</Text>
                  <Text style={styles.monthlyPerkItem}>📤 Direct social media posting</Text>
                </View>
              )}

              {hasActiveSubscription && (
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    showModal(
                      'Cancel Subscription',
                      'Your subscription will remain active until the end of the billing period. Are you sure?',
                      [
                        { text: 'Keep Subscription', onPress: () => setModalVisible(false), style: 'cancel' },
                        {
                          text: 'Cancel Subscription',
                          onPress: async () => {
                            setModalVisible(false);
                            try {
                              console.log('[API] Canceling subscription...');
                              const result = await authenticatedPost<{ success: boolean; message: string }>(
                                '/api/subscriptions/cancel',
                                {}
                              );
                              showModal('Subscription Cancelled', result.message || 'Your subscription has been cancelled.');
                              await fetchCredits();
                            } catch (error: any) {
                              showModal('Error', error.message || 'Failed to cancel subscription.');
                            }
                          },
                          style: 'destructive',
                        },
                      ]
                    );
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
                </TouchableOpacity>
              )}
            </View>

            {!hasActiveSubscription && (
              <View style={styles.subscriptionOptions}>
                <Text style={styles.upgradeTitle}>🚀 Upgrade for Unlimited Edits</Text>

                <TouchableOpacity
                  style={styles.planCard}
                  onPress={() => handleSubscribe('monthly')}
                  disabled={subscribing}
                >
                  <View style={styles.planHeader}>
                    <Text style={styles.planName}>Monthly Plan</Text>
                    <Text style={styles.planPrice}>€5/month</Text>
                  </View>
                  <Text style={styles.planFeatures}>♾️ Unlimited video edits</Text>
                  <Text style={styles.planFeatures}>🎬 Priority processing</Text>
                  <Text style={styles.planFeatures}>📤 Direct social media posting</Text>
                  {subscribing ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
                  ) : (
                    <View style={styles.planButton}>
                      <Text style={styles.planButtonText}>Subscribe Monthly</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.planCard, styles.planCardYearly]}
                  onPress={() => handleSubscribe('yearly')}
                  disabled={subscribing}
                >
                  <View style={styles.bestValueBadge}>
                    <Text style={styles.bestValueText}>⭐ BEST VALUE</Text>
                  </View>
                  <View style={styles.planHeader}>
                    <Text style={styles.planName}>Yearly Plan</Text>
                    <Text style={[styles.planPrice, { color: '#F59E0B' }]}>€50/year</Text>
                  </View>
                  <Text style={styles.planSavings}>💰 Save €10 per year!</Text>
                  <Text style={styles.planFeatures}>♾️ Unlimited video edits</Text>
                  <Text style={styles.planFeatures}>⚡ FASTEST priority processing</Text>
                  <Text style={styles.planFeatures}>📤 Direct social media posting</Text>
                  <Text style={styles.planFeatures}>🎁 Early access to new features</Text>
                  <Text style={styles.planFeatures}>💬 Priority customer support</Text>
                  <Text style={styles.planFeatures}>🎨 Exclusive templates & effects</Text>
                  <Text style={styles.planFeatures}>📊 Advanced analytics dashboard</Text>
                  {subscribing ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
                  ) : (
                    <View style={[styles.planButton, styles.planButtonYearly]}>
                      <Text style={styles.planButtonText}>Subscribe Yearly — Best Deal</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Social Media Connections</Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
          ) : (
            connections.map((connection) => (
              <View key={connection.platform} style={styles.connectionCard}>
                <View style={styles.connectionInfo}>
                  <IconSymbol
                    ios_icon_name={connection.platform === 'tiktok' ? 'music.note' : 'play.rectangle.fill'}
                    android_material_icon_name={connection.platform === 'tiktok' ? 'music-note' : 'play-arrow'}
                    size={28}
                    color={connection.connected ? colors.success : colors.textMuted}
                  />
                  <View style={styles.connectionDetails}>
                    <Text style={styles.connectionName}>
                      {connection.platform === 'tiktok' ? 'TikTok' : 'YouTube'}
                    </Text>
                    <Text style={styles.connectionStatus}>
                      {connection.connected ? 'Connected ✓' : 'Not connected'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.connectionButton,
                    connection.connected && styles.connectionButtonDisconnect,
                  ]}
                  onPress={() =>
                    connection.connected
                      ? handleDisconnect(connection.platform)
                      : handleConnect(connection.platform)
                  }
                >
                  <Text
                    style={[
                      styles.connectionButtonText,
                      connection.connected && styles.connectionButtonTextDisconnect,
                    ]}
                  >
                    {connection.connected ? 'Disconnect' : 'Connect'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <IconSymbol
              ios_icon_name="arrow.right.square"
              android_material_icon_name="logout"
              size={20}
              color={colors.error}
            />
            <Text style={styles.signOutText}>Sign Out</Text>
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
    paddingBottom: 120,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
  },
  userCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
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
    marginBottom: 20,
    borderWidth: 2,
  },
  creditCardFree: {
    backgroundColor: colors.warning + '15',
    borderColor: colors.warning + '40',
  },
  creditCardPremium: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary + '60',
  },
  creditCardYearly: {
    backgroundColor: '#F59E0B20',
    borderColor: '#F59E0B60',
  },
  creditHeader: {
    marginBottom: 12,
  },
  creditTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  creditTitleYearly: {
    color: '#F59E0B',
  },
  creditExpiry: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  creditAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  creditAmountUnlimited: {
    color: colors.primary,
    fontSize: 28,
  },
  yearlyPerksContainer: {
    backgroundColor: '#F59E0B10',
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F59E0B30',
    gap: 6,
  },
  yearlyPerksTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F59E0B',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  yearlyPerkItem: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  monthlyPerksContainer: {
    backgroundColor: colors.primary + '10',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    gap: 4,
  },
  monthlyPerkItem: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  cancelButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.error + '50',
    marginTop: 4,
  },
  cancelButtonText: {
    fontSize: 13,
    color: colors.error,
    fontWeight: '500',
  },
  subscriptionOptions: {
    gap: 16,
  },
  upgradeTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  planCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: colors.border,
    position: 'relative',
  },
  planCardYearly: {
    borderColor: '#F59E0B',
    backgroundColor: '#F59E0B08',
  },
  bestValueBadge: {
    position: 'absolute',
    top: -12,
    right: 16,
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  bestValueText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#000',
    letterSpacing: 0.5,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  planPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
  },
  planSavings: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.success,
    marginBottom: 12,
  },
  planFeatures: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 6,
    lineHeight: 20,
  },
  planButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  planButtonYearly: {
    backgroundColor: '#F59E0B',
  },
  planButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
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
  connectionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  connectionDetails: {
    marginLeft: 16,
    flex: 1,
  },
  connectionName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  connectionStatus: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  connectionButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  connectionButtonDisconnect: {
    backgroundColor: colors.border,
  },
  connectionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  connectionButtonTextDisconnect: {
    color: colors.textSecondary,
  },
  signOutButton: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.error + '40',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
  },
});
