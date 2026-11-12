-- Role vocabulary and private staff roster; existing accounts are never inferred from names.
ALTER TABLE public.elab_ops_members DROP CONSTRAINT IF EXISTS elab_ops_members_role_check;
ALTER TABLE public.elab_ops_members ADD CONSTRAINT elab_ops_members_role_check CHECK (
 role IN ('owner','director','manager','admin','hr','reception','controls','cleaning','professional')
);
CREATE TABLE IF NOT EXISTS public.elab_ops_staff_directory(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 display_name text NOT NULL UNIQUE,
 proposed_role text NOT NULL CHECK (proposed_role IN ('owner','director','manager','admin','hr','reception','controls','cleaning','professional')),
 user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
 notes text,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.elab_ops_staff_directory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.elab_ops_staff_directory FROM anon,authenticated;
INSERT INTO public.elab_ops_staff_directory(display_name,proposed_role,notes) VALUES
('Bruna','reception','Confirmar e-mail; não confundir com Brunna nem Bruna Chagas'),
('Gabriele','manager','Confirmar e-mail antes de associar à conta existente'),
('Brunna','reception','Confirmar e-mail; pessoa distinta de Bruna'),
('Bruna Chagas','controls','Estoque'),
('Regina','cleaning','Limpeza'),
('Arlete','cleaning','Limpeza'),
('Patrícia','cleaning','Limpeza'),
('Evinho / Everson','director','Dono/diretor; confirmar nome e e-mail'),
('Déia','director','Sócia/dona/diretora; confirmar alcance de poderes de proprietária'),
('Karina','admin','Administradora; definir permissões detalhadas'),
('Kelly','hr','Recursos Humanos; definir permissões detalhadas')
ON CONFLICT(display_name) DO NOTHING;

-- Private staff list: direction can see roster, but cannot grant privileges without owner authorization.
CREATE OR REPLACE FUNCTION public.elab_ops_staff_directory_list()
RETURNS TABLE(staff_id bigint,display_name text,proposed_role text,account_email text,notes text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.elab_ops_members WHERE user_id=(SELECT auth.uid()) AND active AND role IN ('owner','director'))
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT s.id,s.display_name,s.proposed_role,u.email::text,s.notes
 FROM public.elab_ops_staff_directory s LEFT JOIN auth.users u ON u.id=s.user_id ORDER BY s.id;
END; $$;
REVOKE ALL ON FUNCTION public.elab_ops_staff_directory_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elab_ops_staff_directory_list() TO authenticated;

-- Only owner/director receive the comprehensive dashboard.
CREATE OR REPLACE FUNCTION public.elab_ops_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_counts jsonb;v_areas jsonb;v_operators jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.elab_ops_members WHERE user_id=(SELECT auth.uid()) AND active AND role IN ('owner','director'))
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.jsonb_build_object(
 'totalTasks',(SELECT count(*) FROM public.elab_ops_tasks),
 'activeTasks',(SELECT count(*) FROM public.elab_ops_tasks WHERE active),
 'totalEvents',(SELECT count(*) FROM public.elab_ops_events),
 'completedEvents',(SELECT count(*) FROM public.elab_ops_events WHERE event_type='completed'),
 'reopenedEvents',(SELECT count(*) FROM public.elab_ops_events WHERE event_type='reopened'),
 'totalAccounts',(SELECT count(*) FROM auth.users),
 'assignedOperators',(SELECT count(*) FROM public.elab_ops_members WHERE active),
 'pendingStaff',(SELECT count(*) FROM public.elab_ops_staff_directory WHERE user_id IS NULL),
 'queueStateRows',(SELECT count(*) FROM public.elab_state)) INTO v_counts;
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('area',area,'tasks',total,'active',enabled)),'[]'::jsonb)
 INTO v_areas FROM (SELECT area,count(*) total,count(*) FILTER (WHERE active) enabled FROM public.elab_ops_tasks GROUP BY area ORDER BY area) s;
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('actorId',actor_id,'events',events)),'[]'::jsonb)
 INTO v_operators FROM (SELECT actor_id,count(*) events FROM public.elab_ops_events GROUP BY actor_id ORDER BY events DESC LIMIT 30) s;
 RETURN v_counts || pg_catalog.jsonb_build_object('areas',v_areas,'operatorActivity',v_operators);
END; $$;
REVOKE ALL ON FUNCTION public.elab_ops_dashboard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elab_ops_dashboard() TO authenticated;

-- Only owner/director see the complete Auth account roster.
CREATE OR REPLACE FUNCTION public.elab_ops_admin_users()
RETURNS TABLE(user_id uuid,email text,confirmed boolean,last_sign_in_at timestamptz,role text,active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.elab_ops_members WHERE user_id=(SELECT auth.uid()) AND active AND role IN ('owner','director'))
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT u.id,u.email::text,u.email_confirmed_at IS NOT NULL,u.last_sign_in_at,m.role,m.active
 FROM auth.users u LEFT JOIN public.elab_ops_members m ON m.user_id=u.id ORDER BY u.created_at;
END; $$;
REVOKE ALL ON FUNCTION public.elab_ops_admin_users() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elab_ops_admin_users() TO authenticated;

-- Granting roles is exclusively owner-controlled; no automatic grants from roster names.
CREATE OR REPLACE FUNCTION public.elab_ops_set_user_role(p_user_id uuid,p_role text,p_active boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_email text;v_old_role text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.elab_ops_members WHERE user_id=(SELECT auth.uid()) AND active AND role='owner')
 THEN RAISE EXCEPTION 'Owner required' USING ERRCODE='42501'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('director','manager','admin','hr','reception','controls','cleaning','professional') OR p_active IS NULL
 THEN RAISE EXCEPTION 'Invalid role' USING ERRCODE='22023'; END IF;
 SELECT email INTO v_email FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL;
 IF v_email IS NULL THEN RAISE EXCEPTION 'Confirmed account not found' USING ERRCODE='22023'; END IF;
 SELECT role INTO v_old_role FROM public.elab_ops_members WHERE user_id=p_user_id FOR UPDATE;
 IF v_old_role='owner' OR p_user_id=(SELECT auth.uid()) THEN RAISE EXCEPTION 'Owner cannot be reassigned' USING ERRCODE='42501'; END IF;
 INSERT INTO public.elab_ops_members(user_id,role,active) VALUES(p_user_id,p_role,p_active)
 ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role,active=EXCLUDED.active;
 RETURN pg_catalog.jsonb_build_object('ok',true,'userId',p_user_id,'role',p_role,'active',p_active);
END; $$;
REVOKE ALL ON FUNCTION public.elab_ops_set_user_role(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elab_ops_set_user_role(uuid,text,boolean) TO authenticated;
