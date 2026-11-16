/**
 * Fotoğrafı yapay zekâya göndermeden önce hazırlar: uzun kenarı en fazla 1568 piksel (Claude'un
 * önerdiği üst sınır; daha büyüğü yalnızca maliyeti ve süreyi artırır), JPEG, base64.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

const MAX_EDGE = 1568;

export type PhotoSource = 'camera' | 'library';
export type PreparedPhoto = { uri: string; base64: string; mediaType: 'image/jpeg' };
export type PickResult = { ok: true; photo: PreparedPhoto } | { ok: false; reason: 'cancelled' | 'denied' | 'failed' };

export function pickDashboardPhoto(source: PhotoSource): Promise<PickResult> {
  return pickPhoto(source);
}

/**
 * Servis fotoğrafı: aynı küçültme (en fazla 1568 px, JPEG %80). Boyut base64 uzunluğundan hesaplanır;
 * sunucu ayrıca 10 MB sınırını ve dosya türünü kontrol eder.
 */
export async function pickServicePhoto(source: PhotoSource): Promise<{ ok: true; uri: string; sizeBytes: number } | { ok: false; reason: 'cancelled' | 'denied' | 'failed' }> {
  const res = await pickPhoto(source);
  if (!res.ok) return res;
  return { ok: true, uri: res.photo.uri, sizeBytes: Math.floor((res.photo.base64.length * 3) / 4) };
}

async function pickPhoto(source: PhotoSource): Promise<PickResult> {
  try {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return { ok: false, reason: 'denied' };
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets[0]) return { ok: false, reason: 'cancelled' };
    const asset = res.assets[0];
    const ctx = ImageManipulator.manipulate(asset.uri);
    const longest = Math.max(asset.width || 0, asset.height || 0);
    if (longest > MAX_EDGE) {
      if ((asset.width || 0) >= (asset.height || 0)) ctx.resize({ width: MAX_EDGE });
      else ctx.resize({ height: MAX_EDGE });
    }
    const img = await ctx.renderAsync();
    const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
    if (!saved.base64) return { ok: false, reason: 'failed' };
    return { ok: true, photo: { uri: saved.uri, base64: saved.base64, mediaType: 'image/jpeg' } };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
