create policy "own reports: delete" on public.bug_reports for delete to authenticated using (user_id = (select auth.uid()));
create policy "bug-reports: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'bug-reports' and (storage.foldername(name))[1] = (select auth.uid())::text);;
