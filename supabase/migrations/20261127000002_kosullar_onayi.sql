-- Kullanım koşulları onayı (Apple 1.2: kullanıcı içeriği olan uygulamada koşulların kabulü).
-- Onaylar consents tablosunda ekle-oku olarak tutulur; metin sürümü text_version alanındadır.
alter type public.consent_type add value if not exists 'terms';
