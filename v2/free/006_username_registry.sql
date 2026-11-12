-- Username registry: display aliases do not grant an account or a role.
UPDATE public.elab_ops_staff_directory SET display_name='Bruna Nunes',notes='Recepção. Confirmar vínculo com conta existente' WHERE display_name='Bruna' AND user_id IS NULL;
UPDATE public.elab_ops_staff_directory SET display_name='Brunna Gomes',notes='Recepção. Conta ainda não localizada' WHERE display_name='Brunna' AND user_id IS NULL;
UPDATE public.elab_ops_staff_directory SET display_name='Evinho',notes='Também conhecido como Everson. Confirmar identidade' WHERE display_name='Evinho / Everson' AND user_id IS NULL;
CREATE TABLE IF NOT EXISTS public.elab_ops_usernames (
 username text PRIMARY KEY,
 staff_id bigint UNIQUE REFERENCES public.elab_ops_staff_directory(id),
 user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
 active boolean NOT NULL DEFAULT false,
 created_at timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT elab_username_chars CHECK (username ~ '^[a-z0-9]+(?:[ ._-][a-z0-9]+)*$')
);
ALTER TABLE public.elab_ops_usernames ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.elab_ops_usernames FROM anon,authenticated;
INSERT INTO public.elab_ops_usernames(username,staff_id)
SELECT lower(display_name),id FROM public.elab_ops_staff_directory
ON CONFLICT(username) DO NOTHING;
-- Owner verified via existing Auth email. A username isn't a replacement for that unique identity.
INSERT INTO public.elab_ops_usernames(username,user_id,active)
SELECT 'dieggob',id,true FROM auth.users
WHERE lower(email)='dieggob@me.com' AND email_confirmed_at IS NOT NULL
ON CONFLICT(username) DO UPDATE SET user_id=EXCLUDED.user_id,active=true;
-- Existing Bruna and Gabriele emails are not linked from guesswork.
-- Authentication endpoint uses service-side lookup; password never stored in username registry.
