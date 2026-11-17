/**
 * Usta Forumu Supabase veri katmanı. Okuma ve yazma yalnızca RPC ile; ekler önce "forum-media" klasörüne
 * (<business_id>/<dosya>) yüklenir, sonra gönderiyle birlikte sunucuya bildirilir.
 * Not: Gerçek bir Supabase projesine bağlanıp uçtan uca denenene kadar bu katman "test edildi" sayılmaz.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import {
  validateForumComment,
  validateForumPost,
  type ForumAuthor,
  type ForumCategory,
  type ForumComment,
  type ForumMedia,
  type ForumPost,
} from '@piston/core';

import { FORUM_MESSAGES, forumError, type ForumPostDetail, type ForumRepo, type NewForumComment, type NewForumPost, type PendingForumMedia } from './forum-repo';
import { RepoError } from './repo';

type Row = Record<string, any>;
const BUCKET = 'forum-media';

function fail(err: { message?: string; code?: string } | null): never {
  const msg = err?.message ?? '';
  const code = Object.keys(FORUM_MESSAGES).find((k) => msg.includes(k));
  if (code) throw forumError(code);
  if (err?.code === '23514' || msg.includes('check constraint')) throw new RepoError('INVALID', 'Girilen bilgilerden biri geçersiz. Kontrol et.');
  if (msg.includes('Failed to fetch') || msg.includes('Network request failed'))
    throw new RepoError('NETWORK', 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.');
  throw new RepoError('UNKNOWN', 'İşlem tamamlanamadı. Biraz sonra tekrar dene.');
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'video/mp4': 'mp4', 'video/quicktime': 'mov' };

export class ForumSupabaseRepo implements ForumRepo {
  constructor(private readonly sb: SupabaseClient) {}

  /** Ekleri tek seferde süreli imzalı bağlantıya çevirir */
  private async urls(paths: string[]): Promise<Map<string, string>> {
    if (paths.length === 0) return new Map();
    const { data } = await this.sb.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
    return new Map((data ?? []).map((d) => [d.path ?? '', d.signedUrl ?? '']));
  }

  private media(rows: Row[], urls: Map<string, string>): ForumMedia[] {
    return rows.map((m) => ({
      id: m.id, kind: m.kind, url: urls.get(m.storage_path) ?? '', mimeType: m.mime_type, sizeBytes: Number(m.size_bytes),
      durationSec: m.duration_sec == null ? null : Number(m.duration_sec),
    }));
  }

  private author(a: Row): ForumAuthor {
    return { businessId: a.business_id, businessName: a.business_name, city: a.city, verified: !!a.verified };
  }

  private post(j: Row, urls: Map<string, string>): ForumPost {
    return {
      id: j.id, author: this.author(j.author), mine: !!j.mine, category: j.category, title: j.title, body: j.body,
      media: this.media(j.media ?? [], urls), commentCount: Number(j.comment_count), solved: !!j.solved,
      createdAt: j.created_at, lastActivityAt: j.last_activity_at,
    };
  }

  async feed(category: ForumCategory | null) {
    const { data, error } = await this.sb.rpc('forum_feed', { p_category: category, p_before: null, p_limit: 30 });
    if (error) fail(error);
    const rows = (data ?? []) as Row[];
    const urls = await this.urls(rows.flatMap((p) => (p.media as Row[]).map((m) => m.storage_path)));
    return rows.map((p) => this.post(p, urls));
  }

  async getPost(id: string): Promise<ForumPostDetail> {
    const { data, error } = await this.sb.rpc('forum_post', { p_post_id: id });
    if (error) fail(error);
    const j = data as Row;
    const all = [...(j.media as Row[]), ...(j.comments as Row[]).flatMap((c) => c.media as Row[])];
    const urls = await this.urls(all.map((m) => m.storage_path));
    const comments: ForumComment[] = (j.comments as Row[]).map((c) => ({
      id: c.id, postId: c.post_id, author: this.author(c.author), mine: !!c.mine, body: c.body, media: this.media(c.media, urls), createdAt: c.created_at,
    }));
    return { ...this.post(j, urls), comments };
  }

  /** Ekleri yükler; sunucuya gönderilecek açıklamaları döner */
  private async upload(businessId: string, media: PendingForumMedia[]) {
    const out: Row[] = [];
    for (const m of media) {
      const path = `${businessId}/${Crypto.randomUUID()}.${EXT[m.mimeType] ?? 'bin'}`;
      const body = await (await fetch(m.uri)).arrayBuffer();
      const { error } = await this.sb.storage.from(BUCKET).upload(path, body, { contentType: m.mimeType, upsert: false });
      if (error) fail(error);
      out.push({ kind: m.kind, storage_path: path, mime_type: m.mimeType, size_bytes: body.byteLength, duration_sec: m.durationSec });
    }
    return out;
  }

  async createPost(input: NewForumPost) {
    const err = validateForumPost(input);
    if (err) throw new RepoError('INVALID', err);
    const media = await this.upload(input.businessId, input.media);
    const { data, error } = await this.sb.rpc('create_forum_post', {
      p: { business_id: input.businessId, category: input.category, title: input.title, body: input.body, client_request_id: input.clientRequestId, media },
    });
    if (error) fail(error);
    return data as string;
  }

  async addComment(input: NewForumComment) {
    const err = validateForumComment(input);
    if (err) throw new RepoError('INVALID', err);
    const media = await this.upload(input.businessId, input.media);
    const { data, error } = await this.sb.rpc('add_forum_comment', {
      p: { business_id: input.businessId, post_id: input.postId, body: input.body, client_request_id: input.clientRequestId, media },
    });
    if (error) fail(error);
    return data as string;
  }

  async deletePost(id: string) {
    const { error } = await this.sb.rpc('delete_forum_post', { p_post_id: id });
    if (error) fail(error);
  }

  async deleteComment(id: string) {
    const { error } = await this.sb.rpc('delete_forum_comment', { p_comment_id: id });
    if (error) fail(error);
  }

  async setSolved(id: string, solved: boolean) {
    const { error } = await this.sb.rpc('set_forum_post_solved', { p_post_id: id, p_solved: solved });
    if (error) fail(error);
  }

  async report(businessId: string, target: { postId?: string; commentId?: string }, reason: string | null) {
    const { error } = await this.sb.rpc('report_forum_content', {
      p_business_id: businessId, p_post_id: target.postId ?? null, p_comment_id: target.commentId ?? null, p_reason: reason,
    });
    if (error) fail(error);
  }

  async block(businessId: string, block: boolean) {
    const { error } = await this.sb.rpc('block_forum_business', { p_business_id: businessId, p_block: block });
    if (error) fail(error);
  }
}
