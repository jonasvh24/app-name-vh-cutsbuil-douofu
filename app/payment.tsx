
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { AppModal } from '@/components/LoadingButton';
import { authenticatedPost } from '@/utils/api';

type PaymentMethod = 'card' | 'paypal' | 'iban';
type Plan = 'monthly' | 'yearly';

export default function PaymentScreen() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<Plan>('monthly');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('card');
  const [transactionRef, setTransactionRef] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showManualConfirm, setShowManualConfirm] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');

  const showModal = useCallback((title: string, message: string) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalVisible(true);
  }, []);

  const planPrice = selectedPlan === 'monthly' ? 5 : 50;

  const handlePayment = useCallback(async () => {
    console.log('[Payment] User initiated payment:', { plan: selectedPlan, method: selectedMethod });
    setProcessing(true);

    try {
      if (selectedMethod === 'card') {
        console.log('[Payment] Initiating card payment via /api/payments/initiate...');
        const data = await authenticatedPost<{
          success: boolean;
          paymentMethod: string;
          checkoutUrl?: string;
          sessionId?: string;
        }>('/api/payments/initiate', {
          plan: selectedPlan,
          paymentMethod: 'card',
        });
        console.log('[Payment] Card payment initiation response:', data);

        setProcessing(false);

        // The backend returns a mock Stripe URL since Stripe is not yet configured.
        // Real Stripe session IDs look like: cs_test_a1B2c3... or cs_live_a1B2c3...
        // Mock session IDs from the backend look like: cs_<random alphanumeric without underscore after cs_>
        const checkoutUrl = data.checkoutUrl || '';
        const isRealStripeSession =
          checkoutUrl.includes('cs_test_') || checkoutUrl.includes('cs_live_');

        if (!isRealStripeSession) {
          // Mock URL — Stripe is not configured on the backend
          console.log('[Payment] Mock Stripe URL detected, showing informational message');
          showModal(
            '⚠️ Card Payments Coming Soon',
            'Stripe card payment processing is not yet active.\n\nPlease use PayPal or Bank Transfer (IBAN) to subscribe. These payment methods are fully operational and your subscription will be activated within 24 hours.'
          );
          return;
        }

        // Real Stripe URL — open it
        console.log('[Payment] Opening real Stripe checkout URL...');
        const canOpen = await Linking.canOpenURL(checkoutUrl);
        if (!canOpen) {
          throw new Error('Cannot open checkout URL. Please try a different payment method.');
        }
        await Linking.openURL(checkoutUrl);
        showModal(
          'Redirected to Stripe',
          'Complete your payment in the browser. Your subscription will activate automatically once payment is confirmed.'
        );
      } else {
        // Manual payment methods (PayPal or IBAN)
        console.log('[Payment] Initiating manual payment...');
        const data = await authenticatedPost<{
          success: boolean;
          paymentMethod: string;
          paypalId?: string;
          iban?: string;
          amount: number;
          instructions: string;
        }>('/api/payments/initiate', {
          plan: selectedPlan,
          paymentMethod: selectedMethod,
        });

        console.log('[Payment] Manual payment initiated:', data);
        setProcessing(false);
        setShowManualConfirm(true);

        const instructionText = selectedMethod === 'paypal'
          ? `Send €${data.amount} to PayPal: ${data.paypalId}\n\nAfter payment, enter your transaction reference below to activate your subscription.`
          : `Transfer €${data.amount} to IBAN: ${data.iban}\n\nAfter payment, enter your transaction reference below to activate your subscription.`;

        showModal('Payment Instructions', instructionText);
      }
    } catch (error: any) {
      console.error('[Payment] Payment initiation failed:', error);
      setProcessing(false);
      const errorMessage = error.message || 'Failed to initiate payment. Please try again.';
      showModal('Payment Error', errorMessage);
    }
  }, [selectedPlan, selectedMethod, showModal]);

  const handleConfirmManualPayment = useCallback(async () => {
    if (!transactionRef.trim()) {
      showModal('Missing Reference', 'Please enter your transaction reference number.');
      return;
    }

    console.log('[Payment] Confirming manual payment:', { plan: selectedPlan, method: selectedMethod, ref: transactionRef });
    setProcessing(true);

    try {
      const data = await authenticatedPost<{
        success: boolean;
        subscriptionStatus: string;
        subscriptionEndDate: string;
      }>('/api/payments/confirm-manual', {
        plan: selectedPlan,
        paymentMethod: selectedMethod,
        transactionReference: transactionRef,
      });

      console.log('[Payment] Payment confirmed:', data);
      setProcessing(false);
      
      const planName = selectedPlan === 'monthly' ? 'Monthly' : 'Yearly';
      showModal('🎉 Subscription Activated!', `Your ${planName} subscription is now active. Enjoy unlimited video edits!`);
      
      setTimeout(() => {
        router.replace('/(tabs)/(home)');
      }, 2000);
    } catch (error: any) {
      console.error('[Payment] Payment confirmation failed:', error);
      setProcessing(false);
      const errorMessage = error.message || 'Failed to confirm payment. Please contact support.';
      showModal('Confirmation Error', errorMessage);
    }
  }, [selectedPlan, selectedMethod, transactionRef, showModal, router]);

  const monthlyPlanText = 'Monthly Plan';
  const yearlyPlanText = 'Yearly Plan';
  const monthlyPriceText = '€5/month';
  const yearlyPriceText = '€50/year';
  const monthlySavingsText = 'Billed monthly';
  const yearlySavingsText = 'Save €10 per year!';

  const cardMethodText = 'Credit/Debit Card';
  const paypalMethodText = 'PayPal';
  const ibanMethodText = 'Bank Transfer (IBAN)';

  const cardDescText = 'Instant activation via Stripe';
  const paypalDescText = 'Send to @jonasvanhuyssteen';
  const ibanDescText = 'Transfer to BE23 3632 3470 6391';

  const subscribeButtonText = `Subscribe for €${planPrice}`;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Subscribe',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerBackTitle: 'Back',
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Choose Your Plan</Text>
          <Text style={styles.subtitle}>Unlock unlimited AI video edits</Text>
        </View>

        <View style={styles.plansSection}>
          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'monthly' && styles.planCardSelected]}
            onPress={() => setSelectedPlan('monthly')}
            activeOpacity={0.7}
          >
            <View style={styles.planHeader}>
              <View style={styles.planRadio}>
                {selectedPlan === 'monthly' && <View style={styles.planRadioInner} />}
              </View>
              <View style={styles.planInfo}>
                <Text style={styles.planName}>{monthlyPlanText}</Text>
                <Text style={styles.planPrice}>{monthlyPriceText}</Text>
              </View>
            </View>
            <Text style={styles.planSavings}>{monthlySavingsText}</Text>
            <View style={styles.planPerks}>
              <Text style={styles.perkText}>✨ Unlimited video edits</Text>
              <Text style={styles.perkText}>⚡ Priority processing</Text>
              <Text style={styles.perkText}>📱 Direct social media posting</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'yearly' && styles.planCardSelected, styles.planCardYearly]}
            onPress={() => setSelectedPlan('yearly')}
            activeOpacity={0.7}
          >
            <View style={styles.bestValueBadge}>
              <Text style={styles.bestValueText}>BEST VALUE</Text>
            </View>
            <View style={styles.planHeader}>
              <View style={styles.planRadio}>
                {selectedPlan === 'yearly' && <View style={styles.planRadioInner} />}
              </View>
              <View style={styles.planInfo}>
                <Text style={styles.planName}>{yearlyPlanText}</Text>
                <Text style={styles.planPrice}>{yearlyPriceText}</Text>
              </View>
            </View>
            <Text style={[styles.planSavings, styles.planSavingsYearly]}>{yearlySavingsText}</Text>
            <View style={styles.planPerks}>
              <Text style={styles.perkText}>⭐ Unlimited video edits</Text>
              <Text style={styles.perkText}>🚀 Highest priority processing</Text>
              <Text style={styles.perkText}>📱 Direct social media posting</Text>
              <Text style={styles.perkText}>🎁 Early access to new features</Text>
              <Text style={styles.perkText}>💎 Exclusive templates & effects</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.paymentSection}>
          <Text style={styles.sectionTitle}>Payment Method</Text>

          <TouchableOpacity
            style={[styles.methodCard, selectedMethod === 'card' && styles.methodCardSelected]}
            onPress={() => { setSelectedMethod('card'); setShowManualConfirm(false); }}
            activeOpacity={0.7}
          >
            <View style={styles.methodRadio}>
              {selectedMethod === 'card' && <View style={styles.methodRadioInner} />}
            </View>
            <View style={styles.methodInfo}>
              <View style={styles.methodHeader}>
                <IconSymbol ios_icon_name="creditcard.fill" android_material_icon_name="credit-card" size={24} color={colors.primary} />
                <Text style={styles.methodName}>{cardMethodText}</Text>
              </View>
              <Text style={styles.methodDesc}>{cardDescText}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.methodCard, selectedMethod === 'paypal' && styles.methodCardSelected]}
            onPress={() => { setSelectedMethod('paypal'); setShowManualConfirm(false); }}
            activeOpacity={0.7}
          >
            <View style={styles.methodRadio}>
              {selectedMethod === 'paypal' && <View style={styles.methodRadioInner} />}
            </View>
            <View style={styles.methodInfo}>
              <View style={styles.methodHeader}>
                <IconSymbol ios_icon_name="dollarsign.circle.fill" android_material_icon_name="payment" size={24} color={colors.primary} />
                <Text style={styles.methodName}>{paypalMethodText}</Text>
              </View>
              <Text style={styles.methodDesc}>{paypalDescText}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.methodCard, selectedMethod === 'iban' && styles.methodCardSelected]}
            onPress={() => { setSelectedMethod('iban'); setShowManualConfirm(false); }}
            activeOpacity={0.7}
          >
            <View style={styles.methodRadio}>
              {selectedMethod === 'iban' && <View style={styles.methodRadioInner} />}
            </View>
            <View style={styles.methodInfo}>
              <View style={styles.methodHeader}>
                <IconSymbol ios_icon_name="building.columns.fill" android_material_icon_name="account-balance" size={24} color={colors.primary} />
                <Text style={styles.methodName}>{ibanMethodText}</Text>
              </View>
              <Text style={styles.methodDesc}>{ibanDescText}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {showManualConfirm && (selectedMethod === 'paypal' || selectedMethod === 'iban') && (
          <View style={styles.confirmSection}>
            <Text style={styles.confirmLabel}>Transaction Reference</Text>
            <TextInput
              style={styles.confirmInput}
              placeholder="Enter your transaction ID or reference"
              placeholderTextColor={colors.textMuted}
              value={transactionRef}
              onChangeText={setTransactionRef}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[styles.confirmButton, processing && styles.confirmButtonDisabled]}
              onPress={handleConfirmManualPayment}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <>
                  <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={20} color={colors.text} />
                  <Text style={styles.confirmButtonText}>Confirm Payment</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={[styles.subscribeButton, processing && styles.subscribeButtonDisabled]}
          onPress={handlePayment}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <>
              <Text style={styles.subscribeButtonText}>{subscribeButtonText}</Text>
              <IconSymbol ios_icon_name="arrow.right.circle.fill" android_material_icon_name="arrow-forward" size={24} color={colors.text} />
            </>
          )}
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            • Cancel anytime{'\n'}
            • Secure payment processing{'\n'}
            • Instant activation for card payments{'\n'}
            • Manual payments activate within 24 hours
          </Text>
        </View>
      </ScrollView>

      <AppModal
        visible={modalVisible}
        title={modalTitle}
        message={modalMessage}
        onClose={() => setModalVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  plansSection: {
    marginBottom: 32,
    gap: 16,
  },
  planCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: colors.border,
  },
  planCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  planCardYearly: {
    position: 'relative',
  },
  bestValueBadge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  bestValueText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.text,
    letterSpacing: 0.5,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  planRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planRadioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    marginTop: 4,
  },
  planSavings: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 12,
  },
  planSavingsYearly: {
    color: '#F59E0B',
    fontWeight: '600',
  },
  planPerks: {
    gap: 6,
  },
  perkText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  paymentSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  methodCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  methodCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  methodRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  methodInfo: {
    flex: 1,
  },
  methodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  methodName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  methodDesc: {
    fontSize: 13,
    color: colors.textMuted,
  },
  confirmSection: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  confirmLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  confirmInput: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  confirmButton: {
    backgroundColor: colors.success,
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  subscribeButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  subscribeButtonDisabled: {
    opacity: 0.6,
  },
  subscribeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  infoBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  infoText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
