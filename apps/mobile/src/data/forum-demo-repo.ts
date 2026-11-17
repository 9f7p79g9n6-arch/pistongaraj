/**
 * Usta Forumu DEMO veri katmanı. Veriler yalnızca bu cihazda (AsyncStorage) tutulur; başka işletmeler görmez.
 * Boş görünmesin diye iki "örnek" konu ile başlar; bunlar örnek olarak işaretlidir.
 * Sunucudaki kuralların aynısını uygular: ek sınırı, tekrar gönderim engeli, yalnızca kendi içeriğini silme,
 * engelleme ve 3 şikâyette gizleme (demoda tek kullanıcı olduğu için şikâyet edilen içerik kullanıcıdan gizlenir).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
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

import { forumError, type ForumPostDetail, type ForumRepo, type NewForumComment, type NewForumPost, type PendingForumMedia } from './forum-repo';
import { RepoError } from './repo';
import type { ServiceRepo } from './service-repo';

const KEY = 'piston-forum-demo-v1';

interface StoredPost {
  id: string; author: ForumAuthor; mine: boolean; category: ForumCategory; title: string; body: string; media: ForumMedia[];
  solved: boolean; createdAt: string; lastActivityAt: string; deletedAt: string | null; reported: boolean; sample?: boolean;
  clientRequestId: string;
}
interface StoredComment {
  id: string; postId: string; author: ForumAuthor; mine: boolean; body: string; media: ForumMedia[]; createdAt: string;
  deletedAt: string | null; reported: boolean; clientRequestId: string;
}
interface State { posts: StoredPost[]; comments: StoredComment[]; blocked: string[] }

const SAMPLE_A: ForumAuthor = { businessId: 'ornek-1', businessName: 'Örnek Oto Elektrik', city: 'Kayseri', verified: true };
const SAMPLE_B: ForumAuthor = { businessId: 'ornek-2', businessName: 'Örnek Motor Servisi', city: 'Gaziantep', verified: true };

function seed(): State {
  const h = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();
  return {
    posts: [
      {
        id: 'ornek-konu-1', author: SAMPLE_A, mine: false, category: 'elektrik', title: 'Clio 4 marş basmıyor, akü yeni (örnek konu)',
        body: 'Akü ve marş motoru yeni. Kontakta göstergeler yanıyor ama marş hiç tepki vermiyor. Immobilizer arızası gören oldu mu?',
        media: [], solved: false, createdAt: h(26), lastActivityAt: h(3), deletedAt: null, reported: false, sample: true, clientRequestId: 'ornek-1',
      },
      {
        id: 'ornek-konu-2', author: SAMPLE_B, mine: false, category: 'motor', title: '1.6 TDCi enjektör sökme ipucu (örnek konu)',
        body: 'Sıkışan enjektörleri çekmek için kullandığımız yöntemi paylaşıyorum. Önce bölgeyi temizleyip pas sökücü ile bir gece bekletin.',
        media: [], solved: true, createdAt: h(50), lastActivityAt: h(30), deletedAt: null, reported: false, sample: true, clientRequestId: 'ornek-2',
      },
    ],
    comments: [
      {
        id: 'ornek-yanit-1', postId: 'ornek-konu-1', author: SAMPLE_B, mine: false,
        body: 'Anahtardaki çipi kontrol edin; yedek anahtarla deneyin. Bizde iki kez anahtar pili çıktı. (örnek yanıt)',
        media: [], createdAt: h(3), deletedAt: null, reported: false, clientRequestId: 'ornek-y1',
      },
    ],
    blocked: [],
  };
}

const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class ForumDemoRepo implements ForumRepo {
  private state: State | null = null;
  constructor(private readonly service: ServiceRepo) {}

  private async load(): Promise<State> {
    if (this.state) return this.state;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      this.state = raw ? (JSON.parse(raw) as State) : seed();
    } catch {
      this.state = seed();
    }
    return this.state;
  }
  private async save() {
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      throw new RepoError('STORAGE', 'Cihaza kaydedilemedi. Depolama alanını kontrol et.');
    }
  }

  private async author(businessId: string): Promise<ForumAuthor> {
    const b = (await this.service.listMyBusinesses()).find((x) => x.id === businessId);
    if (!b) throw forumError('FORBIDDEN');
    if (b.status === 'suspended') throw forumError('BUSINESS_SUSPENDED');
    return { businessId: b.id, businessName: b.name, city: b.city, verified: b.status === 'active' };
  }

  private toMedia(m: PendingForumMedia[]): ForumMedia[] {
    return m.map((x) => ({ id: Crypto.randomUUID(), kind: x.kind, url: x.uri, mimeType: x.mimeType, sizeBytes: x.sizeBytes, durationSec: x.durationSec }));
  }

  private visible(s: State, p: StoredPost) {
    return !p.deletedAt && !p.reported && !s.blocked.includes(p.author.businessId);
  }

  private view(s: State, p: StoredPost): ForumPost {
    const commentCount = s.comments.filter((c) => c.postId === p.id && !c.deletedAt).length;
    return copy({
      id: p.id, author: p.author, mine: p.mine, category: p.category, title: p.title, body: p.body, media: p.media,
      commentCount, solved: p.solved, createdAt: p.createdAt, lastActivityAt: p.lastActivityAt, sample: p.sample,
    });
  }

  async feed(category: ForumCategory | null) {
    const s = await this.load();
    return s.posts
      .filter((p) => this.visible(s, p) && (!category || p.category === category))
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
      .map((p) => this.view(s, p));
  }

  async getPost(id: string): Promise<ForumPostDetail> {
    const s = await this.load();
    const p = s.posts.find((x) => x.id === id);
    if (!p || !this.visible(s, p)) throw forumError('NOT_FOUND');
    const comments: ForumComment[] = s.comments
      .filter((c) => c.postId === id && !c.deletedAt && !c.reported && !s.blocked.includes(c.author.businessId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => copy({ id: c.id, postId: c.postId, author: c.author, mine: c.mine, body: c.body, media: c.media, createdAt: c.createdAt }));
    return { ...this.view(s, p), comments };
  }

  async createPost(input: NewForumPost) {
    const s = await this.load();
    const existing = s.posts.find((p) => p.clientRequestId === input.clientRequestId);
    if (existing) return existing.id;
    const err = validateForumPost(input);
    if (err) throw new RepoError('INVALID', err);
    const author = await this.author(input.businessId);
    const now = new Date().toISOString();
    const p: StoredPost = {
      id: Crypto.randomUUID(), author, mine: true, category: input.category, title: input.title.trim(), body: input.body.trim(),
      media: this.toMedia(input.media), solved: false, createdAt: now, lastActivityAt: now, deletedAt: null, reported: false,
      clientRequestId: input.clientRequestId,
    };
    s.posts.push(p);
    await this.save();
    return p.id;
  }

  async addComment(input: NewForumComment) {
    const s = await this.load();
    const existing = s.comments.find((c) => c.clientRequestId === input.clientRequestId);
    if (existing) return existing.id;
    const p = s.posts.find((x) => x.id === input.postId && !x.deletedAt);
    if (!p) throw forumError('NOT_FOUND');
    const err = validateForumComment(input);
    if (err) throw new RepoError('INVALID', err);
    const author = await this.author(input.businessId);
    const now = new Date().toISOString();
    const c: StoredComment = {
      id: Crypto.randomUUID(), postId: p.id, author, mine: true, body: input.body.trim(), media: this.toMedia(input.media),
      createdAt: now, deletedAt: null, reported: false, clientRequestId: input.clientRequestId,
    };
    s.comments.push(c);
    p.lastActivityAt = now;
    await this.save();
    return c.id;
  }

  async deletePost(id: string) {
    const s = await this.load();
    const p = s.posts.find((x) => x.id === id);
    if (!p || !p.mine) throw forumError('FORBIDDEN');
    p.deletedAt ??= new Date().toISOString();
    await this.save();
  }

  async deleteComment(id: string) {
    const s = await this.load();
    const c = s.comments.find((x) => x.id === id);
    if (!c || !c.mine) throw forumError('FORBIDDEN');
    c.deletedAt ??= new Date().toISOString();
    await this.save();
  }

  async setSolved(id: string, solved: boolean) {
    const s = await this.load();
    const p = s.posts.find((x) => x.id === id);
    if (!p || !p.mine || p.deletedAt) throw forumError('FORBIDDEN');
    p.solved = solved;
    await this.save();
  }

  async report(_businessId: string, target: { postId?: string; commentId?: string }) {
    const s = await this.load();
    const t = target.postId ? s.posts.find((x) => x.id === target.postId) : s.comments.find((x) => x.id === target.commentId);
    if (!t) throw forumError('NOT_FOUND');
    t.reported = true;
    await this.save();
  }

  async block(businessId: string, block: boolean) {
    const s = await this.load();
    if ((await this.service.listMyBusinesses()).some((b) => b.id === businessId)) throw forumError('BLOCK_SELF');
    s.blocked = block ? [...new Set([...s.blocked, businessId])] : s.blocked.filter((x) => x !== businessId);
    await this.save();
  }
}
