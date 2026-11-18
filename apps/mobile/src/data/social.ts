/**
 * Ana Sayfa (sosyal merkez) veri katmanı. Okuma ve yazma yalnızca RPC ile; fotoğraf ve videolar önce
 * "social-media" klasörüne (<kullanıcı_id>/<dosya>) yüklenir, sonra gönderiyle birlikte sunucuya bildirilir.
 * Demo sürümde sunucu olmadığından bu bölüm boş görünür.
 * Kurallar: packages/core/src/social.ts ve supabase/migrations/20261126000001_sosyal.sql.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import {
  validateDisplayName,
  validateSocialComment,
  validateSocialPost,
  type ForumMedia,
  type SocialComment,
  type SocialFeedScope,
  type SocialGroup,
  type SocialPost,
  type SocialPostKind,
  type SocialUser,
} from '@piston/core';

import { env } from '@/lib/env';
import type { PendingForumMedia } from './forum-repo';
import { RepoError } from './repo';
import { repo } from './store';
import type { SupabaseRepo } from './supabase-repo';

type Row = Record<string, any>;
const BUCKET = 'social-media';
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'video/mp4': 'mp4', 'video/quicktime': 'mov' };

export interface NewSocialPost {
  kind: SocialPostKind;
  groupId: string | null;
  body: string;
  media: PendingForumMedia[];
  clientRequestId: string;
}

export type SocialPostDetail = SocialPost & { comments: SocialComment[] };

export interface AdminSocialReport {
  postId: string | null; commentId: string | null; authorName: string; text: string; deleted: boolean;
  reportCount: number; lastReportAt: string; reasons: string[];
}

const MESSAGES: Record<string, string> = {
  FORBIDDEN: 'Bu işlem için yetkin yok.',
  NOT_FOUND: 'Bulunamadı. Silinmiş ya da artık görünmüyor olabilir.',
  NAME_REQUIRED: 'Paylaşmadan önce adını yaz. Gönderilerinde bu ad görünür.',
  RATE_LIMIT: 'Bugün çok fazla paylaşım yaptın. Biraz sonra tekrar dene.',
  MEDIA_LIMIT: 'En fazla 4 fotoğraf ya da 1 video ekleyebilirsin.',
  MEDIA_PATH: 'Dosya yüklenemedi. Tekrar dene.',
  MEDIA_INVALID: 'Dosya türü desteklenmiyor.',
  POST_EMPTY: 'Bir fotoğraf ya da video ekle veya bir şey yaz.',
  QUESTION_SHORT: 'Sorunu biraz daha açık yaz (en az 10 karakter).',
  COMMENT_EMPTY: 'Bir şey yaz.',
  FOLLOW_SELF: 'Kendini takip edemezsin.',
  BLOCK_SELF: 'Kendini engelleyemezsin.',
  DEMO: 'Ana Sayfa sunucu bağlantısı gerektirir; demo sürümde kullanılamaz.',
};

function fail(err: { message?: string; code?: string } | null): never {
  const msg = err?.message ?? '';
  const code = Object.keys(MESSAGES).find((k) => msg.includes(k));
  if (code) throw new RepoError(code, MESSAGES[code]!);
  if (err?.code === '23514' || msg.includes('check constraint')) throw new RepoError('INVALID', 'Girilen bilgilerden biri geçersiz. Kontrol et.');
  if (msg.includes('Failed to fetch') || msg.includes('Network request failed'))
    throw new RepoError('NETWORK', 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.');
  throw new RepoError('UNKNOWN', 'İşlem tamamlanamadı. Biraz sonra tekrar dene.');
}

const author = (a: Row) => ({ userId: a.user_id, name: a.name });

class SocialRepo {
  constructor(private readonly sb: SupabaseClient | null) {}

  get available() { return !!this.sb; }

  private async rpc(name: string, args: Row = {}): Promise<any> {
    if (!this.sb) throw new RepoError('DEMO', MESSAGES.DEMO!);
    const { data, error } = await this.sb.rpc(name, args);
    if (error) fail(error);
    return data;
  }

  /** Ekleri tek seferde süreli imzalı bağlantıya çevirir */
  private async urls(paths: string[]): Promise<Map<string, string>> {
    if (!this.sb || paths.length === 0) return new Map();
    const { data } = await this.sb.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
    return new Map((data ?? []).map((d) => [d.path ?? '', d.signedUrl ?? '']));
  }

  private media(rows: Row[], urls: Map<string, string>): ForumMedia[] {
    return rows.map((m) => ({
      id: m.id, kind: m.kind, url: urls.get(m.storage_path) ?? '', mimeType: m.mime_type, sizeBytes: Number(m.size_bytes),
      durationSec: m.duration_sec == null ? null : Number(m.duration_sec),
    }));
  }

  private post(j: Row, urls: Map<string, string>): SocialPost {
    return {
      id: j.id, author: author(j.author), mine: !!j.mine, kind: j.kind, group: j.group ? { id: j.group.id, name: j.group.name } : null,
      body: j.body ?? '', likeCount: Number(j.like_count), commentCount: Number(j.comment_count), liked: !!j.liked,
      bestCommentId: j.best_comment_id ?? null, createdAt: j.created_at, media: this.media(j.media ?? [], urls),
    };
  }

  async feed(scope: SocialFeedScope, opts: { groupId?: string; userId?: string; before?: string } = {}): Promise<SocialPost[]> {
    if (!this.sb) return [];
    const rows = ((await this.rpc('social_feed', {
      p_scope: scope, p_group_id: opts.groupId ?? null, p_user_id: opts.userId ?? null, p_before: opts.before ?? null, p_limit: 20,
    })) ?? []) as Row[];
    const urls = await this.urls(rows.flatMap((p) => (p.media as Row[]).map((m) => m.storage_path)));
    return rows.map((p) => this.post(p, urls));
  }

  async getPost(id: string): Promise<SocialPostDetail> {
    const j = (await this.rpc('social_post', { p_post_id: id })) as Row;
    const urls = await this.urls((j.media as Row[]).map((m) => m.storage_path));
    return {
      ...this.post(j, urls),
      comments: (j.comments as Row[]).map((c) => ({
        id: c.id, author: author(c.author), mine: !!c.mine, body: c.body, createdAt: c.created_at, best: !!c.best,
      })),
    };
  }

  async user(id: string): Promise<SocialUser> {
    const j = (await this.rpc('social_user', { p_user_id: id })) as Row;
    return {
      userId: j.user_id, name: j.name, me: !!j.me, hasName: !!j.has_name, postCount: Number(j.post_count),
      followerCount: Number(j.follower_count), followingCount: Number(j.following_count), following: !!j.following,
      blocked: !!j.blocked, groups: (j.groups as Row[]).map((g) => ({ id: g.id, name: g.name })),
    };
  }

  async groups(): Promise<SocialGroup[]> {
    if (!this.sb) return [];
    return ((await this.rpc('social_groups_list')) as Row[]).map((g) => ({
      id: g.id, slug: g.slug, name: g.name, memberCount: Number(g.member_count), postCount: Number(g.post_count), joined: !!g.joined,
    }));
  }

  /** Gönderilerde görünen ad (profildeki ad) */
  async setMyName(name: string) {
    const e = validateDisplayName(name);
    if (e) throw new RepoError('INVALID', e);
    if (!this.sb) throw new RepoError('DEMO', MESSAGES.DEMO!);
    const { data: u } = await this.sb.auth.getUser();
    if (!u.user) throw new RepoError('FORBIDDEN', MESSAGES.FORBIDDEN!);
    const { error } = await this.sb.from('profiles').update({ display_name: name.trim() }).eq('id', u.user.id);
    if (error) fail(error);
  }

  async createPost(input: NewSocialPost): Promise<string> {
    const e = validateSocialPost(input);
    if (e) throw new RepoError('INVALID', e);
    if (!this.sb) throw new RepoError('DEMO', MESSAGES.DEMO!);
    const { data: u } = await this.sb.auth.getUser();
    if (!u.user) throw new RepoError('FORBIDDEN', MESSAGES.FORBIDDEN!);
    const media: Row[] = [];
    for (const m of input.media) {
      const path = `${u.user.id}/${Crypto.randomUUID()}.${EXT[m.mimeType] ?? 'bin'}`;
      const body = await (await fetch(m.uri)).arrayBuffer();
      const { error } = await this.sb.storage.from(BUCKET).upload(path, body, { contentType: m.mimeType, upsert: false });
      if (error) fail(error);
      media.push({ kind: m.kind, storage_path: path, mime_type: m.mimeType, size_bytes: body.byteLength, duration_sec: m.durationSec });
    }
    return (await this.rpc('create_social_post', {
      p: { kind: input.kind, group_id: input.groupId, body: input.body, client_request_id: input.clientRequestId, media },
    })) as string;
  }

  async addComment(postId: string, body: string, clientRequestId: string): Promise<string> {
    const e = validateSocialComment(body);
    if (e) throw new RepoError('INVALID', e);
    return (await this.rpc('add_social_comment', { p: { post_id: postId, body, client_request_id: clientRequestId } })) as string;
  }

  deletePost(id: string) { return this.rpc('delete_social_post', { p_post_id: id }); }
  deleteComment(id: string) { return this.rpc('delete_social_comment', { p_comment_id: id }); }
  async like(postId: string, like: boolean): Promise<number> { return Number(await this.rpc('like_social_post', { p_post_id: postId, p_like: like })); }
  setBestAnswer(postId: string, commentId: string | null) { return this.rpc('set_best_answer', { p_post_id: postId, p_comment_id: commentId }); }
  follow(userId: string, follow: boolean) { return this.rpc('follow_user', { p_user_id: userId, p_follow: follow }); }
  join(groupId: string, join: boolean) { return this.rpc('join_social_group', { p_group_id: groupId, p_join: join }); }
  block(userId: string, block: boolean) { return this.rpc('block_social_user', { p_user_id: userId, p_block: block }); }
  report(target: { postId?: string; commentId?: string }, reason: string | null) {
    return this.rpc('report_social_content', { p_post_id: target.postId ?? null, p_comment_id: target.commentId ?? null, p_reason: reason });
  }

  async adminReports(): Promise<AdminSocialReport[]> {
    return ((await this.rpc('admin_social_reports')) as Row[]).map((j) => ({
      postId: j.post_id ?? null, commentId: j.comment_id ?? null, authorName: j.author_name, text: j.text ?? '', deleted: !!j.deleted,
      reportCount: Number(j.report_count), lastReportAt: j.last_report_at, reasons: (j.reasons ?? []) as string[],
    }));
  }

  adminRemove(postId: string | null, commentId: string | null) {
    return this.rpc('admin_remove_social_content', { p_post_id: postId, p_comment_id: commentId });
  }
}

export const socialRepo = new SocialRepo(env.isDemo ? null : (repo as SupabaseRepo).sb);
