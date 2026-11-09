import { useEffect } from 'react';
import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabBarButton, tabBarStyles, useTabBarColorStyle } from '@/components/ui/TabBar';
import { useT } from '@/contexts/LocaleContext';
import { registerPushToken } from '@/lib/api';
import { registerForPushNotificationsAsync } from '@/lib/pushNotifications';

const strings = {
  he: { home: 'בית', races: 'מירוצים', rankings: 'דירוג', profile: 'פרופיל' },
  en: { home: 'Home', races: 'Races', rankings: 'Rankings', profile: 'Profile' },
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const tabBarColors = useTabBarColorStyle();
  const t = useT(strings);

  // Only reached once signed in (unauthenticated routes redirect before
  // this layout mounts), so this is the right one-time place to ask for
  // notification permission and hand the resulting token to the backend —
  // it's what the race-notifications cron sweep sends pushes to.
  useEffect(() => {
    registerForPushNotificationsAsync()
      .then((token) => {
        if (token) return registerPushToken(token);
      })
      .catch(() => {});
  }, []);

  return (
    <Tabs style={styles.root}>
      <TabSlot />
      <TabList
        style={[
          tabBarStyles.list,
          {
            backgroundColor: tabBarColors.backgroundColor,
            borderTopColor: tabBarColors.borderTopColor,
            paddingBottom: insets.bottom || 8,
          },
        ]}
      >
        <TabTrigger name="lobby" href="/lobby" asChild>
          <TabBarButton icon="home" label={t.home} />
        </TabTrigger>
        <TabTrigger name="races" href="/races" asChild>
          <TabBarButton icon="emoji-events" label={t.races} />
        </TabTrigger>
        <TabTrigger name="rankings" href="/rankings" asChild>
          <TabBarButton icon="leaderboard" label={t.rankings} />
        </TabTrigger>
        <TabTrigger name="profile" href="/profile" asChild>
          <TabBarButton icon="person" label={t.profile} />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
