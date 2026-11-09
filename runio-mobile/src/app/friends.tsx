import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StarkCard } from '@/components/ui/StarkCard';
import { Fonts, Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';
import {
  fetchFriendRequests,
  fetchFriends,
  respondToFriendRequest,
  searchFriends,
  sendFriendRequest,
  type Friend,
  type FriendRequest,
  type FriendSearchResult,
} from '@/lib/api';

export default function FriendsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [requests, setRequests] = useState<FriendRequest[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(() => {
    return Promise.all([fetchFriends(), fetchFriendRequests()])
      .then(([f, r]) => {
        setError(false);
        setFriends(f);
        setRequests(r);
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced search-as-you-type — waits for a short pause in typing
  // instead of firing a request per keystroke.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = setTimeout(() => {
      searchFriends(trimmed)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(id);
  }, [query]);

  async function handleAddFriend(target: FriendSearchResult) {
    setAddError(null);
    setSendingId(target.id);
    try {
      await sendFriendRequest({ userId: target.id });
      setResults((prev) =>
        prev.map((r) => (r.id === target.id ? { ...r, relationship: 'requestSent' } : r))
      );
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'משהו השתבש.');
    } finally {
      setSendingId(null);
    }
  }

  async function handleRespond(friendshipId: string, accept: boolean) {
    setRequests((prev) => prev?.filter((r) => r.friendshipId !== friendshipId) ?? prev);
    await respondToFriendRequest(friendshipId, accept).catch(() => load());
    if (accept) load();
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader showBack title="חברים" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {error ? (
          <View style={styles.center}>
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              לא ניתן לטעון את החברים.
            </Text>
            <Pressable onPress={load}>
              <Text style={[Typography.label, { color: colors.primary }]}>נסה שוב</Text>
            </Pressable>
          </View>
        ) : !friends || !requests ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <StarkCard style={styles.addCard}>
              <Text style={[Typography.label, { color: colors.textSecondary }]}>הוספת חבר/ה</Text>
              <View style={styles.addRow}>
                <MaterialIcons name="search" size={18} color={colors.textSecondary} />
                <TextInput
                  style={[
                    styles.addInput,
                    { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
                  ]}
                  placeholder="חיפוש לפי שם משתמש"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={query}
                  onChangeText={(v) => {
                    setQuery(v);
                    setAddError(null);
                  }}
                />
                {searching && <ActivityIndicator color={colors.textSecondary} size="small" />}
              </View>
              {addError && <Text style={[styles.addFeedback, { color: colors.error }]}>{addError}</Text>}

              {results.map((r) => (
                <View key={r.id} style={[styles.resultRow, { borderTopColor: colors.border }]}>
                  <Image source={{ uri: r.avatarUrl }} style={styles.avatar} />
                  <View style={styles.resultBody}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={[styles.username, { color: colors.textSecondary }]} numberOfLines={1}>
                      @{r.username}
                    </Text>
                  </View>
                  {r.relationship === 'friends' ? (
                    <MaterialIcons name="check-circle" size={22} color={colors.primary} />
                  ) : r.relationship === 'requestSent' ? (
                    <Text style={[styles.pendingLabel, { color: colors.textSecondary }]}>ממתין</Text>
                  ) : r.relationship === 'requestReceived' ? (
                    <Text style={[styles.pendingLabel, { color: colors.textSecondary }]}>הזמין/ה אותך</Text>
                  ) : (
                    <Pressable
                      onPress={() => handleAddFriend(r)}
                      disabled={sendingId === r.id}
                      style={[styles.addResultButton, { backgroundColor: colors.primary }]}
                      accessibilityRole="button"
                      accessibilityLabel="הוסף/י כחבר/ה"
                    >
                      {sendingId === r.id ? (
                        <ActivityIndicator color={colors.onPrimary} size="small" />
                      ) : (
                        <MaterialIcons name="person-add" size={18} color={colors.onPrimary} />
                      )}
                    </Pressable>
                  )}
                </View>
              ))}
              {query.trim().length >= 2 && !searching && results.length === 0 && (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  לא נמצא אף אחד עם שם המשתמש הזה.
                </Text>
              )}
            </StarkCard>

            {requests.length > 0 && (
              <View style={styles.section}>
                <Text style={[Typography.label, { color: colors.textSecondary }]}>
                  בקשות חברות
                </Text>
                {requests.map((r) => (
                  <StarkCard key={r.friendshipId} style={styles.requestRow}>
                    <Image source={{ uri: r.avatarUrl }} style={styles.avatar} />
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Pressable
                      onPress={() => handleRespond(r.friendshipId, true)}
                      hitSlop={8}
                      style={styles.requestAction}
                      accessibilityRole="button"
                      accessibilityLabel="אשר/י בקשת חברות"
                    >
                      <MaterialIcons name="check" size={20} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleRespond(r.friendshipId, false)}
                      hitSlop={8}
                      style={styles.requestAction}
                      accessibilityRole="button"
                      accessibilityLabel="דחה/י בקשת חברות"
                    >
                      <MaterialIcons name="close" size={20} color={colors.error} />
                    </Pressable>
                  </StarkCard>
                ))}
              </View>
            )}

            <View style={styles.section}>
              <Text style={[Typography.label, { color: colors.textSecondary }]}>חברים</Text>
              {friends.length === 0 ? (
                <StarkCard style={styles.emptyCard}>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    אין עדיין חברים — חפשו אחד/ת למעלה לפי שם משתמש.
                  </Text>
                </StarkCard>
              ) : (
                friends.map((f) => (
                  <Pressable
                    key={f.id}
                    onPress={() =>
                      router.push({
                        pathname: '/chat/[friendId]',
                        params: { friendId: f.id, name: f.name, avatarUrl: f.avatarUrl },
                      })
                    }
                  >
                    <StarkCard style={styles.friendRow}>
                      <Image source={{ uri: f.avatarUrl }} style={styles.avatar} />
                      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                        {f.name}
                      </Text>
                      <MaterialIcons name="chat-bubble-outline" size={20} color={colors.textSecondary} />
                    </StarkCard>
                  </Pressable>
                ))
              )}
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  helperText: { fontFamily: Fonts.regular, fontSize: 14 },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.five },
  addCard: { padding: Spacing.three, gap: Spacing.two },
  addRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  addInput: {
    flex: 1,
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.regular,
    fontSize: 14,
  },
  addFeedback: { fontFamily: Fonts.medium, fontSize: 13 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderTopWidth: 1,
  },
  resultBody: { flex: 1, gap: 1 },
  username: { fontFamily: Fonts.regular, fontSize: 12 },
  pendingLabel: { fontFamily: Fonts.medium, fontSize: 12 },
  addResultButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { gap: Spacing.two },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
  },
  requestAction: { padding: 4 },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
  },
  avatar: { width: 40, height: 40, borderRadius: Radius.full },
  name: { flex: 1, fontFamily: Fonts.medium, fontSize: 14 },
  emptyCard: { padding: Spacing.four, alignItems: 'center' },
  emptyText: { fontFamily: Fonts.regular, fontSize: 14, textAlign: 'center' },
});
