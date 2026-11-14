/**
 * Demo web sürümü claude.ai'de yayınlandığında, sayfa "sample" özelliğiyle fotoğrafı sayfayı açan kişinin
 * kendi Claude hesabıyla analiz edebilir. Telefon uygulamasında ve başka her yerde bu yol yoktur (null döner);
 * gerçek uygulama kendi sunucu fonksiyonunu (identify-warning-light) kullanır.
 */
import { buildWarningLightPrompt, parseWarningLightReply, type DetectedLight, type ImageQuality } from '@piston/core';
import { Platform } from 'react-native';

type SampleError = { code: string; message?: string };
type SampleFn = {
  json: (input: string, options?: Record<string, unknown>) => Promise<unknown>;
  limits: () => Promise<{ images?: { maxCount: number } }>;
};
type ClaudeHost = { use: (name: string) => Promise<unknown> };

let samplePromise: Promise<SampleFn | null> | null = null;

function getSample(): Promise<SampleFn | null> {
  if (Platform.OS !== 'web') return Promise.resolve(null);
  const host = (globalThis as { claude?: ClaudeHost }).claude;
  if (!host || typeof host.use !== 'function') return Promise.resolve(null);
  samplePromise ??= host.use('sample').then((s) => (s as SampleFn | null) ?? null).catch(() => null);
  return samplePromise;
}

/** Bu görünümde fotoğrafla gerçek analiz yapılabilir mi? */
export async function canAnalyzePhotosHere(): Promise<boolean> {
  const sample = await getSample();
  if (!sample) return false;
  const limits = await sample.limits().catch(() => null);
  return !!limits?.images;
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export class ArtifactAiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  not_granted: 'Claude kullanımına izin verilmedi. Işığı listeden seçebilirsin.',
  sampling_disabled: 'Bu hesapta Claude kullanılamıyor. Işığı listeden seçebilirsin.',
  rate_limited: 'Kısa sürede çok fazla analiz istendi. Biraz sonra tekrar dene.',
  image_rejected: 'Fotoğraf okunamadı. Başka bir fotoğrafla dene.',
  refused: 'Bu fotoğraf analiz edilemedi. Işığı listeden seçebilirsin.',
  invalid_json: 'Yanıt okunamadı. Tekrar dene ya da listeden seç.',
  session_expired: 'Oturumun sona erdi. Sayfayı yenileyip tekrar giriş yap.',
};

/** Fotoğrafı analiz eder. Bu görünümde mümkün değilse null döner (çağıran örnek sonuca düşer). */
export async function analyzeWithArtifactClaude(
  imageBase64: string, mediaType: string, vehicleLine: string, note: string,
): Promise<{ quality: ImageQuality; lights: DetectedLight[] } | null> {
  const sample = await getSample();
  if (!sample) return null;
  const limits = await sample.limits().catch(() => null);
  if (!limits?.images) return null;
  try {
    const raw = await sample.json(buildWarningLightPrompt(vehicleLine, note), {
      images: [base64ToBlob(imageBase64, mediaType)],
      // Simgeleri doğru ayırt etmek için en yetenekli model
      modelTier: 'complex',
    });
    const parsed = parseWarningLightReply(raw);
    if (!parsed) throw new ArtifactAiError('invalid_json', MESSAGES.invalid_json!);
    return parsed;
  } catch (e) {
    if (e instanceof ArtifactAiError) throw e;
    const code = (e as SampleError)?.code ?? 'upstream_error';
    throw new ArtifactAiError(code, MESSAGES[code] ?? 'Fotoğraf şu an analiz edilemedi. Tekrar dene ya da listeden seç.');
  }
}
