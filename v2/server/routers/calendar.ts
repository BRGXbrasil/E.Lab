import { asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { operationalTaskDefinitions } from "../../drizzle/schema";
import { managementProcedure } from "../access";
import { getDb } from "../db";
import { router } from "../_core/trpc";

/** Read-only, authenticated view of the imported catalogue.
 * Task execution is deliberately not enabled until the event model is tested. */
export const calendarRouter = router({
  list: managementProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    return db.select().from(operationalTaskDefinitions).orderBy(asc(operationalTaskDefinitions.area), asc(operationalTaskDefinitions.title));
  }),
});
