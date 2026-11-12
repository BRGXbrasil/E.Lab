-- Public read-only Lista da Vez; only authenticated, approved roles may mutate.
-- Keep existing public SELECT policy intact.
DROP POLICY IF EXISTS elab_state_authenticated_insert ON public.elab_state;
CREATE POLICY elab_state_authenticated_insert ON public.elab_state FOR INSERT TO authenticated
WITH CHECK (EXISTS(SELECT 1 FROM public.elab_ops_members m
 WHERE m.user_id=(SELECT auth.uid()) AND m.active
 AND m.role IN ('owner','director','manager','reception')));
DROP POLICY IF EXISTS elab_state_authenticated_update ON public.elab_state;
CREATE POLICY elab_state_authenticated_update ON public.elab_state FOR UPDATE TO authenticated
USING (EXISTS(SELECT 1 FROM public.elab_ops_members m
 WHERE m.user_id=(SELECT auth.uid()) AND m.active
 AND m.role IN ('owner','director','manager','reception')))
WITH CHECK (EXISTS(SELECT 1 FROM public.elab_ops_members m
 WHERE m.user_id=(SELECT auth.uid()) AND m.active
 AND m.role IN ('owner','director','manager','reception')));
