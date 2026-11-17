/**
 * Forum eki seçme: fotoğraf (birden çok, küçültülerek) ya da video (en fazla 60 sn).
 * Kamera ile çekilir ya da galeriden seçilir. Boyut ve süre sınırı core/forum.ts'teki kurallarla kontrol edilir.
 */
import { FORUM_LIMITS } from '@piston/core';
import * as ImagePicker from 'expo-image-picker';

import type { PendingForumMedia } from '@/data/forum-repo';
import { compressImage } from './photo';

export type ForumPickResult = { ok: true; media: PendingForumMedia[] } | { ok: false; reason: 'cancelled' | 'denied' | 'failed' };

async function sizeOf(uri: string, known?: number | null): Promise<number> {
  if (known && known > 0) return known;
  try {
    return (await (await fetch(uri)).blob()).size;
  } catch {
    return 0;
  }
}

function videoMime(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType === 'video/quicktime' || /\.mov$/i.test(asset.uri)) return 'video/quicktime';
  return 'video/mp4';
}

/**
 * @param kind 'image' fotoğraf, 'video' video
 * @param remaining seçilebilecek en fazla fotoğraf sayısı (galeriden çoklu seçim için)
 */
export async function pickForumMedia(source: 'camera' | 'library', kind: 'image' | 'video', remaining: number = FORUM_LIMITS.maxImages): Promise<ForumPickResult> {
  try {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return { ok: false, reason: 'denied' };
    }
    const opts: ImagePicker.ImagePickerOptions = kind === 'video'
      ? { mediaTypes: ['videos'], videoMaxDuration: FORUM_LIMITS.maxVideoSec, allowsEditing: true, quality: 0.7 }
      : { mediaTypes: ['images'], quality: 1, allowsMultipleSelection: source === 'library' && remaining > 1, selectionLimit: Math.max(1, remaining) };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || res.assets.length === 0) return { ok: false, reason: 'cancelled' };

    if (kind === 'video') {
      const a = res.assets[0]!;
      return {
        ok: true,
        media: [{
          uri: a.uri, kind: 'video', mimeType: videoMime(a), sizeBytes: await sizeOf(a.uri, a.fileSize),
          durationSec: a.duration != null ? Math.round(a.duration / 100) / 10 : null,
        }],
      };
    }
    const media: PendingForumMedia[] = [];
    for (const a of res.assets.slice(0, remaining)) {
      const photo = await compressImage(a);
      if (!photo) return { ok: false, reason: 'failed' };
      media.push({ uri: photo.uri, kind: 'image', mimeType: 'image/jpeg', sizeBytes: Math.floor((photo.base64.length * 3) / 4), durationSec: null });
    }
    return { ok: true, media };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
