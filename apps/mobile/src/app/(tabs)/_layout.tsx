import { Tabs } from 'expo-router/js-tabs';
import { Platform } from 'react-native';

import { Icon, type IconName } from '@/components/icons';
import { colors } from '@/constants/theme';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Ana Sayfa', icon: 'home' },
  { name: 'market', title: 'Parça Pazarı', icon: 'parts' },
  { name: 'forum', title: 'Forum', icon: 'forum' },
  { name: 'services', title: 'Servisler', icon: 'wrench' },
  { name: 'profile', title: 'Profil', icon: 'user' },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.neon,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.line, ...(Platform.OS === 'web' ? { height: 64, paddingTop: 6, paddingBottom: 8 } : null) },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{ title: t.title, tabBarIcon: ({ color }) => <Icon name={t.icon} size={22} color={color as string} /> }}
        />
      ))}
    </Tabs>
  );
}
