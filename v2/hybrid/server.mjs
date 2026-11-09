import { createServer } from "node:http";
import { verifySession } from "./auth.mjs";
import { listTasks, recordTaskEvent } from "./operations.mjs";

export function makeHandler({ db, config, verify = verifySession }) {
  return async (request, response) => {
    const respond = (status, data) => { response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); response.end(JSON.stringify(data)); };
    try {
      const path = new URL(request.url, "http://localhost").pathname;
      if (path === "/health" && request.method === "GET") return respond(200, { ok: true });
      if (!["/api/operational-tasks", "/api/operational-events"].includes(path)) return respond(404, { error: "Não encontrado" });
      const user = await verify(request.headers.authorization, config);
      if (!user) return respond(401, { error: "Sessão inválida" });
      const [members] = await db.execute("SELECT email, role FROM team_members WHERE email = ? AND active = 1 LIMIT 1", [user.email]);
      const actor = members[0];
      if (!actor) return respond(403, { error: "Operador não autorizado" });
      if (path === "/api/operational-tasks" && request.method === "GET") return respond(200, { tasks: await listTasks(db, actor) });
      if (path === "/api/operational-events" && request.method === "POST") {
        let body = "";
        for await (const chunk of request) { body += chunk; if (body.length > 8192) return respond(413, { error: "Corpo excessivo" }); }
        let input;
        try { input = JSON.parse(body); } catch { return respond(400, { error: "JSON inválido" }); }
        return respond(200, await recordTaskEvent(db, actor, input));
      }
      return respond(405, { error: "Método não permitido" });
    } catch (error) {
      const status = [400, 403, 404].includes(error.status) ? error.status : 503;
      if (status === 503) console.error("Erro operacional:", error);
      return respond(status, { error: status === 503 ? "Serviço temporariamente indisponível" : error.message });
    }
  };
}

export async function start() {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, DATABASE_URL, PORT = "3100" } = process.env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !DATABASE_URL) throw new Error("Configuração de ambiente incompleta");
  const { createPool } = await import("mysql2/promise");
  const db = createPool({ uri: DATABASE_URL, connectionLimit: 5, waitForConnections: true });
  const config = { supabaseUrl: new URL(SUPABASE_URL).origin, supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY };
  const server = createServer(makeHandler({ db, config }));
  server.listen(Number(PORT), "127.0.0.1");
  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) start().catch(error => { console.error(error); process.exitCode = 1; });
