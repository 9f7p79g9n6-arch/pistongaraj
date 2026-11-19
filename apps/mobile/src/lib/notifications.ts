/**
 * Push bildirim kaydı. İzin uygulama açılışında değil, kullanıcı bildirimi açtığında istenir.
 * Expo push anahtarı için EAS proje kimliği gerekir (app.json > extra.eas.projectId); yoksa açıklayıcı hata verir.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import type { GarageRepo } from '@/data/repo';

export type PushResult = { ok: true } | { ok: false; reason: string };

function pushSupported() {
  return Platform.OS !== 'web' && Device.isDevice && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

function configure(Notifications: typeof import('expo-notifications')) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/**
 * Oturum açıkken: bildirime dokununca ilgili ekranı açar (uygulama kapalıyken gelen dokunuş dahil) ve
 * izin önceden verilmişse cihaz anahtarını sessizce yeniler (izin istemez).
 */
export function usePushSetup(repo: GarageRepo, signedIn: boolean, open: (url: string) => void) {
  useEffect(() => {
    if (!signedIn || !pushSupported()) return;
    let alive = true;
    let sub: { remove(): void } | null = null;
    void (async () => {
      const Notifications = await import('expo-notifications');
      if (!alive) return;
      configure(Notifications);
      const urlOf = (r: { notification: { request: { content: { data?: Record<string, unknown> | null } } } } | null) => {
        const u = r?.notification.request.content.data?.url;
        return typeof u === 'string' ? u : null;
      };
      sub = Notifications.addNotificationResponseReceivedListener((r) => { const u = urlOf(r); if (u) open(u); });
      const last = await Notifications.getLastNotificationResponseAsync();
      const u = urlOf(last);
      if (alive && u) {
        open(u);
        await Notifications.clearLastNotificationResponseAsync?.();
      }
      const perm = await Notifications.getPermissionsAsync();
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (alive && perm.granted && projectId) {
        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        await repo.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
      }
    })().catch(() => {});
    return () => { alive = false; sub?.remove(); };
  // open her çizimde yeni olabilir; yalnızca oturum değişince kurulur
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, signedIn]);
}

export async function enablePush(repo: GarageRepo): Promise<PushResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'Bildirimler telefonda çalışır. Web önizlemesinde açılamaz.' };
  if (!Device.isDevice) return { ok: false, reason: 'Bildirimler için gerçek bir telefon gerekir.' };
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient)
    return { ok: false, reason: 'Expo Go bildirimleri desteklemiyor. Bildirim testi için geliştirme derlemesi gerekir (README > Bildirimler).' };

  // Modül yalnızca burada yüklenir: Expo Go'da açılışta uyarı vermesin
  const Notifications = await import('expo-notifications');
  configure(Notifications);

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Bildirimler',
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
