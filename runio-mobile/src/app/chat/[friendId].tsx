import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';
import { fetchMessages, sendMessage, type ChatMessage } from '@/lib/api';

const POLL_INTERVAL_MS = 3000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function ChatScreen() {
  const { friendId, name, avatarUrl } = useLocalSearchParams<{
    friendId: string;
    name?: string;
    avatarUrl?: string;
  }>();
  const colors = useThemeColors();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(() => {
    if (!friendId) return Promise.resolve();
    return fetchMessages(friendId)
      .then((data) => {
        setError(false);
        setMessages(data);
      })
      .catch(() => setError(true));
  }, [friendId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || !friendId) return;
    setDraft('');
    setSending(true);
    try {
      const sent = await sendMessage(friendId, text);
      setMessages((prev) => (prev ? [...prev, sent] : [sent]));
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader
        showBack
        title={name ?? 'צ׳אט'}
        right={
          avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} /> : undefined
        }
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {error ? (
          <View style={styles.center}>
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              לא ניתן לטעון את השיחה הזו.
            </Text>
            <Pressable onPress={load}>
              <Text style={[styles.retry, { color: colors.primary }]}>נסה שוב</Text>
            </Pressable>
          </View>
        ) : !messages ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => (
              <View style={[styles.bubbleRow, item.fromMe && styles.bubbleRowMine]}>
                <View
                  style={[
                    styles.bubble,
                    { backgroundColor: item.fromMe ? colors.primary : colors.surfaceElevated },
                  ]}
                >
                  <Text style={[styles.bubbleText, { color: item.fromMe ? colors.onPrimary : colors.text }]}>
                    {item.body}
                  </Text>
                </View>
                <Text style={[styles.time, { color: colors.textSecondary }]}>
                  {formatTime(item.createdAt)}
                </Text>
              </View>
            )}
          />
        )}

        <View style={[styles.inputRow, { borderTopColor: colors.border }]}>
          <TextInput
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
            ]}
            placeholder="הקלד/י הודעה…"
            placeholderTextColor={colors.textSecondary}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable
            onPress={handleSend}
            disabled={!draft.trim() || sending}
            style={[
              styles.sendButton,
              { backgroundColor: colors.primary },
              (!draft.trim() || sending) && styles.sendButtonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="שליחה"
          >
            <MaterialIcons name="send" size={18} color={colors.onPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  helperText: { fontFamily: Fonts.regular, fontSize: 14 },
  retry: { fontFamily: Fonts.bold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  headerAvatar: { width: 28, height: 28, borderRadius: Radius.full },
  list: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, gap: Spacing.two },
  bubbleRow: { maxWidth: '78%', alignSelf: 'flex-start', gap: 2 },
  bubbleRowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: { borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  bubbleText: { fontFamily: Fonts.regular, fontSize: 15, lineHeight: 20 },
  time: { fontFamily: Fonts.regular, fontSize: 11, marginHorizontal: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontFamily: Fonts.regular,
    fontSize: 15,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 },
});
