-- Read-only direction audit of the original Lista da Vez event history.
-- Protect client/professional names: never expose this RPC to anonymous or sector accounts.
CREATE OR REPLACE FUNCTION public.elab_ops_queue_history(p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_records jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.elab_ops_members m WHERE m.user_id=(SELECT auth.uid()) AND m.active
 AND m.role IN ('owner','director','admin','hr')) THEN
 RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>500 THEN RAISE EXCEPTION 'Invalid limit' USING ERRCODE='22023';END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(row_payload ORDER BY recorded_at DESC),'[]'::jsonb)
 INTO v_records
 FROM (
   SELECT event.value->>'at' recorded_at,
   pg_catalog.jsonb_build_object(
    'at',event.value->>'at',
    'service',area.key,
    'type',event.value->>'type',
    'category',event.value->>'category',
    'professional',event.value->>'professional',
    'client',event.value->>'client',
    'effect',event.value->>'effect',
    'legacy',event.value->'legacy'
   ) row_payload
   FROM public.elab_state q
   CROSS JOIN LATERAL jsonb_each(q.data) area(key,value)
   CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(area.value->'events')='array' THEN area.value->'events' ELSE '[]'::jsonb END
   ) event(value)
   WHERE q.id='lista-da-vez-principal'
   ORDER BY event.value->>'at' DESC NULLS LAST
   LIMIT p_limit
 ) rows;
 RETURN v_records;
END $$;
REVOKE ALL ON FUNCTION public.elab_ops_queue_history(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elab_ops_queue_history(integer) TO authenticated;
