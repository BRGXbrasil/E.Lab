-- Enforce due date and reject future-dated completions while preserving events and historical records.
CREATE OR REPLACE FUNCTION public.elab_ops_record_event(p_task_id varchar,p_business_date date,p_event_type text,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid;v_role text;v_area text;v_cadence text;v_day int;v_weekdays jsonb;v_previous text;v_id uuid;v_order bigint;
BEGIN
 v_user:=(SELECT auth.uid());
 IF v_user IS NULL THEN RAISE EXCEPTION 'Unauthenticated' USING ERRCODE='28000';END IF;
 SELECT role INTO v_role FROM public.elab_ops_members WHERE user_id=v_user AND active;
 IF v_role IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';END IF;
 IF p_event_type IS NULL OR p_event_type NOT IN ('completed','reopened','occurred') OR p_business_date IS NULL OR length(coalesce(p_note,''))>2000
 THEN RAISE EXCEPTION 'Invalid event' USING ERRCODE='22023';END IF;
 SELECT area,cadence,day_of_month,weekdays INTO v_area,v_cadence,v_day,v_weekdays
 FROM public.elab_ops_tasks WHERE id=p_task_id AND active FOR UPDATE;
 IF v_area IS NULL THEN RAISE EXCEPTION 'Task not available' USING ERRCODE='22023';END IF;
 IF NOT (v_role IN ('owner','director','manager','admin','hr')
 OR (v_role='reception' AND v_area='reception')
 OR (v_role='controls' AND v_area='stock')
 OR (v_role='cleaning' AND v_area='cleaning'))
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 -- Enforce calendar eligibility on server as well as in the browser.
 IF p_business_date>(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
 RAISE EXCEPTION 'Future completion not permitted' USING ERRCODE='22023';END IF;
 IF v_cadence IN ('weekly','three_per_week') AND NOT
 COALESCE(v_weekdays @> pg_catalog.jsonb_build_array(EXTRACT(DOW FROM p_business_date)::int),false)
 THEN RAISE EXCEPTION 'Task not scheduled on this weekday' USING ERRCODE='22023';END IF;
 IF v_cadence='monthly' AND v_day IS NOT NULL AND EXTRACT(DAY FROM p_business_date)::int<>v_day
 THEN RAISE EXCEPTION 'Task not scheduled on this date' USING ERRCODE='22023';END IF;
 IF (v_cadence='on_demand')<>(p_event_type='occurred') THEN
   RAISE EXCEPTION 'Incorrect event type for task cadence' USING ERRCODE='22023';END IF;
 IF v_cadence='monthly' AND v_day IS NULL THEN
 SELECT event_type INTO v_previous FROM public.elab_ops_events
 WHERE task_id=p_task_id AND business_date >= date_trunc('month',p_business_date)::date
 AND business_date < (date_trunc('month',p_business_date)+interval '1 month')::date
 ORDER BY event_order DESC LIMIT 1;
 ELSE
 SELECT event_type INTO v_previous FROM public.elab_ops_events
 WHERE task_id=p_task_id AND business_date=p_business_date ORDER BY event_order DESC LIMIT 1;
 END IF;
 IF v_cadence<>'on_demand' AND COALESCE(v_previous='completed',false)=(p_event_type='completed') THEN
 RETURN pg_catalog.jsonb_build_object('changed',false,'completed',p_event_type='completed');END IF;
 INSERT INTO public.elab_ops_events(task_id,business_date,event_type,actor_id,note)
 VALUES(p_task_id,p_business_date,p_event_type,v_user,p_note) RETURNING id,event_order INTO v_id,v_order;
 INSERT INTO public.elab_ops_audit(actor_id,task_id,action) VALUES(v_user,p_task_id,p_event_type);
 RETURN pg_catalog.jsonb_build_object('changed',true,'completed',p_event_type='completed',
 'eventId',v_id,'order',v_order);
END $$;
REVOKE ALL ON FUNCTION public.elab_ops_record_event(varchar,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elab_ops_record_event(varchar,date,text,text) TO authenticated;
