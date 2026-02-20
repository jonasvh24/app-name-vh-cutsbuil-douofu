/**
 * Loading Button Component
 */

import React from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from "react-native";

interface LoadingButtonProps {
  onPress: () => void;
  title: string;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "outline";
  style?: ViewStyle;
  textStyle?: TextStyle;
  loadingColor?: string;
}

export function LoadingButton({
  onPress,
  title,
  loading = false,
  disabled = false,
  variant = "primary",
  style,
  textStyle,
  loadingColor,
}: LoadingButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={loadingColor || (variant === "outline" ? "#8B5CF6" : "#fff")}
        />
      ) : (
        <Text
          style={[
            styles.text,
            styles[`${variant}Text` as keyof typeof styles],
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  primary: {
    backgroundColor: "#8B5CF6",
  },
  secondary: {
    backgroundColor: "#6366F1",
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#8B5CF6",
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
  },
  primaryText: {
    color: "#fff",
  },
  secondaryText: {
    color: "#fff",
  },
  outlineText: {
    color: "#8B5CF6",
  },
});

// ─── AppModal ────────────────────────────────────────────────────────────────

import {
  View,
  Modal as RNModal,
  TouchableWithoutFeedback,
  ScrollView,
} from "react-native";
import { colors } from "@/styles/commonStyles";

interface ModalButton {
  text: string;
  onPress: () => void;
  style?: "default" | "cancel" | "destructive";
}

interface AppModalProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: ModalButton[];
  onClose?: () => void;
  children?: React.ReactNode;
}

