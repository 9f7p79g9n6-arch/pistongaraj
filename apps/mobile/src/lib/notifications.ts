/**
 * Push bildirim kaydı. İzin uygulama açılışında değil, kullanıcı bildirimi açtığında istenir.
 * Expo push anahtarı için EAS proje kimliği gerekir (app.json > extra.eas.projectId); yoksa açıklayıcı hata verir.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import type { GarageRepo } from '@/data/repo';

export type PushResult = { ok: true } | { ok: false; reason: string };

export async function enablePush(repo: GarageRepo): Promise<PushResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'Bildirimler telefonda çalışır. Web önizlemesinde açılamaz.' };
  if (!Device.isDevice) return { ok: false, reason: 'Bildirimler için gerçek bir telefon gerekir.' };
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient)
    return { ok: false, reason: 'Expo Go bildirimleri desteklemiyor. Bildirim testi için geliştirme derlemesi gerekir (README > Bildirimler).' };

  // Modül yalnızca burada yüklenir: Expo Go'da açılışta uyarı vermesin
  const Notifications = await import('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('maintenance', {
      name: 'Bakım hatırlatmaları',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const status = current.granted ? 'granted' : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { ok: false, reason: 'Bildirim izni verilmedi. Telefon ayarlarından açabilirsin.' };

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { ok: false, reason: 'EAS proje kimliği tanımlı değil (README > Bildirimler).' };

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await repo.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
  return { ok: true };
}
