-- Director/owner access: only confirmed Supabase accounts; no changes to public.elab_state.
ALTER TABLE public.elab_ops_members DROP CONSTRAINT IF EXISTS elab_ops_members_role_check;
ALTER TABLE public.elab_ops_members ADD CONSTRAINT elab_ops_members_role_check CHECK (
 role IN ('owner','director','manager','reception','controls','cleaning','professional')
);
CREATE INDEX IF NOT EXISTS elab_ops_events_actor_idx ON public.elab_ops_events(actor_id,created_at DESC);
DROP POLICY IF EXISTS elab_ops_tasks_read ON public.elab_ops_tasks;
CREATE POLICY elab_ops_tasks_read ON public.elab_ops_tasks FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.elab_ops_members m WHERE m.user_id=(SELECT auth.uid()) AND m.active
 AND ((m.role IN ('owner','director','manager')) OR (active AND
 ((m.role='reception' AND area='reception') OR (m.role='controls' AND area='stock') OR (m.role='cleaning' AND area='cleaning'))))
));
DROP POLICY IF EXISTS elab_ops_events_read ON public.elab_ops_events;
CREATE POLICY elab_ops_events_read ON public.elab_ops_events FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.elab_ops_members m JOIN public.elab_ops_tasks t ON t.id=task_id
 WHERE m.user_id=(SELECT auth.uid()) AND m.active AND
 (m.role IN ('owner','director','manager') OR
 (m.role='reception' AND t.area='reception') OR
 (m.role='controls' AND t.area='stock') OR
 (m.role='cleaning' AND t.area='cleaning')))
);
-- Existing event RPC has explicit role checks: include owner and director.
CREATE OR REPLACE FUNCTION public.elab_ops_record_event(p_task_id varchar,p_business_date date,p_event_type text,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user uuid; v_role text; v_area text; v_previous text; v_id uuid;
BEGIN
 v_user:=(SELECT auth.uid());
 IF v_user IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='28000'; END IF;
 SELECT role INTO v_role FROM public.elab_ops_members WHERE user_id=v_user AND active;
 IF v_role IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 IF p_event_type NOT IN ('completed','reopened') OR p_event_type IS NULL OR p_business_date IS NULL OR length(coalesce(p_note,''))>2000
 THEN RAISE EXCEPTION 'Invalid event' USING ERRCODE='22023'; END IF;
 SELECT area INTO v_area FROM public.elab_ops_tasks WHERE id=p_task_id AND active FOR UPDATE;
 IF v_area IS NULL THEN RAISE EXCEPTION 'Unknown or inactive task' USING ERRCODE='22023'; END IF;
 IF NOT (v_role IN ('owner','director','manager') OR
 (v_role='reception' AND v_area='reception') OR
 (v_role='controls' AND v_area='stock') OR
 (v_role='cleaning' AND v_area='cleaning')) THEN
 RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT event_type INTO v_previous FROM public.elab_ops_events WHERE task_id=p_task_id AND business_date=p_business_date ORDER BY created_at DESC,id DESC LIMIT 1;
 IF COALESCE(v_previous='completed',false)=(p_event_type='completed') THEN
 RETURN pg_catalog.jsonb_build_object('changed',false,'completed',(p_event_type='completed')); END IF;
 INSERT INTO public.elab_ops_events(task_id,business_date,event_type,actor_id,note)
 VALUES(p_task_id,p_business_date,p_event_type,v_user,p_note) RETURNING id INTO v_id;
 INSERT INTO public.elab_ops_audit(actor_id,task_id,action) VALUES(v_user,p_task_id,p_event_type);
 RETURN pg_catalog.jsonb_build_object('changed',true,'completed',p_event_type='completed','eventId',v_id);
END; $$;
REVOKE ALL ON FUNCTION public.elab_ops_record_event(varchar,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elab_ops_record_event(varchar,date,text,text) TO authenticated;

-- Administrator read only. No user emails returned to sector-only accounts.
CREATE OR REPLACE FUNCTION public.elab_ops_admin_users()
RETURNS TABLE(user_id uuid,email text,confirmed boolean,last_sign_in_at timestamptz,role text,active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.elab_ops_members m WHERE m.user_id=(SELECT auth.uid()) AND m.active AND m.role IN ('owner','director','manager'))
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT u.id,u.email::text,u.email_confirmed_at IS NOT NULL,u.last_sign_in_at,m.role,m.active
 FROM auth.users u LEFT JOIN public.elab_ops_members m ON m.user_id=u.id ORDER BY u.created_at;
END; $$;
REVOKE ALL ON FUNCTION public.elab_ops_admin_users() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elab_ops_admin_users() TO authenticated;

-- Only the verified owner assigns roles to existing confirmed Auth accounts.
CREATE OR REPLACE FUNCTION public.elab_ops_set_user_role(p_user_id uuid,p_role text,p_active boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_email text; v_old_role text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.elab_ops_members WHERE user_id=(SELECT auth.uid()) AND active AND role='owner')
 THEN RAISE EXCEPTION 'Owner role required' USING ERRCODE='42501'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('director','manager','reception','controls','cleaning','professional') OR p_active IS NULL
 THEN RAISE EXCEPTION 'Invalid role' USING ERRCODE='22023'; END IF;
 SELECT email INTO v_email FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL;
 IF v_email IS NULL THEN RAISE EXCEPTION 'Confirmed user not found' USING ERRCODE='22023'; END IF;
 SELECT role INTO v_old_role FROM public.elab_ops_members WHERE user_id=p_user_id FOR UPDATE;
 IF v_old_role='owner' OR p_user_id=(SELECT auth.uid()) THEN
 RAISE EXCEPTION 'Owner cannot be reassigned' USING ERRCODE='42501'; END IF;
 INSERT INTO public.elab_ops_members(user_id,role,active) VALUES (p_user_id,p_role,p_active)
 ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role,active=EXCLUDED.active;
 RETURN pg_catalog.jsonb_build_object('ok',true,'userId',p_user_id,'role',p_role,'active',p_active);
END; $$;
REVOKE ALL ON FUNCTION public.elab_ops_set_user_role(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elab_ops_set_user_role(uuid,text,boolean) TO authenticated;

-- Aggregated director/owner dashboard, including operational and existing queue counts.
CREATE OR REPLACE FUNCTION public.elab_ops_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_counts jsonb; v_areas jsonb; v_operators jsonb; v_queue bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.elab_ops_members WHERE user_id=(SELECT auth.uid()) AND active AND role IN ('owner','director','manager'))
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.jsonb_build_object(
 'totalTasks',(SELECT count(*) FROM public.elab_ops_tasks),
 'activeTasks',(SELECT count(*) FROM public.elab_ops_tasks WHERE active),
 'totalEvents',(SELECT count(*) FROM public.elab_ops_events),
 'completedEvents',(SELECT count(*) FROM public.elab_ops_events WHERE event_type='completed'),
 'reopenedEvents',(SELECT count(*) FROM public.elab_ops_events WHERE event_type='reopened'),
 'totalAccounts',(SELECT count(*) FROM auth.users),
 'assignedOperators',(SELECT count(*) FROM public.elab_ops_members WHERE active),
 'queueStateRows',(SELECT count(*) FROM public.elab_state)
 ) INTO v_counts;
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('area',area,'tasks',total,'active',enabled)),'[]'::jsonb)
 INTO v_areas FROM (SELECT area,count(*) total,count(*) FILTER (WHERE active) enabled FROM public.elab_ops_tasks GROUP BY area ORDER BY area) s;
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('actorId',actor_id,'events',events)),'[]'::jsonb)
 INTO v_operators FROM (SELECT actor_id,count(*) events FROM public.elab_ops_events GROUP BY actor_id ORDER BY events DESC LIMIT 30) s;
 RETURN v_counts || pg_catalog.jsonb_build_object('areas',v_areas,'operatorActivity',v_operators);
END; $$;
REVOKE ALL ON FUNCTION public.elab_ops_dashboard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elab_ops_dashboard() TO authenticated;

-- Register confirmed owner identity only; all other roles remain unassigned.
INSERT INTO public.elab_ops_members(user_id,role,active)
SELECT id,'owner',true FROM auth.users WHERE lower(email)='dieggob@me.com' AND email_confirmed_at IS NOT NULL
ON CONFLICT(user_id) DO UPDATE SET role='owner',active=true;
