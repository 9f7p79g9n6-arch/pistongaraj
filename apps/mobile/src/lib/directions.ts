/**
 * Yol tarifi: araç sahibi dokununca harita uygulaması bulunduğu yerden işletmeye araç rotasıyla açılır.
 * iPhone'da Google Haritalar ya da Yandex Navigasyon yüklüyse hangisiyle açılacağı sorulur; yalnızca Apple Haritalar varsa doğrudan açılır.
 * İşletme konumunu kaydetmediyse açık adrese yönlendirilir.
 */
import { businessCoords, directionsUrls, type PublicBusiness } from '@piston/core';
import { Alert, Linking, Platform } from 'react-native';

import { notify } from './confirm';

type Target = Pick<PublicBusiness, 'name' | 'address' | 'district' | 'city'> & { latitude?: number | null; longitude?: number | null };

async function open(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    notify('Harita açılamadı', 'Telefonunda bir harita uygulaması olduğundan emin ol.');
  }
}

async function canOpen(url: string) {
  try {
    return await Linking.canOpenURL(url);
  } catch {
    return false;
  }
}

export async function openDirections(b: Target) {
  const urls = directionsUrls(b);
  if (Platform.OS !== 'ios') {
    await open(urls.google);
    return;
  }
  const coords = businessCoords(b);
  const dest = encodeURIComponent(coords ?? `${b.name}, ${b.address}, ${b.district}/${b.city}`);
  const choices: { label: string; url: string }[] = [{ label: 'Apple Haritalar', url: urls.apple }];
  if (await canOpen('comgooglemaps://')) {
    choices.push({ label: 'Google Haritalar', url: `comgooglemaps://?daddr=${dest}&directionsmode=driving` });
  }
  if (coords && b.latitude != null && b.longitude != null && (await canOpen('yandexnavi://'))) {
    choices.push({ label: 'Yandex Navigasyon', url: `yandexnavi://build_route_on_map?lat_to=${b.latitude}&lon_to=${b.longitude}` });
  }
  if (choices.length === 1) {
    await open(choices[0]!.url);
    return;
  }
  Alert.alert('Yol tarifi', `${b.name} için hangi uygulamayla açılsın?`, [
    ...choices.map((c) => ({ text: c.label, onPress: () => void open(c.url) })),
    { text: 'Vazgeç', style: 'cancel' as const },
  ]);
}
