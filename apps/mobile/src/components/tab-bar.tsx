/**
 * Alt menünün ortak görünümü (bireysel mod ve OTOM SERVİS): koyu antrasit zemin.
 * Seçili sekme logo yeşili (koyu zeminde 13:1), diğerleri açık gri (6,9:1); seçili sekmenin arkasında hafif yeşil vurgu.
 */
import { Platform } from 'react-native';

import { colors } from '@/constants/theme';

export const TAB_BAR_OPTIONS = {
  headerShown: false,
  tabBarActiveTintColor: colors.logo,
  tabBarInactiveTintColor: colors.onBarMuted,
  tabBarActiveBackgroundColor: 'rgba(182,240,0,0.12)',
  tabBarStyle: {
    backgroundColor: colors.tabBar,
    borderTopColor: colors.barLine,
    ...(Platform.OS === 'web' ? { height: 74, paddingTop: 6, paddingBottom: 10 } : null),
  },
  tabBarItemStyle: { borderRadius: 14, marginHorizontal: 4, marginVertical: 2 },
  tabBarLabelStyle: { fontSize: 11, fontWeight: '700' as const },
};
