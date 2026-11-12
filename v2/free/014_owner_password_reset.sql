-- Owner-assisted password recovery for staff using username instead of email.
ALTER TABLE public.elab_ops_registration_invites
 ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'register'
 CHECK (purpose IN ('register','reset'));

CREATE OR REPLACE FUNCTION public.elab_ops_create_password_reset(p_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_token text;v_hash text;v_actor uuid;
BEGIN
 v_actor:=(SELECT auth.uid());
 IF NOT EXISTS(SELECT 1 FROM public.elab_ops_members m
 WHERE m.user_id=v_actor AND m.active AND m.role='owner') THEN
 RAISE EXCEPTION 'Owner authorization required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.elab_ops_usernames n
 JOIN public.elab_ops_members m ON m.user_id=n.user_id
 WHERE n.username=p_username AND n.active AND n.user_id IS NOT NULL
 AND m.active AND m.role<>'owner')
 THEN RAISE EXCEPTION 'Active staff member not found' USING ERRCODE='22023';END IF;
 UPDATE public.elab_ops_registration_invites SET consumed_at=now()
 WHERE username=p_username AND purpose='reset' AND consumed_at IS NULL;
 v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 v_hash:=encode(sha256(convert_to(v_token,'UTF8')),'hex');
 INSERT INTO public.elab_ops_registration_invites(username,code_sha256,issued_by,expires_at,purpose)
 VALUES(p_username,v_hash,v_actor,now()+interval '24 hours','reset');
 RETURN pg_catalog.jsonb_build_object('username',p_username,'code',v_token,'expiresAt',now()+interval '24 hours');
END $$;
REVOKE ALL ON FUNCTION public.elab_ops_create_password_reset(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elab_ops_create_password_reset(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.elab_ops_claim_password_reset(p_code_sha256 text,p_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id bigint;v_user uuid;
BEGIN
 SELECT id INTO v_id FROM public.elab_ops_registration_invites
 WHERE username=p_username AND code_sha256=p_code_sha256 AND purpose='reset'
 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Reset code unavailable' USING ERRCODE='42501';END IF;
 SELECT a.user_id INTO v_user FROM public.elab_ops_usernames a
 JOIN public.elab_ops_members m ON m.user_id=a.user_id
 WHERE a.username=p_username AND a.active AND m.active AND m.role<>'owner';
 IF v_user IS NULL THEN RAISE EXCEPTION 'Account not active' USING ERRCODE='42501';END IF;
 UPDATE public.elab_ops_registration_invites SET consumed_at=now() WHERE id=v_id;
 RETURN pg_catalog.jsonb_build_object('userId',v_user,'ok',true);
END $$;
REVOKE ALL ON FUNCTION public.elab_ops_claim_password_reset(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.elab_ops_claim_password_reset(text,text) TO service_role;
