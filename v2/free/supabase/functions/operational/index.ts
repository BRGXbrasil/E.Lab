// Free-tier operational API. Deploy only after reviewing and applying staging SQL.
// Supabase Auth verifies users; Postgres RLS + RPC enforce area permissions.
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
function reply(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: cors });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!["GET", "POST"].includes(req.method)) return reply(405, { error: "Method not allowed" });
  const token = /^(?:Bearer) ([A-Za-z0-9._~-]+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return reply(401, { error: "Missing session" });
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) return reply(503, { error: "Service unavailable" });
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: identity, error: identityError } = await db.auth.getUser(token);
  if (identityError || !identity.user?.id) return reply(401, { error: "Invalid session" });
  const { data: member, error: memberError } = await db.from("elab_ops_members")
    .select("role").eq("user_id", identity.user.id).eq("active", true).maybeSingle();
  if (memberError) return reply(503, { error: "Member lookup failed" });
  if (!member) return reply(403, { error: "Operator not authorized" });
  try {
    const route = new URL(req.url).pathname.split("/").pop();
    if (req.method === "GET" && route === "operational") {
      const { data, error } = await db.from("elab_ops_tasks")
        .select("id,area,cadence,title,when_text,weekdays,day_of_month")
        .eq("active", true).order("area").order("title");
      if (error) return reply(503, { error: "Task lookup failed" });
      const date = new URL(req.url).searchParams.get("date");
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply(400, { error: "Invalid date" });
      let events: unknown[] = [];
      if (date) {
        const outcome=await db.from("elab_ops_events")
          .select("task_id,event_type,event_order").eq("business_date",date).order("event_order",{ascending:false}).limit(3000);
        if(outcome.error)return reply(503,{error:"Event lookup failed"});
        const seen=new Set<string>();
        events=(outcome.data??[]).filter(e=>{if(seen.has(e.task_id))return false;seen.add(e.task_id);return true;});
      }
      return reply(200, { tasks: data ?? [], events, role: member.role });
    }
    if (req.method === "POST" && route === "operational") {
      const raw = await req.text();
      if (raw.length > 8192) return reply(413, { error: "Request too large" });
      let body: Record<string, unknown>;
      try { body = JSON.parse(raw); } catch { return reply(400, { error: "Malformed JSON" }); }
      if (typeof body.taskId !== "string" || body.taskId.length > 36 ||
          typeof body.businessDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.businessDate) ||
          !["completed", "reopened"].includes(String(body.eventType)) ||
          (body.note != null && (typeof body.note !== "string" || body.note.length > 2000))) {
        return reply(400, { error: "Invalid event" });
      }
      const { data, error } = await db.rpc("elab_ops_record_event", {
        p_task_id: body.taskId, p_business_date: body.businessDate,
        p_event_type: body.eventType, p_note: body.note ?? null,
      });
      if (error) return reply(error.code === "42501" ? 403 : error.code === "22023" ? 400 : 503,
        { error: "Event rejected" });
      return reply(200, data);
    }
    return reply(404, { error: "Unknown endpoint" });
  } catch {
    return reply(503, { error: "Service temporarily unavailable" });
  }
});
