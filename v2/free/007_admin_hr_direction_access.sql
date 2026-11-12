-- Confirmed account bindings are performed separately in a private SQL operation.
-- Administration and HR may see the same operational data and direction dashboard;
-- only the owner can grant/revoke roles or ownership.
DROP POLICY IF EXISTS elab_ops_tasks_read ON public.elab_ops_tasks;
CREATE POLICY elab_ops_tasks_read ON public.elab_ops_tasks FOR SELECT TO authenticated
USING (EXISTS (
 SELECT 1 FROM public.elab_ops_members m
 WHERE m.user_id=(SELECT auth.uid()) AND m.active
 AND (m.role IN ('owner','director','manager','admin','hr')
   OR (active AND (
    (m.role='reception' AND area='reception') OR
    (m.role='controls' AND area='stock') OR
    (m.role='cleaning' AND area='cleaning')
   )))
));
DROP POLICY IF EXISTS elab_ops_events_read ON public.elab_ops_events;
CREATE POLICY elab_ops_events_read ON public.elab_ops_events FOR SELECT TO authenticated
USING (EXISTS (
 SELECT 1 FROM public.elab_ops_members m
 JOIN public.elab_ops_tasks t ON t.id=task_id
 WHERE m.user_id=(SELECT auth.uid()) AND m.active
 AND (m.role IN ('owner','director','manager','admin','hr')
 OR (m.role='reception' AND t.area='reception')
 OR (m.role='controls' AND t.area='stock')
 OR (m.role='cleaning' AND t.area='cleaning'))
));
-- Direction/Administration/HR get the same dashboard and account/roster read access.
-- Change only the explicit authorized role checks, retaining the existing function bodies.
DO $$
DECLARE v_func text; v_def text; v_new text;
BEGIN
 FOREACH v_func IN ARRAY ARRAY['elab_ops_dashboard','elab_ops_admin_users','elab_ops_staff_directory_list']
 LOOP
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname=v_func;
  IF v_def IS NULL OR position('role IN (''owner'',''director'')' IN v_def)=0 THEN
   RAISE EXCEPTION 'Expected access guard missing for %',v_func;
  END IF;
  v_new:=replace(v_def,'role IN (''owner'',''director'')','role IN (''owner'',''director'',''admin'',''hr'')');
  EXECUTE v_new;
 END LOOP;
 SELECT pg_get_functiondef(p.oid) INTO v_def
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='elab_ops_record_event';
 IF v_def IS NULL OR position('v_role IN (''owner'',''director'',''manager'')' IN v_def)=0 THEN
  RAISE EXCEPTION 'Expected write access guard missing';
 END IF;
 EXECUTE replace(v_def,'v_role IN (''owner'',''director'',''manager'')','v_role IN (''owner'',''director'',''manager'',''admin'',''hr'')');
END $$;
-- Queue policy: signed-in direction/admin/hr can manage queue; anonymous public read stays intact.
DROP POLICY IF EXISTS elab_state_authenticated_insert ON public.elab_state;
CREATE POLICY elab_state_authenticated_insert ON public.elab_state FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.elab_ops_members m
 WHERE m.user_id=(SELECT auth.uid()) AND m.active
 AND m.role IN ('owner','director','manager','admin','hr','reception')));
DROP POLICY IF EXISTS elab_state_authenticated_update ON public.elab_state;
CREATE POLICY elab_state_authenticated_update ON public.elab_state FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.elab_ops_members m
 WHERE m.user_id=(SELECT auth.uid()) AND m.active
 AND m.role IN ('owner','director','manager','admin','hr','reception')))
WITH CHECK (EXISTS (SELECT 1 FROM public.elab_ops_members m
 WHERE m.user_id=(SELECT auth.uid()) AND m.active
 AND m.role IN ('owner','director','manager','admin','hr','reception')));
