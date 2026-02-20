
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { AppModal } from '@/components/LoadingButton';
import { authenticatedGet, authenticatedPost } from '@/utils/api';
import * as ImagePicker from 'expo-image-picker';

interface VideoProject {
  id: string;
  userId: string;
  originalVideoUrl: string;
  editedVideoUrl: string | null;
  prompt: string;
  status: string;
  title: string | null;
  description: string | null;
  hashtags: string | null;
  thumbnailUrl: string | null;
  musicUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  genre: string;
  url: string;
}

export default function VideoEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<VideoProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [musicSearch, setMusicSearch] = useState('');
  const [searchResults, setSearchResults] = useState<MusicTrack[]>([]);
  const [searchingMusic, setSearchingMusic] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<MusicTrack | null>(null);
  const [importingMusic, setImportingMusic] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');

  const showModal = (title: string, message: string) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalVisible(true);
  };

  useEffect(() => {
    const fetchProject = async () => {
      try {
        console.log(`[API] Fetching project ${id} for editing via /api/editing/${id}/retrieve...`);
        const data = await authenticatedGet<VideoProject>(`/api/editing/${id}/retrieve`);
        setProject(data);
        setTitle(data.title || '');
        setDescription(data.description || '');
        setHashtags(data.hashtags || '');
        if (data.musicUrl) {
          setSelectedMusic({ id: 'existing', title: 'Current Track', artist: '', duration: 0, genre: '', url: data.musicUrl });
        }
        console.log('[API] Project loaded for editing:', data);
      } catch (error: any) {
        console.error('[API] Failed to fetch project:', error);
        showModal('Error', 'Failed to load project. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchProject();
    }
  }, [id]);

  const handleSave = async () => {
    console.log('User tapped Save Changes');
    setSaving(true);

    try {
      // If music is selected, attach it to the project first
      if (selectedMusic && selectedMusic.url && selectedMusic.id !== 'existing') {
        console.log('[API] Attaching music to project via /api/music/attach-to-project...');
        await authenticatedPost('/api/music/attach-to-project', {
          projectId: id,
          musicUrl: selectedMusic.url,
        });
        console.log('[API] Music attached successfully');
      }

      // Save project changes via /api/editing/:id/save
      console.log('[API] Saving project edits via /api/editing/${id}/save...');
      await authenticatedPost(`/api/editing/${id}/save`, {
        changes: {
          title: title.trim() || null,
          description: description.trim() || null,
          hashtags: hashtags.trim() || null,
          musicUrl: selectedMusic?.url || null,
        },
      });

      console.log('[API] Project saved successfully');
      showModal('✅ Saved!', 'Your changes have been saved.');

      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error: any) {
      console.error('[API] Failed to save project:', error);
      showModal('Error', error.message || 'Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleImportMusic = async () => {
    console.log('User tapped Import Music');

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showModal('Permission Required', 'Please allow access to your media library to import music.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['audios'],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      console.log('Music file selected:', asset.uri);
      setImportingMusic(true);

      try {
        // Register the imported music track via /api/music/import
        console.log('[API] Importing music track via /api/music/import...');
        const importedTrack = await authenticatedPost<MusicTrack>('/api/music/import', {
          title: asset.fileName || 'Imported Track',
          artist: 'Unknown Artist',
          duration: asset.duration ? Math.round(asset.duration / 1000) : 0,
          genre: 'Custom',
        });

        console.log('[API] Music imported:', importedTrack);
        // Use the local URI for playback but the imported track's metadata
        setSelectedMusic({ ...importedTrack, url: asset.uri });
        showModal('🎵 Music Added', `"${importedTrack.title}" has been added to your video.`);
      } catch (error: any) {
        console.error('[API] Failed to import music:', error);
        // Fallback: use local URI directly
        setSelectedMusic({ id: 'local', title: asset.fileName || 'Imported Track', artist: 'Unknown', duration: 0, genre: 'Custom', url: asset.uri });
        showModal('🎵 Music Added', 'Music track has been added to your video.');
      } finally {
        setImportingMusic(false);
      }
    }
  };

  const handleSearchMusic = async () => {
    if (!musicSearch.trim()) {
      showModal('Search Required', 'Please enter a search term to find music.');
      return;
    }

    console.log('[API] Searching music via /api/music/search?query=', musicSearch);
    setSearchingMusic(true);
    setSearchResults([]);

    try {
      const results = await authenticatedGet<MusicTrack[]>(`/api/music/search?query=${encodeURIComponent(musicSearch.trim())}&limit=10`);
      console.log('[API] Music search results:', results.length);
      setSearchResults(results);
      if (results.length === 0) {
        showModal('No Results', 'No music tracks found for your search. Try a different term or import from your device.');
      }
    } catch (error: any) {
      console.error('[API] Music search failed:', error);
      showModal('Search Failed', error.message || 'Failed to search for music. Please try again.');
    } finally {
      setSearchingMusic(false);
    }
  };

  const handleSelectSearchResult = (track: MusicTrack) => {
    console.log('User selected music track:', track.title);
    setSelectedMusic(track);
    setSearchResults([]);
    setMusicSearch('');
  };

  const handleRemoveMusic = () => {
    console.log('User removed music');
    setSelectedMusic(null);
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Edit Video',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerBackTitle: 'Back',
          }}
        />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading editor...</Text>
      </View>
    );
  }

  if (!project) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Edit Video',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerBackTitle: 'Back',
          }}
        />
        <Text style={styles.errorText}>Project not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Edit Video',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerBackTitle: 'Back',
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Simple Video Editor</Text>
          <Text style={styles.subtitle}>Customize your video details and add music</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Video Title</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter a catchy title..."
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe your video..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Hashtags</Text>
          <TextInput
            style={styles.input}
            placeholder="#viral #trending #fyp"
            placeholderTextColor={colors.textMuted}
            value={hashtags}
            onChangeText={setHashtags}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Background Music</Text>

          <View style={styles.musicSearchContainer}>
            <TextInput
              style={styles.musicSearchInput}
              placeholder="Search for music..."
              placeholderTextColor={colors.textMuted}
              value={musicSearch}
              onChangeText={setMusicSearch}
              onSubmitEditing={handleSearchMusic}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.searchButton} onPress={handleSearchMusic} disabled={searchingMusic}>
              {searchingMusic ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={20} color={colors.text} />
              )}
            </TouchableOpacity>
          </View>

          {searchResults.length > 0 && (
            <View style={styles.searchResultsContainer}>
              <Text style={styles.searchResultsLabel}>Search Results</Text>
              {searchResults.map((track) => (
                <TouchableOpacity
                  key={track.id}
                  style={styles.searchResultItem}
                  onPress={() => handleSelectSearchResult(track)}
                  activeOpacity={0.7}
                >
                  <View style={styles.searchResultInfo}>
                    <IconSymbol ios_icon_name="music.note" android_material_icon_name="music-note" size={20} color={colors.primary} />
                    <View style={styles.searchResultText}>
                      <Text style={styles.searchResultTitle} numberOfLines={1}>{track.title}</Text>
                      <Text style={styles.searchResultArtist} numberOfLines={1}>{track.artist} · {track.genre} · {formatDuration(track.duration)}</Text>
                    </View>
                  </View>
                  <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add-circle" size={24} color={colors.success} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.musicActions}>
            <TouchableOpacity style={styles.importButton} onPress={handleImportMusic} disabled={importingMusic}>
              {importingMusic ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <IconSymbol ios_icon_name="music.note" android_material_icon_name="music-note" size={20} color={colors.text} />
              )}
              <Text style={styles.importButtonText}>{importingMusic ? 'Importing...' : 'Import from Device'}</Text>
            </TouchableOpacity>
          </View>

          {selectedMusic && (
            <View style={styles.musicCard}>
              <View style={styles.musicInfo}>
                <IconSymbol ios_icon_name="music.note.list" android_material_icon_name="music-note" size={24} color={colors.success} />
                <View style={styles.musicTextContainer}>
                  <Text style={styles.musicText} numberOfLines={1}>{selectedMusic.title}</Text>
                  {selectedMusic.artist ? (
                    <Text style={styles.musicArtist} numberOfLines={1}>{selectedMusic.artist}{selectedMusic.duration > 0 ? ` · ${formatDuration(selectedMusic.duration)}` : ''}</Text>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity style={styles.removeButton} onPress={handleRemoveMusic}>
                <IconSymbol ios_icon_name="trash.fill" android_material_icon_name="delete" size={20} color={colors.error} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💡 Tip: Add engaging titles, relevant hashtags, and background music to make your video stand out on social media!
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <>
              <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={24} color={colors.text} />
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.videoInfoSection}>
          <Text style={styles.videoInfoLabel}>Original Prompt</Text>
          <View style={styles.promptBox}>
            <Text style={styles.promptText}>{project.prompt}</Text>
          </View>
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
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: 18,
    color: colors.error,
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
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
    fontSize: 15,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  musicSearchContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  musicSearchInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    width: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  musicActions: {
    marginBottom: 12,
  },
  importButton: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  importButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  searchResultsContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  searchResultsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  searchResultInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  searchResultText: {
    flex: 1,
  },
  searchResultTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  searchResultArtist: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  musicCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.success + '40',
  },
  musicInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  musicTextContainer: {
    flex: 1,
  },
  musicText: {
    fontSize: 15,
    color: colors.success,
    fontWeight: '500',
  },
  musicArtist: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  removeButton: {
    padding: 8,
  },
  infoBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  saveButton: {
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
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  videoInfoSection: {
    marginBottom: 20,
  },
  videoInfoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  promptBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  promptText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
