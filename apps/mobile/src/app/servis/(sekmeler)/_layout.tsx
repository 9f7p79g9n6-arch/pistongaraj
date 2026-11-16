import { Tabs } from 'expo-router/js-tabs';
import { Platform } from 'react-native';

import { Icon, type IconName } from '@/components/icons';
import { ACCENT_SERVIS, colors } from '@/constants/theme';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Panel', icon: 'home' },
  { name: 'kayitlar', title: 'Kayıtlar', icon: 'list' },
  { name: 'musteriler', title: 'Müşteriler', icon: 'users' },
  { name: 'araclar', title: 'Araçlar', icon: 'car' },
  { name: 'menu', title: 'Menü', icon: 'menu' },
];

export default function ServisTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACCENT_SERVIS.text,
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
