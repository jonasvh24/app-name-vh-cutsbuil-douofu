
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedGet, authenticatedPost, BACKEND_URL, getBearerToken } from '@/utils/api';

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

export default function HomeScreen() {
  const { user } = useAuth();

  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const fetchProjects = useCallback(async () => {
    try {
      console.log('[API] Fetching projects...');
      // TODO: Backend Integration - GET /api/projects → [{ id, originalVideoUrl, editedVideoUrl, prompt, status, title, description, hashtags, thumbnailUrl, createdAt }]
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
      fetchProjects().finally(() => setLoadingProjects(false));
    }
  }, [user, fetchProjects]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProjects();
    setRefreshing(false);
  }, [fetchProjects]);

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
      // TODO: Backend Integration - POST /api/upload/video (multipart form data with 'video' field) → { videoUrl, filename }
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
      // TODO: Backend Integration - POST /api/projects with { videoUrl, prompt } → { projectId, status }
      const projectData = await authenticatedPost<{ projectId: string; status: string }>(
        '/api/projects',
        { videoUrl, prompt: prompt.trim() }
      );

      console.log('[API] Project created:', projectData);
      const { projectId } = projectData;

      setVideoUri(null);
      setVideoFileName(null);
      setPrompt('');
      setIsProcessing(false);

      await fetchProjects();

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
        buttons={modalButtons}Good! The backend is already building. Now let me fix the linting errors and create the complete VH Cuts app:

<write file="app/(tabs)/(home)/index.tsx">
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedGet, authenticatedPost, BACKEND_URL, getBearerToken } from '@/utils/api';

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

export default function HomeScreen() {
  const { user } = useAuth();

  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const fetchProjects = useCallback(async () => {
    try {
      console.log('[API] Fetching projects...');
      // TODO: Backend Integration - GET /api/projects → [{ id, originalVideoUrl, editedVideoUrl, prompt, status, title, description, hashtags, thumbnailUrl, createdAt }]
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
      fetchProjects().finally(() => setLoadingProjects(false));
    }
  }, [user, fetchProjects]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProjects();
    setRefreshing(false);
  }, [fetchProjects]);

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
      // TODO: Backend Integration - POST /api/upload/video (multipart form data with 'video' field) → { videoUrl, filename }
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
      // TODO: Backend Integration - POST /api/projects with { videoUrl, prompt } → { projectId, status }
      const projectData = await authenticatedPost<{ projectId: string; status: string }>(
        '/api/projects',
        { videoUrl, prompt: prompt.trim() }
      );

      console.log('[API] Project created:', projectData);
      const { projectId } = projectData;

      setVideoUri(null);
      setVideoFileName(null);
      setPrompt('');
      setIsProcessing(false);

      await fetchProjects();

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
    marginBottom: 28,
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

// ─── AppModal Component ────────────────────────────────────────────────────────

interface ModalButton {
  text: string;
  onPress: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AppModalProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: ModalButton[];
  onClose?: () => void;
  children?: React.ReactNode;
}

