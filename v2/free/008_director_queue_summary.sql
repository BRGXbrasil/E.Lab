-- Director-only queue indicators extracted from original persisted state; never rewrite it.
CREATE OR REPLACE FUNCTION public.elab_ops_queue_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_revision bigint;v_updated timestamptz;v_sections jsonb;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.elab_ops_members m WHERE m.user_id=(SELECT auth.uid()) AND m.active
 AND m.role IN ('owner','director','admin','hr')) THEN
 RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 SELECT revision,updated_at INTO v_revision,v_updated
 FROM public.elab_state WHERE id='lista-da-vez-principal';
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
 'service',service,
 'professionals',CASE WHEN jsonb_typeof(info->'people')='array' THEN jsonb_array_length(info->'people') ELSE 0 END,
 'attendance',CASE WHEN jsonb_typeof(info->'log')='array' THEN jsonb_array_length(info->'log') ELSE 0 END,
 'events',CASE WHEN jsonb_typeof(info->'events')='array' THEN jsonb_array_length(info->'events') ELSE 0 END,
 'futureQueue',CASE WHEN jsonb_typeof(info->'futureQueue')='array' THEN jsonb_array_length(info->'futureQueue') ELSE 0 END,
 'absent',CASE WHEN jsonb_typeof(info->'absent')='array' THEN jsonb_array_length(info->'absent') ELSE 0 END
 )),'[]'::jsonb) INTO v_sections
 FROM public.elab_state state CROSS JOIN LATERAL jsonb_each(state.data) t(service,info)
 WHERE state.id='lista-da-vez-principal';
 RETURN pg_catalog.jsonb_build_object('revision',v_revision,'updatedAt',v_updated,'services',COALESCE(v_sections,'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.elab_ops_queue_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elab_ops_queue_summary() TO authenticated;
