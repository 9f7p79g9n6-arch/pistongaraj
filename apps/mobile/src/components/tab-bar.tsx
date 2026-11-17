/**
 * Alt menünün ortak görünümü (bireysel mod ve PISTON SERVİS): logo yeşili zemin.
 * Kırmızı yazı yeşil üzerinde okunmadığı için (3:1) aktif sekme koyu yazı + açık vurgu, pasif sekme zeytin yeşili (5,6:1).
 */
import { Platform } from 'react-native';

import { colors } from '@/constants/theme';

export const TAB_BAR_OPTIONS = {
  headerShown: false,
  tabBarActiveTintColor: colors.onLogo,
  tabBarInactiveTintColor: colors.onLogoMuted,
  tabBarActiveBackgroundColor: 'rgba(255,255,255,0.45)',
  tabBarStyle: {
    backgroundColor: colors.tabBar,
    borderTopColor: colors.logoLine,
    ...(Platform.OS === 'web' ? { height: 64, paddingTop: 6, paddingBottom: 8 } : null),
  },
  tabBarItemStyle: { borderRadius: 14, marginHorizontal: 4, marginVertical: 2 },
  tabBarLabelStyle: { fontSize: 11, fontWeight: '700' as const },
};
