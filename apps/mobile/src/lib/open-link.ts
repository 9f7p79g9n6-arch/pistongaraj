/**
 * Bildirimdeki bağlantıyı açar. İşletme ekranları (/servis/...) işletme modunda açılır;
 * bilinmeyen ya da dış bağlantılar açılmaz (bildirim içeriği sunucudan gelir).
 */
import { router, type Href } from 'expo-router';

import type { AppMode } from '@/data/business-store';

const ALLOWED = /^\/(servis|servis-kaydi|servis-kayitlarim|teklif|sosyal|vehicle)(\/[A-Za-z0-9-]+)*$/;

export function isOpenableLink(url: string | null | undefined): url is string {
  return typeof url === 'string' && ALLOWED.test(url);
}

export function openAppLink(url: string | null | undefined, setMode?: (m: AppMode) => void) {
  if (!isOpenableLink(url)) return false;
  if (setMode && url.startsWith('/servis/')) setMode('business');
  router.push(url as Href);
  return true;
}
