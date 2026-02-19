
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Pressable,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedGet, authenticatedPost, BACKEND_URL, getBearerToken } from '@/utils/api';
import { AppModal, ProjectDetail } from '@/components/LoadingButton';

interface VideoProject {
  id: string;
  originalVideoUrl: string;
  editedVideoUrl: string | null;
  prompt: string;
  status: string;
  title: string | null;
  description: string | null;
  hashtags: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
}

interface CreditInfo {
  credits: number;
  subscriptionStatus: 'free' | 'monthly' | 'yearly';
  subscriptionEndDate: string | null;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [creditInfo, setCreditInfo] = useState<CreditInfo | null>(null);

  // Project detail modal
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectDetailVisible, setProjectDetailVisible] = useState(false);

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

  const fetchCredits = useCallback(async () => {
    try {
      console.log('[API] Fetching credits...');
      const data = await authenticatedGet<CreditInfo>('/api/user/credits');
      setCreditInfo(data);
      console.log('[API] Credits fetched:', data);
    } catch (error: any) {
      console.error('[API] Failed to fetch credits:', error.message);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      console.log('[API] Fetching projects...');
      const data = await authenticatedGet<VideoProject[]>('/api/projects');
      setProjects(data);
      console.log('[API] Projects fetched:', data.length);
    } catch (error: any) {
      console.error('[API] Failed to fetch projects:', error.message);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setLoadingProjects(true);
      Promise.all([fetchProjects(), fetchCredits()]).finally(() => setLoadingProjects(false));
    }
  }, [user, fetchProjects, fetchCredits]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchProjects(), fetchCredits()]);
    setRefreshing(false);
  }, [fetchProjects, fetchCredits]);

  const openProjectDetail = (projectId: string) => {
    setSelectedProjectId(projectId);
    setProjectDetailVisible(true);
  };

  const closeProjectDetail = () => {
    setProjectDetailVisible(false);
    setSelectedProjectId(null);
    fetchProjects();
  };

  const pickVideo = async () => {
    console.log('User tapped Upload Video button');

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      showModal('Permission Required', 'Please allow access to your media library to upload videos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      console.log('Video selected:', result.assets[0].uri);
      setVideoUri(result.assets[0].uri);
      const uri = result.assets[0].uri;
      const parts = uri.split('/');
      setVideoFileName(parts[parts.length - 1] || 'video.mp4');
    }
  };

  const handleGenerateEdit = async () => {
    if (!videoUri) {
      showModal('No Video', 'Please upload a video first.');
      return;
    }

    if (!prompt.trim()) {
      showModal('No Prompt', 'Please describe how you want your video edited.');
      return;
    }

    console.log('[API] Starting video upload and project creation...');
    setIsUploading(true);

    try {
      console.log('[API] Uploading video to /api/upload/video...');
      const token = await getBearerToken();

      const formData = new FormData();
      formData.append('video', {
        uri: videoUri,
        name: videoFileName || 'video.mp4',
        type: 'video/mp4',
      } as any);

      const uploadResponse = await fetch(`${BACKEND_URL}/api/upload/video`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errText = await uploadResponse.text();
        console.error('[API] Upload failed:', uploadResponse.status, errText);
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      const uploadData = await uploadResponse.json();
      console.log('[API] Video uploaded:', uploadData);
      const { videoUrl } = uploadData;

      setIsUploading(false);
      setIsProcessing(true);

      console.log('[API] Creating project at /api/projects...');
      let projectData: { projectId: string; status: string };
      try {
        projectData = await authenticatedPost<{ projectId: string; status: string }>(
          '/api/projects',
          { videoUrl, prompt: prompt.trim() }
        );
      } catch (projectError: any) {
        const errMsg = projectError.message || '';
        if (errMsg.includes('insufficient_credits') || errMsg.includes('You need more credits') || errMsg.includes('400')) {
          setIsProcessing(false);
          showModal(
            '💳 No Credits Remaining',
            'You have used all your free edits. Upgrade to a subscription for unlimited video edits.',
            [
              {
                text: 'Upgrade Now',
                onPress: () => {
                  setModalVisible(false);
                  router.push('/(tabs)/profile');
                },
                style: 'default',
              },
              {
                text: 'Cancel',
                onPress: () => setModalVisible(false),
                style: 'cancel',
              },
            ]
          );
          return;
        }
        throw projectError;
      }

      console.log('[API] Project created:', projectData);
      const { projectId } = projectData;

      setVideoUri(null);
      setVideoFileName(null);
      setPrompt('');
      setIsProcessing(false);

      await Promise.all([fetchProjects(), fetchCredits()]);

      showModal(
        '🎬 Processing Started!',
        'Your video is being edited with AI. This may take a few minutes. Tap the project below to view details.',
        [
          {
            text: 'View Project',
            onPress: () => {
              setModalVisible(false);
              openProjectDetail(projectId);
            },
            style: 'default',
          },
          {
            text: 'Stay Here',
            onPress: () => setModalVisible(false),
            style: 'cancel',
          },
        ]
      );
    } catch (error: any) {
      console.error('[API] Generate edit failed:', error);
      setIsUploading(false);
      setIsProcessing(false);
      showModal('Error', error.message || 'Failed to process video. Please try again.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return colors.success;
      case 'processing': return colors.warning;
      case 'failed': return colors.error;
      default: return colors.textMuted;
    }
  };

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'completed': return '✅';
      case 'processing': return '⏳';
      case 'failed': return '❌';
      default: return '🔄';
    }
  };

  const videoSelectedText = videoUri ? 'Video Selected ✓' : 'No video selected';
  const uploadButtonText = videoUri ? 'Change Video' : 'Upload Video';

  // Check if subscription is truly active (not expired)
  const hasActiveSubscription = creditInfo
    ? (creditInfo.subscriptionStatus === 'monthly' || creditInfo.subscriptionStatus === 'yearly') &&
      creditInfo.subscriptionEndDate !== null &&
      new Date(creditInfo.subscriptionEndDate) > new Date()
    : false;

  const isSubscribed = hasActiveSubscription;
  const creditsDisplay = isSubscribed ? '∞' : creditInfo?.credits.toString() || '0';

  const getPlanEmoji = () => {
    if (!isSubscribed) return '';
    return creditInfo?.subscriptionStatus === 'yearly' ? '⭐' : '✨';
  };

  const getPlanLabel = () => {
    if (!isSubscribed) return '';
    return creditInfo?.subscriptionStatus === 'yearly' ? 'Yearly' : 'Monthly';
  };

  const creditsLabel = isSubscribed
    ? `${getPlanEmoji()} ${getPlanLabel()} Plan — Unlimited Edits 🎬`
    : creditInfo?.credits === 0
    ? '⚠️ 0 credits left — Tap to upgrade'
    : `⚡ ${creditInfo?.credits} free edit${creditInfo?.credits !== 1 ? 's' : ''} remaining — Tap to upgrade`;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'VH Cuts',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>AI Video Editor</Text>
          <Text style={styles.subtitle}>Upload, describe, and let AI edit your video</Text>
        </View>

        {creditInfo && (
          <TouchableOpacity
            style={[
              styles.creditBanner,
              isSubscribed && creditInfo.subscriptionStatus === 'yearly'
                ? styles.creditBannerYearly
                : isSubscribed
                ? styles.creditBannerSubscribed
                : creditInfo.credits === 0
                ? styles.creditBannerEmpty
                : styles.creditBannerFree,
            ]}
            onPress={() => router.push('/(tabs)/profile')}
            activeOpacity={0.8}
          >
            <View style={styles.creditBannerInner}>
              <Text style={styles.creditBannerEmoji}>
                {isSubscribed && creditInfo.subscriptionStatus === 'yearly' ? '⭐' : isSubscribed ? '✨' : creditInfo.credits === 0 ? '⚠️' : '⚡'}
              </Text>
              <View style={styles.creditBannerContent}>
                <Text style={styles.creditBannerText}>{creditsLabel}</Text>
                {isSubscribed && (
                  <Text style={styles.creditBannerSub}>
                    {creditInfo.subscriptionStatus === 'yearly'
                      ? 'Highest priority · Early access · Exclusive templates'
                      : 'Priority processing · Social media posting'}
                  </Text>
                )}
              </View>
              <Text style={styles.creditBannerArrow}>›</Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.uploadSection}>
          <TouchableOpacity
            style={[styles.uploadButton, videoUri && styles.uploadButtonSelected]}
            onPress={pickVideo}
            disabled={isUploading || isProcessing}
          >
            <IconSymbol
              ios_icon_name="video.fill"
              android_material_icon_name="videocam"
              size={48}
              color={videoUri ? colors.primary : colors.textMuted}
            />
            <Text style={styles.uploadButtonText}>{uploadButtonText}</Text>
            {!videoUri && (
              <Text style={styles.uploadHint}>Tap to select a video from your library</Text>
            )}
          </TouchableOpacity>

          {videoUri && (
            <View style={styles.videoStatus}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={24}
                color={colors.success}
              />
              <Text style={styles.videoStatusText}>{videoSelectedText}</Text>
            </View>
          )}
        </View>

        <View style={styles.promptSection}>
          <Text style={styles.label}>Describe Your Edit</Text>
          <TextInput
            style={styles.promptInput}
            placeholder="e.g., Add fast cuts, zoom-ins, bold white subtitles, cinematic color grading..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
            value={prompt}
            onChangeText={setPrompt}
            editable={!isUploading && !isProcessing}
          />
        </View>

        <View style={styles.templatesSection}>
          <Text style={styles.label}>Quick Templates</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templatesList}>
            <TouchableOpacity
              style={styles.templateChip}
              onPress={() => setPrompt('Add fast cuts, zoom-ins, bold white subtitles, cinematic color grading, bass boost sound effects, background hype music, and smooth transitions.')}
            >
              <Text style={styles.templateText}>🔥 Viral</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.templateChip}
              onPress={() => setPrompt('Apply cinematic color grading, slow motion effects, dramatic music, and smooth transitions.')}
            >
              <Text style={styles.templateText}>🎬 Cinematic</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.templateChip}
              onPress={() => setPrompt('Add funny sound effects, quick cuts, meme-style text overlays, and upbeat music.')}
            >
              <Text style={styles.templateText}>😂 Funny</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.templateChip}
              onPress={() => setPrompt('Add auto-captions, remove filler words, add background music, and optimize for podcast clips.')}
            >
              <Text style={styles.templateText}>🎙️ Podcast</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        <TouchableOpacity
          style={[
            styles.generateButton,
            (isUploading || isProcessing || !videoUri || !prompt.trim()) && styles.generateButtonDisabled,
          ]}
          onPress={handleGenerateEdit}
          disabled={isUploading || isProcessing || !videoUri || !prompt.trim()}
        >
          {isUploading || isProcessing ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <IconSymbol
              ios_icon_name="wand.and.stars"
              android_material_icon_name="auto-fix-high"
              size={24}
              color={colors.text}
            />
          )}
          <Text style={styles.generateButtonText}>
            {isUploading ? 'Uploading...' : isProcessing ? 'Creating Project...' : 'Generate Edit'}
          </Text>
        </TouchableOpacity>

        <View style={styles.infoSection}>
          <Text style={styles.infoText}>
            AI will automatically edit your video, add effects, generate captions, and optimize for TikTok/YouTube Shorts
          </Text>
        </View>

        <View style={styles.projectsSection}>
          <Text style={styles.sectionTitle}>Recent Projects</Text>

          {loadingProjects ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
          ) : projects.length === 0 ? (
            <View style={styles.emptyProjects}>
              <Text style={styles.emptyProjectsText}>No projects yet. Upload a video to get started!</Text>
            </View>
          ) : (
            projects.map((project) => (
              <TouchableOpacity
                key={project.id}
                style={styles.projectCard}
                onPress={() => openProjectDetail(project.id)}
              >
                <View style={styles.projectCardHeader}>
                  <Text style={styles.projectTitle} numberOfLines={1}>
                    {project.title || 'Untitled Project'}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(project.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(project.status) }]}>
                      {getStatusEmoji(project.status)} {project.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.projectPrompt} numberOfLines={2}>
                  {project.prompt}
                </Text>
                <Text style={styles.projectDate}>
                  {new Date(project.createdAt).toLocaleDateString()}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      <AppModal
        visible={modalVisible}
        title={modalTitle}
        message={modalMessage}
        onClose={() => setModalVisible(false)}
        buttons={modalButtons}
      />

      <Modal
        visible={projectDetailVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeProjectDetail}
      >
        <View style={styles.projectDetailModal}>
          <View style={styles.projectDetailHeader}>
            <TouchableOpacity style={styles.closeButton} onPress={closeProjectDetail}>
              <Text style={styles.closeButtonText}>✕ Close</Text>
            </TouchableOpacity>
          </View>
          {selectedProjectId && (
            <ProjectDetail
              projectId={selectedProjectId}
              onBack={closeProjectDetail}
            />
          )}
        </View>
      </Modal>
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
    paddingBottom: 120,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  creditBanner: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
    borderWidth: 1.5,
  },
  creditBannerSubscribed: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary + '60',
  },
  creditBannerYearly: {
    backgroundColor: '#F59E0B20',
    borderColor: '#F59E0B60',
  },
  creditBannerFree: {
    backgroundColor: colors.warning + '15',
    borderColor: colors.warning + '40',
  },
  creditBannerEmpty: {
    backgroundColor: colors.error + '15',
    borderColor: colors.error + '40',
  },
  creditBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  creditBannerEmoji: {
    fontSize: 22,
  },
  creditBannerContent: {
    flex: 1,
  },
  creditBannerText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  creditBannerSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  creditBannerArrow: {
    fontSize: 20,
    color: colors.textMuted,
    fontWeight: '300',
  },
  uploadSection: {
    marginBottom: 28,
  },
  uploadButton: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  uploadButtonSelected: {
    borderColor: colors.primary,
    borderStyle: 'solid',
  },
  uploadButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 12,
  },
  uploadHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
  },
  videoStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    gap: 8,
  },
  videoStatusText: {
    fontSize: 16,
    color: colors.success,
    fontWeight: '500',
  },
  promptSection: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  promptInput: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    color: colors.text,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border,
  },
  templatesSection: {
    marginBottom: 28,
  },
  templatesList: {
    flexDirection: 'row',
  },
  templateChip: {
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  templateText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  generateButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  generateButtonDisabled: {
    backgroundColor: colors.border,
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  generateButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  infoSection: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    marginBottom: 32,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  projectsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  emptyProjects: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyProjectsText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
  },
  projectCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  projectCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  projectTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  projectPrompt: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  projectDate: {
    fontSize: 12,
    color: colors.textMuted,
  },
  projectDetailModal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  projectDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  closeButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
});
