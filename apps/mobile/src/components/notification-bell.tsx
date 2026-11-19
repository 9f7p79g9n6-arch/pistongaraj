/** Zil düğmesi: okunmamış bildirim varsa nokta gösterir. Ekran her açıldığında yenilenir. */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { IconButton } from '@/components/ui';
import { repo } from '@/data/store';

export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  useFocusEffect(useCallback(() => {
    let alive = true;
    repo.unreadNotificationCount().then((n) => { if (alive) setUnread(n); }).catch(() => {});
    return () => { alive = false; };
  }, []));
  return (
    <IconButton icon="bell" label={unread > 0 ? `Bildirimler, ${unread} okunmamış` : 'Bildirimler'} dot={unread > 0}
      onPress={() => router.push('/bildirimler')} />
  );
}
