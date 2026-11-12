-- Deterministic operational event sequence for concurrent writes.
ALTER TABLE public.elab_ops_events ADD COLUMN IF NOT EXISTS event_order bigint GENERATED ALWAYS AS IDENTITY;
CREATE INDEX IF NOT EXISTS elab_ops_events_latest_idx ON public.elab_ops_events(task_id,business_date,event_order DESC);
CREATE OR REPLACE FUNCTION public.elab_ops_record_event(p_task_id varchar,p_business_date date,p_event_type text,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid;v_role text;v_area text;v_previous text;v_id uuid;v_order bigint;
BEGIN
 v_user:=(SELECT auth.uid());
 IF v_user IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='28000';END IF;
 SELECT role INTO v_role FROM public.elab_ops_members WHERE user_id=v_user AND active;
 IF v_role IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';END IF;
 IF p_event_type IS NULL OR p_event_type NOT IN ('completed','reopened') OR p_business_date IS NULL OR length(coalesce(p_note,''))>2000
 THEN RAISE EXCEPTION 'Invalid event' USING ERRCODE='22023';END IF;
 SELECT area INTO v_area FROM public.elab_ops_tasks WHERE id=p_task_id AND active FOR UPDATE;
 IF v_area IS NULL THEN RAISE EXCEPTION 'Task not available' USING ERRCODE='22023';END IF;
 IF NOT (v_role IN ('owner','director','manager','admin','hr')
 OR (v_role='reception' AND v_area='reception')
 OR (v_role='controls' AND v_area='stock')
 OR (v_role='cleaning' AND v_area='cleaning'))
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 SELECT event_type INTO v_previous FROM public.elab_ops_events
 WHERE task_id=p_task_id AND business_date=p_business_date
 ORDER BY event_order DESC LIMIT 1;
 IF COALESCE(v_previous='completed',false)=(p_event_type='completed') THEN
 RETURN pg_catalog.jsonb_build_object('changed',false,'completed',p_event_type='completed');END IF;
 INSERT INTO public.elab_ops_events(task_id,business_date,event_type,actor_id,note)
 VALUES(p_task_id,p_business_date,p_event_type,v_user,p_note) RETURNING id,event_order INTO v_id,v_order;
 INSERT INTO public.elab_ops_audit(actor_id,task_id,action) VALUES(v_user,p_task_id,p_event_type);
 RETURN pg_catalog.jsonb_build_object('changed',true,'completed',p_event_type='completed','eventId',v_id,'order',v_order);
END $$;
REVOKE ALL ON FUNCTION public.elab_ops_record_event(varchar,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elab_ops_record_event(varchar,date,text,text) TO authenticated;
-- Activate only explicit, unambiguous daily/weekly/three-times-weekly and exact-date monthly schedules.
-- Flexible month windows and on-demand triggers require separate business definitions.
UPDATE public.elab_ops_tasks SET active=true
WHERE cadence IN ('daily','weekly','three_per_week')
OR (cadence='monthly' AND day_of_month BETWEEN 1 AND 31);
