-- Private in-database snapshot of the original Lista da Vez (never in public GitHub).
CREATE TABLE IF NOT EXISTS public.elab_ops_queue_snapshots (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source_id text NOT NULL,
 source_revision bigint NOT NULL,
 queue_data jsonb NOT NULL,
 original_updated_at timestamptz,
 captured_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_id,source_revision)
);
ALTER TABLE public.elab_ops_queue_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.elab_ops_queue_snapshots FROM anon,authenticated;
INSERT INTO public.elab_ops_queue_snapshots(source_id,source_revision,queue_data,original_updated_at)
SELECT id,revision,data,updated_at FROM public.elab_state
WHERE id='lista-da-vez-principal'
ON CONFLICT(source_id,source_revision) DO NOTHING;
