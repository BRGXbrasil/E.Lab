-- Free-tier-only operational fallback. STAGING FILE: review before applying.
-- Creates isolated tables; leaves public.elab_state and Supabase Realtime untouched.
CREATE TABLE IF NOT EXISTS public.elab_ops_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('manager','reception','controls','cleaning','professional')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.elab_ops_tasks (
  id varchar(36) PRIMARY KEY,
  area text NOT NULL CHECK (area IN ('reception','stock','cleaning')),
  cadence text NOT NULL CHECK (cadence IN ('daily','weekly','monthly','three_per_week','on_demand')),
  title varchar(240) NOT NULL,
  when_text varchar(240) NOT NULL,
  weekdays jsonb,
  day_of_month int,
  source_key varchar(32) NOT NULL,
  source_row int NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.elab_ops_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id varchar(36) NOT NULL REFERENCES public.elab_ops_tasks(id),
  business_date date NOT NULL,
  event_type text NOT NULL CHECK(event_type IN ('completed','reopened')),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS elab_ops_events_task_date_idx ON public.elab_ops_events(task_id,business_date,created_at DESC);
CREATE TABLE IF NOT EXISTS public.elab_ops_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL,
  task_id varchar(36) NOT NULL,
  action text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.elab_ops_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elab_ops_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elab_ops_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elab_ops_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.elab_ops_members, public.elab_ops_tasks, public.elab_ops_events, public.elab_ops_audit FROM anon;
GRANT SELECT ON public.elab_ops_members,public.elab_ops_tasks,public.elab_ops_events TO authenticated;
DROP POLICY IF EXISTS elab_ops_member_self ON public.elab_ops_members;
CREATE POLICY elab_ops_member_self ON public.elab_ops_members FOR SELECT TO authenticated USING (user_id=(select auth.uid()));
DROP POLICY IF EXISTS elab_ops_tasks_read ON public.elab_ops_tasks;
CREATE POLICY elab_ops_tasks_read ON public.elab_ops_tasks FOR SELECT TO authenticated
USING (active AND EXISTS (
 SELECT 1 FROM public.elab_ops_members m WHERE m.user_id=(select auth.uid()) AND m.active
 AND (m.role='manager' OR (m.role='reception' AND area='reception') OR (m.role='controls' AND area='stock') OR (m.role='cleaning' AND area='cleaning'))
));
DROP POLICY IF EXISTS elab_ops_events_read ON public.elab_ops_events;
CREATE POLICY elab_ops_events_read ON public.elab_ops_events FOR SELECT TO authenticated
USING (EXISTS (
 SELECT 1 FROM public.elab_ops_members m JOIN public.elab_ops_tasks t ON t.id=task_id
 WHERE m.user_id=(select auth.uid()) AND m.active
 AND (m.role='manager' OR (m.role='reception' AND t.area='reception') OR (m.role='controls' AND t.area='stock') OR (m.role='cleaning' AND t.area='cleaning'))
));
-- Authorization in the procedure is explicit: no broad authenticated write grants.
CREATE OR REPLACE FUNCTION public.elab_ops_record_event(p_task_id varchar, p_business_date date, p_event_type text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user uuid; v_role text; v_area text; v_previous text; v_id uuid;
BEGIN
  v_user := (select auth.uid());
  IF v_user IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='28000'; END IF;
  SELECT m.role INTO v_role FROM public.elab_ops_members m WHERE m.user_id=v_user AND m.active;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Unauthorized member' USING ERRCODE='42501'; END IF;
  IF p_event_type NOT IN ('completed','reopened') OR p_event_type IS NULL OR p_business_date IS NULL OR length(coalesce(p_note,''))>2000 THEN
    RAISE EXCEPTION 'Invalid event' USING ERRCODE='22023';
  END IF;
  -- Serializes concurrent updates to the same task, before reading latest event.
  SELECT t.area INTO v_area FROM public.elab_ops_tasks t WHERE t.id=p_task_id AND t.active FOR UPDATE;
  IF v_area IS NULL THEN RAISE EXCEPTION 'Task not found' USING ERRCODE='22023'; END IF;
  IF NOT (v_role='manager' OR (v_role='reception' AND v_area='reception') OR (v_role='controls' AND v_area='stock') OR (v_role='cleaning' AND v_area='cleaning')) THEN
    RAISE EXCEPTION 'Area forbidden' USING ERRCODE='42501';
  END IF;
  SELECT e.event_type INTO v_previous FROM public.elab_ops_events e
    WHERE e.task_id=p_task_id AND e.business_date=p_business_date
    ORDER BY e.created_at DESC,e.id DESC LIMIT 1;
  IF (v_previous='completed')=(p_event_type='completed') THEN
    RETURN pg_catalog.jsonb_build_object('changed',false,'completed',(p_event_type='completed'));
  END IF;
  INSERT INTO public.elab_ops_events(task_id,business_date,event_type,actor_id,note)
  VALUES(p_task_id,p_business_date,p_event_type,v_user,p_note) RETURNING id INTO v_id;
  INSERT INTO public.elab_ops_audit(actor_id,task_id,action) VALUES(v_user,p_task_id,p_event_type);
  RETURN pg_catalog.jsonb_build_object('changed',true,'completed',(p_event_type='completed'),'eventId',v_id);
END; $$;
REVOKE ALL ON FUNCTION public.elab_ops_record_event(varchar,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elab_ops_record_event(varchar,date,text,text) TO authenticated;
-- Operator memberships are assigned only by an administrator through trusted SQL.
-- Do not activate imported tasks before reviewing the exact schedules and permissions.
