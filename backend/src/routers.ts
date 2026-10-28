import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, permissionProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as erp from "./erpDb";
import {
  countAdmins,
  createPasswordUser,
  getAuthUserByEmail,
  getUserById,
  listUsers,
  setUserRole,
  setUserStatus,
  upsertUser,
  createOrganization,
  getOrganizationById,
  getOrganizationBySlug,
  searchOrganizations,
  createJoinRequest,
  getActiveJoinRequestForUser,
  listJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  withdrawJoinRequest,
  listNotifications,
  countUnreadNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "./db";
import { normalizeEmail, verifyPassword } from "./password";
import { checkRateLimit, clearRateLimit, recordFailedAttempt } from "./rateLimiter";
import { sdk } from "./_core/sdk";

const currency = z.enum(["USD", "EUR", "GBP"]);
const employmentStatus = z.enum(["Active", "On leave", "Inactive"]);
const clientStatus = z.enum(["Active", "Inactive"]);
const projectStatus = z.enum(["Active", "On hold", "Closed"]);
const billingClassification = z.enum(["Billable", "Non-billable"]);
const timeEntryStatus = z.enum(["Draft", "Submitted", "Approved", "Rejected"]);
const userRole = z.enum(["admin", "manager", "finance", "consultant", "user"]);
const userStatus = z.enum(["active", "disabled"]);

const consultantInput = z.object({
  employeeCode: z.string().trim().min(1).max(32),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  role: z.string().trim().min(1).max(160),
  department: z.string().trim().min(1).max(160),
  employmentStatus,
  weeklyCapacityHours: z.coerce.number().positive().max(168),
  billingRate: z.coerce.number().nonnegative(),
  currency,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const clientInput = z.object({
  clientCode: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(200),
  status: clientStatus,
  defaultCurrency: currency,
});

const projectInput = z.object({
  clientId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  status: projectStatus,
  billingCurrency: currency,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const timeEntryInput = z.object({
  consultantId: z.string().min(1),
  clientId: z.string().min(1),
  projectId: z.string().min(1),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(5000),
  hours: z.coerce.number().positive().max(24),
  billingClassification,
  billingRate: z.coerce.number().nonnegative().nullable().optional(),
  currency: currency.nullable().optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    canSetupAdmin: publicProcedure.query(async () => {
      const adminCount = await countAdmins();
      return { canSetup: adminCount === 0 };
    }),
    setupAdmin: publicProcedure
      .input(
        z.object({
          name: z.string().trim().min(1, "Name is required").max(100),
          email: z.string().trim().email("Invalid email address"),
          password: z.string().min(8, "Password must be at least 8 characters").max(128),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const adminCount = await countAdmins();
        if (adminCount > 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Initial administrator setup has already been completed.",
          });
        }

        const normalized = normalizeEmail(input.email);
        const existing = await getAuthUserByEmail(normalized);
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A user with this email address already exists.",
          });
        }

        const user = await createPasswordUser({
          name: input.name,
          email: normalized,
          password: input.password,
          role: "admin",
          membershipStatus: "active",
        });

        const token = await sdk.createSessionToken(user.openId, { name: user.name || user.email || "" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);

        return user;
      }),
    registerOrganization: publicProcedure
      .input(
        z.object({
          organizationName: z.string().trim().min(2, "Organization name must be at least 2 characters").max(100),
          organizationSlug: z.string().trim().min(2, "Identifier must be at least 2 characters").max(50),
          description: z.string().trim().max(500).optional(),
          adminName: z.string().trim().min(1, "Name is required").max(100),
          adminEmail: z.string().trim().email("Invalid email address"),
          password: z.string().min(8, "Password must be at least 8 characters").max(128),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const slug = input.organizationSlug.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        const existingOrg = await getOrganizationBySlug(slug);
        if (existingOrg) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Organization identifier "${slug}" is already taken. Please choose another.`,
          });
        }

        const normalized = normalizeEmail(input.adminEmail);
        const existingUser = await getAuthUserByEmail(normalized);
        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with this email address already exists.",
          });
        }

        const user = await createPasswordUser({
          name: input.adminName,
          email: normalized,
          password: input.password,
          role: "admin",
          membershipStatus: "active",
        });

        const org = await createOrganization({
          name: input.organizationName,
          slug,
          description: input.description,
          creatorUserId: user.id,
        });

        const token = await sdk.createSessionToken(user.openId, { name: user.name || user.email || "" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);

        return {
          user: {
            ...user,
            organizationId: org.id,
            membershipStatus: "active" as const,
          },
          organization: org,
        };
      }),
    signup: publicProcedure
      .input(
        z.object({
          name: z.string().trim().min(1, "Name is required").max(100),
          email: z.string().trim().email("Invalid email address"),
          password: z.string().min(8, "Password must be at least 8 characters").max(128),
          organizationId: z.string().optional(),
          requestedRole: userRole.optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const normalized = normalizeEmail(input.email);
        const existingUser = await getAuthUserByEmail(normalized);
        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with this email address already exists.",
          });
        }

        const user = await createPasswordUser({
          name: input.name,
          email: normalized,
          password: input.password,
          role: "user",
          membershipStatus: input.organizationId ? "pending" : "unassigned",
          organizationId: input.organizationId ?? null,
        });

        if (input.organizationId) {
          try {
            await createJoinRequest({
              organizationId: input.organizationId,
              userId: user.id,
              userName: input.name,
              userEmail: normalized,
              requestedRole: input.requestedRole ?? "consultant",
            });
          } catch (err) {
            console.warn("[Signup] Error creating join request:", err);
          }
        }

        const token = await sdk.createSessionToken(user.openId, { name: user.name || user.email || "" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);

        return user;
      }),
    login: publicProcedure
      .input(
        z.object({
          email: z.string().trim().email("Invalid email address"),
          password: z.string().min(1, "Password is required"),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const ip = ctx.req.ip || ctx.req.socket?.remoteAddress || "127.0.0.1";
        const normalized = normalizeEmail(input.email);
        const rateLimitKey = `${ip}:${normalized}`;

        checkRateLimit(rateLimitKey);

        const user = await getAuthUserByEmail(normalized);
        if (!user || !user.passwordHash || !user.passwordSalt || !verifyPassword(input.password, user.passwordHash, user.passwordSalt)) {
          recordFailedAttempt(rateLimitKey);
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password.",
          });
        }

        if (user.status === "disabled") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Account is disabled. Please contact your administrator.",
          });
        }

        clearRateLimit(rateLimitKey);

        const token = await sdk.createSessionToken(user.openId, { name: user.name || user.email || "" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);

        await upsertUser({ openId: user.openId, lastSignedIn: new Date() });

        return {
          id: user._id.toHexString(),
          openId: user.openId,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status ?? "active",
          membershipStatus: user.membershipStatus,
          organizationId: user.organizationId?.toHexString() ?? null,
          consultantId: user.consultantId?.toHexString() ?? null,
        };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  organizations: router({
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
          slug: z.string().trim().min(2, "Identifier must be at least 2 characters").max(50),
          description: z.string().trim().max(500).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.organizationId && ctx.user.membershipStatus === "active") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You already belong to an active organization.",
          });
        }
        try {
          return await createOrganization({
            name: input.name,
            slug: input.slug,
            description: input.description,
            creatorUserId: ctx.user.id,
          });
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Failed to create organization",
          });
        }
      }),
    search: publicProcedure
      .input(z.object({ query: z.string().default(""), limit: z.number().int().min(1).max(50).default(20) }))
      .query(async ({ input }) => {
        return searchOrganizations(input.query, input.limit);
      }),
    get: publicProcedure
      .input(z.object({ slug: z.string().optional(), id: z.string().optional() }))
      .query(async ({ input }) => {
        if (input.slug) {
          const org = await getOrganizationBySlug(input.slug);
          if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
          return { id: org.id, name: org.name, slug: org.slug, description: org.description };
        }
        if (input.id) {
          const org = await getOrganizationById(input.id);
          if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
          return { id: org.id, name: org.name, slug: org.slug, description: org.description };
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: "Either id or slug must be provided" });
      }),
    current: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.organizationId) return null;
      return getOrganizationById(ctx.user.organizationId);
    }),
  }),
  joinRequests: router({
    submit: protectedProcedure
      .input(
        z.object({
          organizationId: z.string().min(1),
          requestedRole: userRole.optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.membershipStatus === "active") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You are already an active member of an organization.",
          });
        }
        try {
          return await createJoinRequest({
            organizationId: input.organizationId,
            userId: ctx.user.id,
            userName: ctx.user.name || "Employee",
            userEmail: ctx.user.email || "",
            requestedRole: input.requestedRole,
          });
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Failed to submit join request",
          });
        }
      }),
    myRequest: protectedProcedure.query(async ({ ctx }) => {
      return getActiveJoinRequestForUser(ctx.user.id);
    }),
    withdraw: protectedProcedure
      .input(z.object({ requestId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await withdrawJoinRequest({ requestId: input.requestId, userId: ctx.user.id });
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Failed to withdraw request",
          });
        }
      }),
    list: protectedProcedure
      .input(z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"]).optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" || !ctx.user.organizationId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only organization administrators can view join requests.",
          });
        }
        return listJoinRequests(ctx.user.organizationId, input?.status);
      }),
    approve: protectedProcedure
      .input(
        z.object({
          requestId: z.string().min(1),
          assignedRole: userRole,
          consultantId: z.string().nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" || !ctx.user.organizationId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only organization administrators can approve join requests.",
          });
        }
        try {
          return await approveJoinRequest({
            requestId: input.requestId,
            reviewerAdminId: ctx.user.id,
            assignedRole: input.assignedRole,
            consultantId: input.consultantId,
          });
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Failed to approve request",
          });
        }
      }),
    reject: protectedProcedure
      .input(
        z.object({
          requestId: z.string().min(1),
          reason: z.string().trim().max(1000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" || !ctx.user.organizationId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only organization administrators can reject join requests.",
          });
        }
        try {
          return await rejectJoinRequest({
            requestId: input.requestId,
            reviewerAdminId: ctx.user.id,
            reason: input.reason,
          });
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Failed to reject request",
          });
        }
      }),
  }),
  notifications: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).default({ limit: 50 }))
      .query(async ({ ctx, input }) => {
        return listNotifications(ctx.user.id, input.limit);
      }),
    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return { count: await countUnreadNotifications(ctx.user.id) };
    }),
    markAsRead: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        return { success: await markNotificationAsRead(input.id, ctx.user.id) };
      }),
    markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
      return { updatedCount: await markAllNotificationsAsRead(ctx.user.id) };
    }),
  }),
  users: router({
    list: adminProcedure.query(({ ctx }) => listUsers(ctx.user.organizationId ?? undefined)),
    create: adminProcedure
      .input(
        z.object({
          name: z.string().trim().min(1, "Name is required").max(100),
          email: z.string().trim().email("Invalid email address"),
          password: z.string().min(8, "Password must be at least 8 characters").max(128),
          role: userRole,
          consultantId: z.string().min(1).nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.role === "consultant" && !input.consultantId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A consultant role requires a consultant record assignment.",
          });
        }
        try {
          return await createPasswordUser({
            name: input.name,
            email: input.email,
            password: input.password,
            role: input.role,
            consultantId: input.consultantId,
            organizationId: ctx.user.organizationId ?? null,
            membershipStatus: ctx.user.organizationId ? "active" : "unassigned",
          });
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Failed to create user",
          });
        }
      }),
    setRole: adminProcedure
      .input(z.object({ userId: z.string().min(1), role: userRole, consultantId: z.string().min(1).nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.id === input.userId) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot change your own role." });
        if (input.role === "consultant" && !input.consultantId) throw new TRPCError({ code: "BAD_REQUEST", message: "A consultant role requires a consultant record assignment." });
        const target = await getUserById(input.userId);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
        if (ctx.user.organizationId && target.organizationId && ctx.user.organizationId !== target.organizationId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot manage users of another organization." });
        }
        return setUserRole(input.userId, input.role, input.consultantId);
      }),
    setStatus: adminProcedure
      .input(z.object({ userId: z.string().min(1), status: userStatus }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.id === input.userId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You cannot disable your own account." });
        }
        const target = await getUserById(input.userId);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
        if (ctx.user.organizationId && target.organizationId && ctx.user.organizationId !== target.organizationId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot manage users of another organization." });
        }
        return setUserStatus(input.userId, input.status);
      }),
  }),
  consultants: router({
    list: permissionProcedure("consultants.read").query(({ ctx }) => erp.listConsultants(ctx.user)),
    get: permissionProcedure("consultants.read").input(z.object({ id: z.string().min(1) })).query(({ ctx, input }) => erp.getConsultant(input.id, ctx.user)),
    create: permissionProcedure("consultants.manage").input(consultantInput).mutation(({ ctx, input }) => erp.createConsultant(input, ctx.user)),
    update: permissionProcedure("consultants.manage").input(z.object({ id: z.string().min(1), data: consultantInput })).mutation(({ ctx, input }) => erp.updateConsultant(input.id, input.data, ctx.user)),
    deactivate: permissionProcedure("consultants.manage").input(z.object({ id: z.string().min(1) })).mutation(({ ctx, input }) => erp.deactivateConsultant(input.id, ctx.user)),
  }),
  clients: router({
    list: permissionProcedure("clients.read").query(({ ctx }) => erp.listClients(ctx.user)),
    get: permissionProcedure("clients.read").input(z.object({ id: z.string().min(1) })).query(({ ctx, input }) => erp.getClient(input.id, ctx.user)),
    create: permissionProcedure("clients.manage").input(clientInput).mutation(({ ctx, input }) => erp.createClient(input, ctx.user)),
    update: permissionProcedure("clients.manage").input(z.object({ id: z.string().min(1), data: clientInput })).mutation(({ ctx, input }) => erp.updateClient(input.id, input.data, ctx.user)),
  }),
  projects: router({
    list: permissionProcedure("projects.read").query(({ ctx }) => erp.listProjects(ctx.user)),
    get: permissionProcedure("projects.read").input(z.object({ id: z.string().min(1) })).query(({ ctx, input }) => erp.getProject(input.id, ctx.user)),
    create: permissionProcedure("projects.manage").input(projectInput).mutation(({ ctx, input }) => erp.createProject(input, ctx.user)),
    update: permissionProcedure("projects.manage").input(z.object({ id: z.string().min(1), data: projectInput })).mutation(({ ctx, input }) => erp.updateProject(input.id, input.data, ctx.user)),
  }),
  timeEntries: router({
    list: permissionProcedure("time.read").input(z.object({ consultantId: z.string().optional(), clientId: z.string().optional(), projectId: z.string().optional(), billingClassification: billingClassification.optional(), status: timeEntryStatus.optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), query: z.string().max(200).optional(), page: z.number().int().positive().default(1), pageSize: z.number().int().positive().max(100).default(50) }).default({ page: 1, pageSize: 50 })).query(({ ctx, input }) => erp.listTimeEntries(input, ctx.user)),
    get: permissionProcedure("time.read").input(z.object({ id: z.string().min(1) })).query(({ ctx, input }) => erp.getTimeEntry(input.id, ctx.user)),
    create: permissionProcedure("time.write").input(timeEntryInput).mutation(({ ctx, input }) => erp.createTimeEntry(input, ctx.user)),
    update: permissionProcedure("time.write").input(z.object({ id: z.string().min(1), data: timeEntryInput })).mutation(({ ctx, input }) => erp.updateTimeEntry(input.id, input.data, ctx.user)),
    submit: permissionProcedure("time.submit").input(z.object({ id: z.string().min(1) })).mutation(({ ctx, input }) => erp.transitionTimeEntry(input.id, "Submitted", ctx.user)),
    approve: permissionProcedure("time.approve").input(z.object({ id: z.string().min(1) })).mutation(({ ctx, input }) => erp.transitionTimeEntry(input.id, "Approved", ctx.user)),
    reject: permissionProcedure("time.approve").input(z.object({ id: z.string().min(1), reason: z.string().trim().min(1).max(2000) })).mutation(({ ctx, input }) => erp.transitionTimeEntry(input.id, "Rejected", ctx.user, input.reason)),
    returnToDraft: permissionProcedure("time.approve").input(z.object({ id: z.string().min(1) })).mutation(({ ctx, input }) => erp.transitionTimeEntry(input.id, "Draft", ctx.user)),
    approvalHistory: permissionProcedure("time.read").input(z.object({ id: z.string().min(1) })).query(({ ctx, input }) => erp.listApprovalHistory(input.id, ctx.user)),
    metrics: permissionProcedure("metrics.utilization").input(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), consultantId: z.string().optional(), clientId: z.string().optional(), projectId: z.string().optional() }).default({})).query(({ ctx, input }) => erp.timeEntryMetrics(input, ctx.user)),
  }),
});

export type AppRouter = typeof appRouter;
