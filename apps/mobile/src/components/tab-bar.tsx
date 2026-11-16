/** Alt menünün ortak görünümü (bireysel mod ve PISTON SERVİS): beyaz yüzey, ince üst çizgi, aktif sekme kırmızı. */
import { Platform } from 'react-native';

import { colors } from '@/constants/theme';

export const TAB_BAR_OPTIONS = {
  headerShown: false,
  tabBarActiveTintColor: colors.brand,
  tabBarInactiveTintColor: colors.iconMuted,
  tabBarStyle: {
    backgroundColor: colors.tabBar,
    borderTopColor: colors.line,
    ...(Platform.OS === 'web' ? { height: 64, paddingTop: 6, paddingBottom: 8 } : null),
  },
  tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
};
