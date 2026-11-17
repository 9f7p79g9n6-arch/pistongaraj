import { describe, expect, it } from 'vitest';
import { timeAgoTR, validateForumComment, validateForumMedia, validateForumPost } from '../src/forum';

const img = (sizeBytes = 1000) => ({ kind: 'image' as const, mimeType: 'image/jpeg', sizeBytes, durationSec: null });
const vid = (durationSec: number | null = 20, sizeBytes = 1000) => ({ kind: 'video' as const, mimeType: 'video/mp4', sizeBytes, durationSec });

describe('forum ekleri', () => {
  it('en fazla 4 fotoğraf ya da 1 video', () => {
    expect(validateForumMedia([img(), img(), img(), img()])).toBeNull();
    expect(validateForumMedia([img(), img(), img(), img(), img()])).toMatch(/4 fotoğraf/);
    expect(validateForumMedia([vid()])).toBeNull();
    expect(validateForumMedia([vid(), vid()])).toMatch(/1 video/);
    expect(validateForumMedia([vid(), img()])).toMatch(/ikisi birden/);
  });
  it('boyut, süre ve tür sınırı', () => {
    expect(validateForumMedia([img(11 * 1024 * 1024)])).toMatch(/10 MB/);
    expect(validateForumMedia([vid(20, 51 * 1024 * 1024)])).toMatch(/50 MB/);
    expect(validateForumMedia([vid(75)])).toMatch(/60 saniye/);
    expect(validateForumMedia([vid(null)])).toBeNull();
    expect(validateForumMedia([{ ...img(), mimeType: 'image/gif' }])).toMatch(/JPEG/);
  });
});

describe('forum gönderisi ve yanıt', () => {
  it('başlık zorunlu, kategori geçerli olmalı', () => {
    expect(validateForumPost({ title: 'Fren', body: '', category: 'ariza', media: [] })).toMatch(/en az 5/);
    expect(validateForumPost({ title: 'Egea fren sesi', body: '', category: 'yok', media: [] })).toMatch(/kategori/);
    expect(validateForumPost({ title: '  Egea fren sesi  ', body: 'x'.repeat(3000), category: 'ariza', media: [img()] })).toBeNull();
    expect(validateForumPost({ title: 'Egea fren sesi', body: 'x'.repeat(3001), category: 'ariza', media: [] })).toMatch(/3000/);
  });
  it('yanıtta metin ya da ek olmalı', () => {
    expect(validateForumComment({ body: '  ', media: [] })).toMatch(/Bir şey yaz/);
    expect(validateForumComment({ body: '', media: [img()] })).toBeNull();
    expect(validateForumComment({ body: 'Balata değiştir', media: [] })).toBeNull();
  });
});

describe('zaman', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  it('Türkçe göreli zaman', () => {
    expect(timeAgoTR('2026-11-17T11:59:40Z', now)).toBe('şimdi');
    expect(timeAgoTR('2026-11-17T11:30:00Z', now)).toBe('30 dk önce');
    expect(timeAgoTR('2026-11-17T09:00:00Z', now)).toBe('3 sa önce');
    expect(timeAgoTR('2026-11-16T10:00:00Z', now)).toBe('dün');
    expect(timeAgoTR('2026-11-13T10:00:00Z', now)).toBe('4 gün önce');
  });
});
