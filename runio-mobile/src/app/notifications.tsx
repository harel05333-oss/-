import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StarkCard } from '@/components/ui/StarkCard';
import { Fonts, Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';
import { useLocale, useT, type Locale } from '@/contexts/LocaleContext';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '@/lib/api';

const strings = {
  he: {
    title: 'התראות',
    markAllRead: 'סמן הכל כנקרא',
    loadError: 'לא ניתן לטעון את ההתראות.',
    retry: 'נסה שוב',
    empty: 'אין עדיין התראות.',
    someone: 'מישהו',
    defaultRaceTitle: 'מירוץ',
    messages: {
      friend_request: (name: string) => `${name} שלח/ה לך בקשת חברות`,
      friend_accepted: (name: string) => `${name} אישר/ה את בקשת החברות שלך`,
      race_invite: (name: string, raceTitle: string) => `${name} הזמין/ה אותך ל${raceTitle}`,
      race_published: (raceTitle: string) => `מירוץ חדש פורסם: ${raceTitle}`,
      race_closed: (raceTitle: string) => `ההרשמה ל${raceTitle} נסגרה`,
      race_results_ready: (raceTitle: string) => `התוצאה שלך ב${raceTitle} מוכנה`,
    },
    time: {
      now: 'עכשיו',
      minutesAgo: (n: number) => `לפני ${n} דק'`,
      hoursAgo: (n: number) => `לפני ${n} שע'`,
      daysAgo: (n: number) => `לפני ${n} ימים`,
    },
  },
  en: {
    title: 'Notifications',
    markAllRead: 'Mark all as read',
    loadError: "Couldn't load notifications.",
    retry: 'Try again',
    empty: 'No notifications yet.',
    someone: 'Someone',
    defaultRaceTitle: 'a race',
    messages: {
      friend_request: (name: string) => `${name} sent you a friend request`,
      friend_accepted: (name: string) => `${name} accepted your friend request`,
      race_invite: (name: string, raceTitle: string) => `${name} invited you to ${raceTitle}`,
      race_published: (raceTitle: string) => `New race published: ${raceTitle}`,
      race_closed: (raceTitle: string) => `Registration for ${raceTitle} has closed`,
      race_results_ready: (raceTitle: string) => `Your result for ${raceTitle} is ready`,
    },
    time: {
      now: 'Just now',
      minutesAgo: (n: number) => `${n}m ago`,
      hoursAgo: (n: number) => `${n}h ago`,
      daysAgo: (n: number) => `${n}d ago`,
    },
  },
};

function messageFor(n: NotificationItem, locale: Locale): string {
  const s = strings[locale];
  const name = n.actorName ?? s.someone;
  const raceTitle = n.raceTitle?.[locale] ?? s.defaultRaceTitle;
  switch (n.type) {
    case 'friend_request':
      return s.messages.friend_request(name);
    case 'friend_accepted':
      return s.messages.friend_accepted(name);
    case 'race_invite':
      return s.messages.race_invite(name, raceTitle);
    case 'race_published':
      return s.messages.race_published(raceTitle);
    case 'race_closed':
      return s.messages.race_closed(raceTitle);
    case 'race_results_ready':
      return s.messages.race_results_ready(raceTitle);
  }
}

function iconFor(type: NotificationItem['type']): ComponentProps<typeof MaterialIcons>['name'] {
  switch (type) {
    case 'race_published':
      return 'flag';
    case 'race_closed':
      return 'lock-outline';
    case 'race_results_ready':
      return 'emoji-events';
    default:
      return 'notifications';
  }
}

function timeAgo(iso: string, locale: Locale): string {
  const s = strings[locale].time;
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return s.now;
  if (minutes < 60) return s.minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return s.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  return s.daysAgo(days);
}

export default function NotificationsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { locale } = useLocale();
  const t = useT(strings);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    return fetchNotifications()
      .then((data) => {
        setError(false);
        setItems(data);
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unreadCount = items?.filter((n) => !n.read).length ?? 0;

  async function handleMarkAllRead() {
    if (!items || unreadCount === 0) return;
    setItems(items.map((n) => ({ ...n, read: true })));
    await markAllNotificationsRead().catch(() => load());
  }

  async function handlePress(n: NotificationItem) {
    if (!n.read) {
      setItems((prev) => prev?.map((it) => (it.id === n.id ? { ...it, read: true } : it)) ?? prev);
      markNotificationRead(n.id).catch(() => {});
    }
    if (n.raceId) {
      router.push({ pathname: '/races/[id]', params: { id: n.raceId } });
    }
  }

  const markAllButton =
    unreadCount > 0 ? (
      <Pressable onPress={handleMarkAllRead} hitSlop={8}>
        <Text style={[Typography.label, { color: colors.primary }]}>{t.markAllRead}</Text>
      </Pressable>
    ) : null;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader showBack title={t.title} right={markAllButton} />

      {error ? (
        <View style={styles.center}>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            {t.loadError}
          </Text>
          <Pressable onPress={load}>
            <Text style={[Typography.label, { color: colors.primary }]}>{t.retry}</Text>
          </Pressable>
        </View>
      ) : !items ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            {t.empty}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {items.map((n) => (
            <Pressable key={n.id} onPress={() => handlePress(n)}>
              <StarkCard style={styles.row} surface={n.read ? 'surface' : 'surfaceElevated'}>
                {n.actorAvatarUrl ? (
                  <Image source={{ uri: n.actorAvatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.surfaceSelected }]}>
                    <MaterialIcons name={iconFor(n.type)} size={18} color={colors.textSecondary} />
                  </View>
                )}
                <View style={styles.body}>
                  <Text style={[styles.message, { color: colors.text }]}>{messageFor(n, locale)}</Text>
                  <Text style={[styles.time, { color: colors.textSecondary }]}>
                    {timeAgo(n.createdAt, locale)}
                  </Text>
                </View>
                {!n.read && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
              </StarkCard>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  helperText: { fontFamily: Fonts.regular, fontSize: 14 },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  avatar: { width: 44, height: 44, borderRadius: Radius.full },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  message: { fontFamily: Fonts.medium, fontSize: 14, lineHeight: 19 },
  time: { fontFamily: Fonts.regular, fontSize: 12 },
  unreadDot: { width: 8, height: 8, borderRadius: Radius.full },
});
