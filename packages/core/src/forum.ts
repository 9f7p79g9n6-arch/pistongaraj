/**
 * OTOM SERVİS Usta Forumu: işletmeler (servis, usta, oto sanayi) arasında soru, tartışma ve tecrübe paylaşımı.
 * Yalnızca işletme hesabı olanlar okur ve yazar. Gönderiye fotoğraf ya da video eklenebilir.
 * Kurallar sunucuda da aynen uygulanır (supabase/migrations/*_forum.sql).
 */

export type ForumCategory = 'ariza' | 'motor' | 'elektrik' | 'kaporta' | 'parca' | 'genel';

export const FORUM_CATEGORY_LABEL: Record<ForumCategory, string> = {
  ariza: 'Arıza tespiti',
  motor: 'Motor ve şanzıman',
  elektrik: 'Elektrik ve beyin',
  kaporta: 'Kaporta ve boya',
  parca: 'Parça ve tedarik',
  genel: 'Genel sohbet',
};
export const FORUM_CATEGORIES = Object.keys(FORUM_CATEGORY_LABEL) as ForumCategory[];

export type ForumMediaKind = 'image' | 'video';

export interface ForumMedia {
  id: string;
  kind: ForumMediaKind;
  /** Görüntülenecek adres (sunucuda süreli imzalı bağlantı) */
  url: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number | null;
}

export interface ForumAuthor {
  businessId: string;
  businessName: string;
  city: string;
  /** İşletme doğrulandı mı (doğrulanmamış işletme "Doğrulanmadı" olarak görünür) */
  verified: boolean;
}

export interface ForumComment {
  id: string;
  postId: string;
  author: ForumAuthor;
  /** Bu yanıtı oturum açan kullanıcı mı yazdı (silme düğmesi için) */
  mine: boolean;
  body: string;
  media: ForumMedia[];
  createdAt: string;
}

export interface ForumPost {
  id: string;
  author: ForumAuthor;
  mine: boolean;
  category: ForumCategory;
  title: string;
  body: string;
  media: ForumMedia[];
  commentCount: number;
  /** "Çözüldü" işareti: konuyu açan işletme sorunun çözüldüğünü belirtir */
  solved: boolean;
  createdAt: string;
  lastActivityAt: string;
  /** Demo verisindeki örnek gönderiler */
  sample?: boolean;
}

export const FORUM_LIMITS = {
  titleMin: 5,
  titleMax: 120,
  bodyMax: 3000,
  commentMin: 2,
  commentMax: 2000,
  maxImages: 4,
  maxVideos: 1,
  maxImageBytes: 10 * 1024 * 1024,
  maxVideoBytes: 50 * 1024 * 1024,
  maxVideoSec: 60,
  reportReasonMax: 300,
} as const;

export const FORUM_IMAGE_MIME = ['image/jpeg', 'image/png'] as const;
export const FORUM_VIDEO_MIME = ['video/mp4', 'video/quicktime'] as const;

export interface ForumMediaDraft {
  kind: ForumMediaKind;
  mimeType: string;
  sizeBytes: number;
  durationSec: number | null;
}

/** Ekler: en fazla 4 fotoğraf YA DA 1 video (karışık değil). Hata metni ya da null döner. */
export function validateForumMedia(media: readonly ForumMediaDraft[]): string | null {
  const images = media.filter((m) => m.kind === 'image');
  const videos = media.filter((m) => m.kind === 'video');
  if (videos.length > FORUM_LIMITS.maxVideos) return 'Bir gönderiye en fazla 1 video eklenebilir.';
  if (videos.length > 0 && images.length > 0) return 'Bir gönderiye ya fotoğraf ya da video eklenebilir, ikisi birden eklenemez.';
  if (images.length > FORUM_LIMITS.maxImages) return `Bir gönderiye en fazla ${FORUM_LIMITS.maxImages} fotoğraf eklenebilir.`;
  for (const m of images) {
    if (!(FORUM_IMAGE_MIME as readonly string[]).includes(m.mimeType)) return 'Fotoğraf JPEG ya da PNG olmalı.';
    if (m.sizeBytes > FORUM_LIMITS.maxImageBytes) return 'Fotoğraf en fazla 10 MB olabilir.';
  }
  for (const m of videos) {
    if (!(FORUM_VIDEO_MIME as readonly string[]).includes(m.mimeType)) return 'Video MP4 ya da MOV olmalı.';
    if (m.sizeBytes > FORUM_LIMITS.maxVideoBytes) return 'Video en fazla 50 MB olabilir. Daha kısa çek.';
    if (m.durationSec != null && m.durationSec > FORUM_LIMITS.maxVideoSec + 0.5) return `Video en fazla ${FORUM_LIMITS.maxVideoSec} saniye olabilir.`;
  }
  return null;
}

export function validateForumPost(p: { title: string; body: string; category: string; media: readonly ForumMediaDraft[] }): string | null {
  const title = p.title.trim();
  if (title.length < FORUM_LIMITS.titleMin) return `Başlık en az ${FORUM_LIMITS.titleMin} karakter olmalı.`;
  if (title.length > FORUM_LIMITS.titleMax) return `Başlık en fazla ${FORUM_LIMITS.titleMax} karakter olabilir.`;
  if (p.body.trim().length > FORUM_LIMITS.bodyMax) return `Açıklama en fazla ${FORUM_LIMITS.bodyMax} karakter olabilir.`;
  if (!(FORUM_CATEGORIES as string[]).includes(p.category)) return 'Bir kategori seç.';
  return validateForumMedia(p.media);
}

/** Yanıtın metni ya da eki olmalı. */
export function validateForumComment(c: { body: string; media: readonly ForumMediaDraft[] }): string | null {
  const body = c.body.trim();
  if (body.length === 0 && c.media.length === 0) return 'Bir şey yaz ya da fotoğraf/video ekle.';
  if (body.length > 0 && body.length < FORUM_LIMITS.commentMin) return 'Yanıt çok kısa.';
  if (body.length > FORUM_LIMITS.commentMax) return `Yanıt en fazla ${FORUM_LIMITS.commentMax} karakter olabilir.`;
  return validateForumMedia(c.media);
}

/** "3 dk önce", "2 sa önce", "dün", "14 Kas" */
export function timeAgoTR(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now.getTime() - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'şimdi';
  if (min < 60) return `${min} dk önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'dün';
  if (d < 7) return `${d} gün önce`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', ...(new Date(iso).getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
