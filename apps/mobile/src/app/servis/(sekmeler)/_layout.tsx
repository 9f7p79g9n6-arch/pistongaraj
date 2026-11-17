import { Tabs } from 'expo-router/js-tabs';
import { Icon, type IconName } from '@/components/icons';
import { TAB_BAR_OPTIONS } from '@/components/tab-bar';
import { useBusiness } from '@/data/business-store';

/** "Ciro" sekmesi yalnızca finans yetkisi olan rolde (sahip, müdür) görünür. */
const TABS: { name: string; title: string; icon: IconName; finance?: boolean }[] = [
  { name: 'index', title: 'Panel', icon: 'home' },
  { name: 'kayitlar', title: 'Kayıtlar', icon: 'list' },
  { name: 'forum', title: 'Forum', icon: 'forum' },
  { name: 'ciro', title: 'Ciro', icon: 'chart', finance: true },
  { name: 'menu', title: 'Menü', icon: 'menu' },
];

export default function ServisTabs() {
  const { canFinance } = useBusiness();
  return (
    <Tabs screenOptions={TAB_BAR_OPTIONS}>
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            href: t.finance && !canFinance ? null : undefined,
            tabBarIcon: ({ color }) => <Icon name={t.icon} size={22} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  );
}
