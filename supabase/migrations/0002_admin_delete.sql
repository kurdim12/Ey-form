-- Admin guest management: allow the authenticated admin to delete a
-- registration (e.g. test/duplicate entries) and its photo.

-- Delete registrations
create policy "admin_delete" on public.registrations
  for delete to authenticated
  using (true);

-- Delete photos from the public bucket
create policy "admin_delete_photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos');
