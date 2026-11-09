import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { accessRouter } from "./access";
import { profilesRouter } from "./routers/profiles";
import { teamRouter } from "./routers/team";
import { operationsRouter } from "./routers/operations";
import { inventoryRouter } from "./routers/inventory";
import { queueRouter } from "./routers/queue";
import { auditRouter } from "./routers/audit";
import { calendarRouter } from "./routers/calendar";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  access: accessRouter,
  profiles: profilesRouter,
  team: teamRouter,
  operations: operationsRouter,
  inventory: inventoryRouter,
  queue: queueRouter,
  audit: auditRouter,
  calendar: calendarRouter,
});

export type AppRouter = typeof appRouter;
