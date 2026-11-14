-- Storage: belgeler ve araç fotoğrafları. İkisi de özel (public değil); dosyalar "<user_id>/..." klasöründe.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 10485760, array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf']),
  ('vehicle-photos', 'vehicle-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do nothing;

create policy "dosya: kendi klasörü okur" on storage.objects for select to authenticated
  using (bucket_id in ('documents', 'vehicle-photos') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "dosya: kendi klasörüne yükler" on storage.objects for insert to authenticated
  with check (bucket_id in ('documents', 'vehicle-photos') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "dosya: kendi klasöründe günceller" on storage.objects for update to authenticated
  using (bucket_id in ('documents', 'vehicle-photos') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "dosya: kendi klasöründen siler" on storage.objects for delete to authenticated
  using (bucket_id in ('documents', 'vehicle-photos') and (storage.foldername(name))[1] = auth.uid()::text);
