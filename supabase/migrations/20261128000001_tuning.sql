-- Yeni işletme kategorisi: Tuning ve modifiye (araç sahipleri Servisler rehberinde bulur ve teklif ister).
alter type public.business_category add value if not exists 'tuning' after 'appraisal';
