drop policy "own imports" on public.imports;
create policy "own imports" on public.imports for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))));;