export function AppModal({
  visible,
  title,
  message,
  buttons = [{ text: "OK", onPress: () => {}, style: "default" }],
  onClose,
  children,
}: AppModalProps) {
  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={modalStyles.overlay}>
          <TouchableWithoutFeedback>
            <View style={modalStyles.container}>
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
                      button.style === "cancel" && modalStyles.cancelButton,
                      button.style === "destructive" &&
                        modalStyles.destructiveButton,
                      button.style === "default" && modalStyles.defaultButton,
                    ]}
                    onPress={button.onPress}
                  >
                    <Text
                      style={[
                        modalStyles.buttonText,
                        button.style === "cancel" &&
                          modalStyles.cancelButtonText,
                        button.style === "destructive" &&
                          modalStyles.destructiveButtonText,
                      ]}
                    >
                      {button.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </RNModal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
  },
  childrenContainer: {
    maxHeight: 300,
    marginBottom: 8,
  },
  buttonsContainer: {
    flexDirection: "row",
    marginTop: 20,
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
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
    fontWeight: "600",
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

import { useEffect, useCallback, useRef } from "react";
import { TextInput } from "react-native";
import { authenticatedGet, authenticatedPost } from "@/utils/api";
import { useRouter } from "expo-router";

export interface VideoProject {
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

interface ProjectDetailProps {
  projectId: string;
  onBack: () => void;
}

export function ProjectDetail({ projectId, onBack }: ProjectDetailProps) {
  const router = useRouter();
  const [project, setProject] = React.useState<VideoProject | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [regenerating, setRegenerating] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [newPrompt, setNewPrompt] = React.useState('');
  const [showRegenerateInput, setShowRegenerateInput] = React.useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [pdModalVisible, setPdModalVisible] = React.useState(false);
  const [pdModalTitle, setPdModalTitle] = React.useState('');
  const [pdModalMessage, setPdModalMessage] = React.useState('');
  const [pdModalButtons, setPdModalButtons] = React.useState<any[]>([]);

  const showPdModal = (title: string, message: string, buttons?: any[]) => {
    setPdModalTitle(title);
    setPdModalMessage(message);
    setPdModalButtons(buttons || [{ text: 'OK', onPress: () => setPdModalVisible(false), style: 'default' }]);
    setPdModalVisible(true);
  };

  const fetchProject = useCallback(async () => {
    try {
      console.log(`[API] Fetching project ${projectId}...`);
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

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={pdStyles.container} contentContainerStyle={pdStyles.content}>
        <View style={[pdStyles.statusBanner, { backgroundColor: getStatusColor(project.status) + '20', borderColor: getStatusColor(project.status) + '40' }]}>
          <Text style={[pdStyles.statusText, { color: getStatusColor(project.status) }]}>
            {project.status === 'completed' ? '✅' : project.status === 'processing' ? '⏳' : '❌'} {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
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
          <>
            <View style={pdStyles.editorSection}>
              <Text style={pdStyles.label}>Edit Video</Text>
              <Pressable
                style={pdStyles.editorBtn}
                onPress={() => {
                  console.log('User tapped Open Editor - navigating to /editor/' + project.id);
                  router.push(`/editor/${project.id}` as any);
                }}
              >
                <Text style={pdStyles.editorBtnText}>✏️ Open Simple Editor</Text>
              </Pressable>
              <Text style={pdStyles.editorHint}>Customize title, description, hashtags, and add music</Text>
            </View>

            <View style={pdStyles.actionsSection}>
              <Text style={pdStyles.label}>Publish</Text>
              <Pressable style={pdStyles.publishBtn} onPress={showPublishOptions} disabled={publishing}>
                {publishing ? <ActivityIndicator color={colors.text} size="small" /> : null}
                <Text style={pdStyles.publishBtnText}>{publishing ? 'Publishing...' : '📤 Post to Social Media'}</Text>
              </Pressable>
              <Pressable
                style={pdStyles.publishBothBtn}
                onPress={() => handlePublish(['tiktok', 'youtube'])}
                disabled={publishing}
              >
                <Text style={pdStyles.publishBothBtnText}>Post to TikTok & YouTube</Text>
              </Pressable>
            </View>
          </>
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
  backBtnText: { color: colors.text, fontSize: 16, fontWeight: '600' as const },
  statusBanner: { flexDirection: 'row' as const, alignItems: 'center' as const, borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1 },
  statusText: { fontSize: 15, fontWeight: '600' as const },
  section: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '600' as const, color: colors.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.8, marginBottom: 8 },
  titleText: { fontSize: 22, fontWeight: 'bold' as const, color: colors.text, lineHeight: 28 },
  bodyText: { fontSize: 15, color: colors.textSecondary, lineHeight: 22, backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  hashtagText: { fontSize: 15, color: colors.primary, lineHeight: 22, backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  promptBox: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: colors.primary },
  videoBox: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.success + '40' },
  videoUrlText: { fontSize: 13, color: colors.success, lineHeight: 18 },
  processingCard: { backgroundColor: colors.card, borderRadius: 16, padding: 28, alignItems: 'center' as const, marginBottom: 20, borderWidth: 1, borderColor: colors.warning + '40', gap: 12 },
  processingTitle: { fontSize: 18, fontWeight: 'bold' as const, color: colors.text, textAlign: 'center' as const },
  processingSubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' as const, lineHeight: 20 },
  editorSection: { marginBottom: 24 },
  editorBtn: { backgroundColor: colors.card, borderRadius: 14, padding: 16, alignItems: 'center' as const, borderWidth: 2, borderColor: colors.primary, marginBottom: 8 },
  editorBtnText: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  editorHint: { fontSize: 13, color: colors.textMuted, textAlign: 'center' as const },
  actionsSection: { marginBottom: 24 },
  publishBtn: { backgroundColor: colors.primary, borderRadius: 14, padding: 18, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, marginBottom: 12 },
  publishBtnText: { fontSize: 17, fontWeight: 'bold' as const, color: colors.text },
  publishBothBtn: { backgroundColor: colors.card, borderRadius: 14, padding: 16, alignItems: 'center' as const, borderWidth: 1, borderColor: colors.primary },
  publishBothBtnText: { fontSize: 15, fontWeight: '600' as const, color: colors.primary },
  regenerateSection: { marginBottom: 24 },
  regenerateBtn: { backgroundColor: colors.card, borderRadius: 14, padding: 16, alignItems: 'center' as const, borderWidth: 1, borderColor: colors.border },
  regenerateBtnText: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  regenerateInputContainer: { gap: 12 },
  regenerateInput: { backgroundColor: colors.card, borderRadius: 14, padding: 16, color: colors.text, fontSize: 15, minHeight: 100, textAlignVertical: 'top' as const, borderWidth: 1, borderColor: colors.border },
  regenerateActions: { flexDirection: 'row' as const, gap: 12 },
  cancelBtn: { flex: 1, backgroundColor: colors.border, borderRadius: 12, padding: 14, alignItems: 'center' as const },
  cancelBtnText: { fontSize: 15, fontWeight: '600' as const, color: colors.textSecondary },
  confirmBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: 12, padding: 14, alignItems: 'center' as const },
  confirmBtnText: { fontSize: 15, fontWeight: '600' as const, color: colors.text },
  disabled: { opacity: 0.6 },
  dateText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' as const, marginTop: 8 },
});
