/**
 * Usta Forumu veri katmanı arayüzü. Demo (bu cihazda) ve Supabase (sunucu) uygulamaları aynı arayüzü kullanır.
 * Kurallar packages/core/src/forum.ts ve supabase/migrations/20261120000001_forum.sql ile aynı.
 */
import type { ForumCategory, ForumComment, ForumMediaKind, ForumPost } from '@piston/core';

import { RepoError } from './repo';

/** Henüz yüklenmemiş ek (telefondaki dosya) */
export interface PendingForumMedia {
  uri: string;
  kind: ForumMediaKind;
  mimeType: string;
  sizeBytes: number;
  durationSec: number | null;
}

export interface NewForumPost {
  businessId: string;
  category: ForumCategory;
  title: string;
  body: string;
  media: PendingForumMedia[];
  clientRequestId: string;
}

export interface NewForumComment {
  businessId: string;
  postId: string;
  body: string;
  media: PendingForumMedia[];
  clientRequestId: string;
}

export type ForumPostDetail = ForumPost & { comments: ForumComment[] };

export interface ForumRepo {
  feed(category: ForumCategory | null): Promise<ForumPost[]>;
  getPost(id: string): Promise<ForumPostDetail>;
  createPost(input: NewForumPost): Promise<string>;
  addComment(input: NewForumComment): Promise<string>;
  deletePost(id: string): Promise<void>;
  deleteComment(id: string): Promise<void>;
  setSolved(id: string, solved: boolean): Promise<void>;
  report(businessId: string, target: { postId?: string; commentId?: string }, reason: string | null): Promise<void>;
  block(businessId: string, block: boolean): Promise<void>;
}

export const FORUM_MESSAGES: Record<string, string> = {
  FORBIDDEN: 'Forumu yalnızca işletme hesabı olanlar kullanabilir.',
  NOT_FOUND: 'Bu konu silinmiş ya da artık görünmüyor.',
  MEDIA_LIMIT: 'Bir gönderiye en fazla 4 fotoğraf ya da 1 video eklenebilir.',
  MEDIA_PATH: 'Ek yüklenemedi. Tekrar dene.',
  MEDIA_INVALID: 'Ek yüklenemedi. Tekrar dene.',
  COMMENT_EMPTY: 'Bir şey yaz ya da fotoğraf/video ekle.',
  BLOCK_SELF: 'Kendi işletmeni engelleyemezsin.',
  RATE_LIMIT: 'Bugün çok fazla gönderi paylaştın. Yarın tekrar dene.',
  BUSINESS_SUSPENDED: 'İşletme hesabı askıya alındığı için forumda yazamazsın.',
};

export function forumError(code: string): RepoError {
  return new RepoError(code, FORUM_MESSAGES[code] ?? 'İşlem tamamlanamadı. Tekrar dene.');
}
