/** Verify a Supabase session remotely; never trust browser-supplied identity. */
export async function verifySession(header, config, fetcher = fetch) {
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header || "");
  if (!match) return null;
  const response = await fetcher(`${config.supabaseUrl}/auth/v1/user`, {
    headers: { authorization: `Bearer ${match[1]}`, apikey: config.supabasePublishableKey },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return null;
  const user = await response.json();
  if (!user?.id || !user?.email || !user?.email_confirmed_at) return null;
  return { id: user.id, email: user.email.toLowerCase() };
}

export function canAccessArea(role, area) {
  if (role === "manager") return true;
  return ({ reception: "reception", stock: "controls", cleaning: "cleaning" })[area] === role;
}
