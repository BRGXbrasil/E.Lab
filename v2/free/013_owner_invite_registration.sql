-- Owner-approved registration without collecting staff email addresses.
-- One-time codes are SHA-256 hashed; no password or code plaintext is stored.
CREATE TABLE IF NOT EXISTS public.elab_ops_registration_invites (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 username text NOT NULL REFERENCES public.elab_ops_usernames(username),
 code_sha256 text NOT NULL UNIQUE CHECK (length(code_sha256)=64),
 issued_by uuid NOT NULL REFERENCES auth.users(id),
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS elab_ops_invites_user_idx ON public.elab_ops_registration_invites(username,expires_at);
ALTER TABLE public.elab_ops_registration_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.elab_ops_registration_invites FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.elab_ops_create_staff_invite(p_username text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_token text;v_hash text;v_id bigint;v_current uuid;
BEGIN
 v_current:=(SELECT auth.uid());
 IF NOT EXISTS (SELECT 1 FROM public.elab_ops_members
 WHERE user_id=v_current AND active AND role='owner') THEN
 RAISE EXCEPTION 'Owner authorization required' USING ERRCODE='42501';END IF;
 IF p_username IS NULL OR NOT EXISTS (
 SELECT 1 FROM public.elab_ops_usernames a
 JOIN public.elab_ops_staff_directory s ON s.id=a.staff_id
 WHERE a.username=p_username AND a.user_id IS NULL AND NOT a.active
 AND s.user_id IS NULL AND s.proposed_role<>'owner')
 THEN RAISE EXCEPTION 'Not a pending staff account' USING ERRCODE='22023';END IF;
 UPDATE public.elab_ops_registration_invites SET consumed_at=now()
 WHERE username=p_username AND consumed_at IS NULL;
 v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 v_hash:=encode(sha256(convert_to(v_token,'UTF8')),'hex');
 INSERT INTO public.elab_ops_registration_invites(username,code_sha256,issued_by,expires_at)
 VALUES(p_username,v_hash,v_current,now()+interval '48 hours')
 RETURNING id INTO v_id;
 RETURN pg_catalog.jsonb_build_object('username',p_username,'code',v_token,'expiresAt',now()+interval '48 hours');
END $$;
REVOKE ALL ON FUNCTION public.elab_ops_create_staff_invite(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elab_ops_create_staff_invite(text) TO authenticated;

-- Called exclusively from the server-side service role after Auth creates a new user.
CREATE OR REPLACE FUNCTION public.elab_ops_claim_staff_invite(p_code_sha256 text,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_invite_id bigint;v_username text;v_staff_id bigint;v_existing uuid;v_role text;
BEGIN
 SELECT i.id,i.username INTO v_invite_id,v_username
 FROM public.elab_ops_registration_invites i
 WHERE i.code_sha256=p_code_sha256 AND i.consumed_at IS NULL AND i.expires_at>now()
 FOR UPDATE;
 IF v_invite_id IS NULL THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501';END IF;
 SELECT a.staff_id,a.user_id,s.proposed_role INTO v_staff_id,v_existing,v_role
 FROM public.elab_ops_usernames a
 JOIN public.elab_ops_staff_directory s ON s.id=a.staff_id
 WHERE a.username=v_username FOR UPDATE OF a;
 IF v_staff_id IS NULL OR v_existing IS NOT NULL OR v_role NOT IN ('director','manager','admin','hr','reception','controls','cleaning','professional')
 THEN RAISE EXCEPTION 'Registration not allowed' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL)
 THEN RAISE EXCEPTION 'New Auth account not confirmed' USING ERRCODE='42501';END IF;
 UPDATE public.elab_ops_staff_directory SET user_id=p_user_id WHERE id=v_staff_id AND user_id IS NULL;
 UPDATE public.elab_ops_usernames SET user_id=p_user_id,active=true WHERE username=v_username AND user_id IS NULL;
 INSERT INTO public.elab_ops_members(user_id,role,active) VALUES(p_user_id,v_role,true);
 UPDATE public.elab_ops_registration_invites SET consumed_at=now() WHERE id=v_invite_id;
 RETURN pg_catalog.jsonb_build_object('username',v_username,'role',v_role,'ok',true);
END $$;
REVOKE ALL ON FUNCTION public.elab_ops_claim_staff_invite(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.elab_ops_claim_staff_invite(text,uuid) TO service_role;