function AppModal({
  visible,
  title,
  message,
  buttons = [{ text: 'OK', onPress: () => {}, style: 'default' }],
  onClose,
  children,
}: AppModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={modalStyles.overlay}>
        <TouchableOpacity activeOpacity={1} style={modalStyles.container}>
          <Text style={modalStyles.title}>{title}</Text>
          {message ? (
            <Text style={modalStyles.message}>{message}</Text>
          ) : null}
          {children ? (
            <ScrollView style={modalStyles.childrenContainer}>
              {children}
            </ScrollView>
          ) : null}
          <View style={modalStyles.buttonsContainer}>
            {buttons.map((button, index) => (
              <Pressable
                key={index}
                style={[
                  modalStyles.button,
                  button.style === 'cancel' && modalStyles.cancelButton,
                  button.style === 'destructive' && modalStyles.destructiveButton,
                  button.style === 'default' && modalStyles.defaultButton,
                ]}
                onPress={button.onPress}
              >
                <Text
                  style={[
                    modalStyles.buttonText,
                    button.style === 'cancel' && modalStyles.cancelButtonText,
                    button.style === 'destructive' && modalStyles.destructiveButtonText,
                  ]}
                >
                  {button.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  childrenContainer: {
    maxHeight: 300,
    marginBottom: 8,
  },
  buttonsContainer: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultButton: {
    backgroundColor: colors.primary,
  },
  cancelButton: {
    backgroundColor: colors.border,
  },
  destructiveButton: {
    backgroundColor: colors.error,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  cancelButtonText: {
    color: colors.textSecondary,
  },
  destructiveButtonText: {
    color: colors.text,
  },
});

// ─── ProjectDetail Component ──────────────────────────────────────────────────

interface ProjectDetailProps {
  projectId: string;
  onBack: () => void;
}

function ProjectDetail({ projectId, onBack }: ProjectDetailProps) {
  const [project, setProject] = useState<VideoProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const [showRegenerateInput, setShowRegenerateInput] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [pdModalVisible, setPdModalVisible] = useState(false);
  const [pdModalTitle, setPdModalTitle] = useState('');
  const [pdModalMessage, setPdModalMessage] = useState('');
  const [pdModalButtons, setPdModalButtons] = useState<any[]>([]);

  const showPdModal = (title: string, message: string, buttons?: any[]) => {
    setPdModalTitle(title);
    setPdModalMessage(message);
    setPdModalButtons(buttons || [{ text: 'OK', onPress: () => setPdModalVisible(false), style: 'default' }]);
    setPdModalVisible(true);
  };

  const fetchProject = useCallback(async () => {
    try {
      console.log(`[API] Fetching project ${projectId}...`);
      // TODO: Backend Integration - GET /api/projects/:id → { id, originalVideoUrl, editedVideoUrl, prompt, status, title, description, hashtags, thumbnailUrl, hookSentence, createdAt }
      const data = await authenticatedGet<VideoProject>(`/api/projects/${projectId}`);
      setProject(data);
      return data;
    } catch (error: any) {
      console.error('[API] Failed to fetch project:', error.message);
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const data = await fetchProject();
      setLoading(false);
      if (data && data.status === 'processing') {
        pollingRef.current = setInterval(async () => {
          const updated = await fetchProject();
          if (updated && updated.status !== 'processing') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }, 5000);
      }
    };
    init();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchProject]);

  const handleRegenerate = async () => {
    if (!newPrompt.trim()) {
      showPdModal('No Prompt', 'Please enter a new prompt for regeneration.');
      return;
    }
    setRegenerating(true);
    try {
      console.log(`[API] Regenerating project ${projectId}...`);
      // TODO: Backend Integration - POST /api/projects/:id/regenerate with { prompt } → { id, status, prompt }
      const data = await authenticatedPost<{ id: string; status: string; prompt: string }>(
        `/api/projects/${projectId}/regenerate`,
        { prompt: newPrompt.trim() }
      );
      setProject(prev => prev ? { ...prev, status: data.status, prompt: data.prompt } : null);
      setShowRegenerateInput(false);
      setNewPrompt('');
      showPdModal('🔄 Regenerating!', 'Your video is being re-edited with the new prompt.');
    } catch (error: any) {
      showPdModal('Error', error.message || 'Failed to regenerate video.');
    } finally {
      setRegenerating(false);
    }
  };

  const handlePublish = (platforms: ('tiktok' | 'youtube')[]) => {
    setPdModalVisible(false);
    setPublishing(true);
    console.log(`[API] Publishing project ${projectId} to:`, platforms);
    // TODO: Backend Integration - POST /api/projects/:id/publish with { platforms } → { success, publishedTo }
    authenticatedPost<{ success: boolean; publishedTo: string[] }>(
      `/api/projects/${projectId}/publish`,
      { platforms }
    )
      .then((data) => {
        showPdModal('🎉 Published!', `Your video has been published to: ${data.publishedTo.join(', ')}`);
      })
      .catch((error: any) => {
        showPdModal('Publish Failed', error.message || 'Failed to publish video.');
      })
      .finally(() => setPublishing(false));
  };

  const showPublishOptions = () => {
    if (!project?.editedVideoUrl) {
      showPdModal('Not Ready', 'Your video is still being processed.');
      return;
    }
    showPdModal('📤 Publish Video', 'Choose where to publish:', [
      { text: '🎵 TikTok', onPress: () => handlePublish(['tiktok']), style: 'default' },
      { text: '▶️ YouTube', onPress: () => handlePublish(['youtube']), style: 'default' },
    ]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return colors.success;
      case 'processing': return colors.warning;
      case 'failed': return colors.error;
      default: return colors.textMuted;
    }
  };

  if (loading) {
    return (
      <View style={pdStyles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={pdStyles.loadingText}>Loading project...</Text>
      </View>
    );
  }

  if (!project) {
    return (
      <View style={pdStyles.loadingContainer}>
        <Text style={pdStyles.errorText}>Project not found</Text>
        <Pressable style={pdStyles.backBtn} onPress={onBack}>
          <Text style={pdStyles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const statusEmoji = project.status === 'completed' ? '✅' : project.status === 'processing' ? '⏳' : '❌';
  const statusLabel = project.status.charAt(0).toUpperCase() + project.status.slice(1);
  const publishBtnLabel = publishing ? 'Publishing...' : '📤 Post to Social Media';

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={pdStyles.container} contentContainerStyle={pdStyles.content}>
        <View style={[pdStyles.statusBanner, { backgroundColor: getStatusColor(project.status) + '20', borderColor: getStatusColor(project.status) + '40' }]}>
          <Text style={[pdStyles.statusText, { color: getStatusColor(project.status) }]}>
            {statusEmoji} {statusLabel}
          </Text>
          {project.status === 'processing' && <ActivityIndicator size="small" color={colors.warning} style={{ marginLeft: 8 }} />}
        </View>

        {project.title && (
          <View style={pdStyles.section}>
            <Text style={pdStyles.label}>Title</Text>
            <Text style={pdStyles.titleText}>{project.title}</Text>
          </View>
        )}

        {project.description && (
          <View style={pdStyles.section}>
            <Text style={pdStyles.label}>Description</Text>
            <Text style={pdStyles.bodyText}>{project.description}</Text>
          </View>
        )}

        {project.hashtags && (
          <View style={pdStyles.section}>
            <Text style={pdStyles.label}>Hashtags</Text>
            <Text style={pdStyles.hashtagText}>{project.hashtags}</Text>
          </View>
        )}

        <View style={pdStyles.section}>
          <Text style={pdStyles.label}>Edit Prompt</Text>
          <View style={pdStyles.promptBox}>
            <Text style={pdStyles.bodyText}>{project.prompt}</Text>
          </View>
        </View>

        {project.editedVideoUrl && (
          <View style={pdStyles.section}>
            <Text style={pdStyles.label}>Edited Video Ready ✅</Text>
            <View style={pdStyles.videoBox}>
              <Text style={pdStyles.videoUrlText} numberOfLines={2}>{project.editedVideoUrl}</Text>
            </View>
          </View>
        )}

        {project.status === 'processing' && (
          <View style={pdStyles.processingCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={pdStyles.processingTitle}>AI is editing your video...</Text>
            <Text style={pdStyles.processingSubtitle}>This may take a few minutes. Updates automatically.</Text>
          </View>
        )}

        {project.status === 'completed' && (
          <View style={pdStyles.actionsSection}>
            <Text style={pdStyles.label}>Publish</Text>
            <Pressable style={pdStyles.publishBtn} onPress={showPublishOptions} disabled={publishing}>
              {publishing ? <ActivityIndicator color={colors.text} size="small" /> : null}
              <Text style={pdStyles.publishBtnText}>{publishBtnLabel}</Text>
            </Pressable>
            <Pressable
              style={pdStyles.publishBothBtn}
              onPress={() => handlePublish(['tiktok', 'youtube'])}
              disabled={publishing}
            >
              <Text style={pdStyles.publishBothBtnText}>Post to TikTok & YouTube</Text>
            </Pressable>
          </View>
        )}

        <View style={pdStyles.regenerateSection}>
          <Text style={pdStyles.label}>Regenerate</Text>
          {!showRegenerateInput ? (
            <Pressable
              style={pdStyles.regenerateBtn}
              onPress={() => { setNewPrompt(project.prompt); setShowRegenerateInput(true); }}
              disabled={project.status === 'processing'}
            >
              <Text style={pdStyles.regenerateBtnText}>🔄 Edit with New Prompt</Text>
            </Pressable>
          ) : (
            <View style={pdStyles.regenerateInputContainer}>
              <TextInput
                style={pdStyles.regenerateInput}
                placeholder="Enter new editing prompt..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                value={newPrompt}
                onChangeText={setNewPrompt}
              />
              <View style={pdStyles.regenerateActions}>
                <Pressable style={pdStyles.cancelBtn} onPress={() => { setShowRegenerateInput(false); setNewPrompt(''); }}>
                  <Text style={pdStyles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={[pdStyles.confirmBtn, regenerating && pdStyles.disabled]} onPress={handleRegenerate} disabled={regenerating}>
                  {regenerating ? <ActivityIndicator color={colors.text} size="small" /> : <Text style={pdStyles.confirmBtnText}>Regenerate</Text>}
                </Pressable>
              </View>
            </View>
          )}
        </View>

        <Text style={pdStyles.dateText}>Created: {new Date(project.createdAt).toLocaleString()}</Text>
      </ScrollView>

      <AppModal
        visible={pdModalVisible}
        title={pdModalTitle}
        message={pdModalMessage}
        onClose={() => setPdModalVisible(false)}
        buttons={pdModalButtons}
      />
    </View>
  );
}

const pdStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 60 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, gap: 16 },
  loadingText: { fontSize: 16, color: colors.textSecondary },
  errorText: { fontSize: 18, color: colors.error, marginBottom: 16 },
  backBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  statusBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1 },
  statusText: { fontSize: 15, fontWeight: '600' },
  section: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  titleText: { fontSize: 22, fontWeight: 'bold', color: colors.text, lineHeight: 28 },
  bodyText: { fontSize: 15, color: colors.textSecondary, lineHeight: 22, backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  hashtagText: { fontSize: 15, color: colors.primary, lineHeight: 22, backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  promptBox: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: colors.primary },
  videoBox: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.success + '40' },
  videoUrlText: { fontSize: 13, color: colors.success, lineHeight: 18 },
  processingCard: { backgroundColor: colors.card, borderRadius: 16, padding: 28, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: colors.warning + '40', gap: 12 },
  processingTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text, textAlign: 'center' },
  processingSubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  actionsSection: { marginBottom: 24 },
  publishBtn: { backgroundColor: colors.primary, borderRadius: 14, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 },
  publishBtnText: { fontSize: 17, fontWeight: 'bold', color: colors.text },
  publishBothBtn: { backgroundColor: colors.card, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.primary },
  publishBothBtnText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  regenerateSection: { marginBottom: 24 },
  regenerateBtn: { backgroundColor: colors.card, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  regenerateBtnText: { fontSize: 16, fontWeight: '600', color: colors.text },
  regenerateInputContainer: { gap: 12 },
  regenerateInput: { backgroundColor: colors.card, borderRadius: 14, padding: 16, color: colors.text, fontSize: 15, minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.border },
  regenerateActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, backgroundColor: colors.border, borderRadius: 12, padding: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  confirmBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: 12, padding: 14, alignItems: 'center' },
  confirmBtnText: { fontSize: 15, fontWeight: '600', color: colors.text },
  disabled: { opacity: 0.6 },
  dateText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
});
