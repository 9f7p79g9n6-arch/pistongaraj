import { Tabs } from 'expo-router/js-tabs';

import { TAB_BAR_OPTIONS } from '@/components/tab-bar';
import { Icon, type IconName } from '@/components/icons';

/** Alt menü: Ana Sayfa · Servisler · Parçalar · Profil. Forum, Profil menüsünden açılır. */
const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Ana Sayfa', icon: 'home' },
  { name: 'services', title: 'Servisler', icon: 'wrench' },
  { name: 'market', title: 'Parçalar', icon: 'parts' },
  { name: 'profile', title: 'Profil', icon: 'user' },
];

export default function TabLayout() {
  return (
    <Tabs screenOptions={TAB_BAR_OPTIONS}>
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
