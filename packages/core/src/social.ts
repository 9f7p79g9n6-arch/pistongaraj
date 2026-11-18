/**
 * OTOM Ana Sayfa (sosyal merkez) kuralları. Sunucu: supabase/migrations/20261126000001_sosyal.sql (aynı sınırlar).
 * Ekler forumla aynı: en fazla 4 fotoğraf YA DA 1 video (≤60 sn).
 */
import { validateForumMedia, type ForumMedia, type ForumMediaDraft } from './forum';

export type SocialPostKind = 'post' | 'question';
export type SocialFeedScope = 'all' | 'following' | 'groups' | 'questions';

export const SOCIAL_SCOPE_LABEL: Record<SocialFeedScope, string> = {
  all: 'Herkes',
  following: 'Takip',
  groups: 'Gruplarım',
  questions: 'Sorular',
};

export const SOCIAL_LIMITS = {
  bodyMax: 2000,
  questionMin: 10,
  commentMax: 1000,
  nameMin: 2,
  nameMax: 40,
} as const;

export interface SocialAuthor {
  userId: string;
  name: string;
}

export interface SocialGroupRef {
  id: string;
  name: string;
}

export interface SocialPost {
  id: string;
  author: SocialAuthor;
  mine: boolean;
  kind: SocialPostKind;
  group: SocialGroupRef | null;
  body: string;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  bestCommentId: string | null;
  createdAt: string;
  media: ForumMedia[];
}

export interface SocialComment {
  id: string;
  author: SocialAuthor;
  mine: boolean;
  body: string;
  createdAt: string;
  best: boolean;
}

export interface SocialGroup {
  id: string;
  slug: string;
  name: string;
  memberCount: number;
  postCount: number;
  joined: boolean;
}

export interface SocialUser {
  userId: string;
  name: string;
  me: boolean;
  hasName: boolean;
  postCount: number;
  followerCount: number;
  followingCount: number;
  following: boolean;
  blocked: boolean;
  groups: SocialGroupRef[];
}

/** Gönderi: metin ya da ek olmalı; soru en az 10 karakter. Hata metni ya da null döner. */
export function validateSocialPost(p: { kind: SocialPostKind; body: string; media: readonly ForumMediaDraft[] }): string | null {
  const body = p.body.trim();
  if (body.length > SOCIAL_LIMITS.bodyMax) return `Metin en fazla ${SOCIAL_LIMITS.bodyMax} karakter olabilir.`;
  if (p.kind === 'question' && body.length < SOCIAL_LIMITS.questionMin) return 'Sorunu biraz daha açık yaz (en az 10 karakter).';
  if (p.kind === 'post' && body.length === 0 && p.media.length === 0) return 'Bir fotoğraf ya da video ekle veya bir şey yaz.';
  return validateForumMedia(p.media);
}

export function validateSocialComment(body: string): string | null {
  const t = body.trim();
  if (t.length === 0) return 'Bir şey yaz.';
  if (t.length > SOCIAL_LIMITS.commentMax) return `Yorum en fazla ${SOCIAL_LIMITS.commentMax} karakter olabilir.`;
  return null;
}

export function validateDisplayName(name: string): string | null {
  const t = name.trim();
  if (t.length < SOCIAL_LIMITS.nameMin) return 'Adını yaz (en az 2 harf).';
  if (t.length > SOCIAL_LIMITS.nameMax) return `Ad en fazla ${SOCIAL_LIMITS.nameMax} karakter olabilir.`;
  return null;
}

/** "1,2 B" gibi kısa sayı (beğeni, takipçi) */
export function compactCountTR(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace('.', ',').replace(/,0$/, '')} B`;
  return `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '')} Mn`;
}
