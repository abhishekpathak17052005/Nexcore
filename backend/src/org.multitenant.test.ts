import "dotenv/config";
import { describe, expect, it, beforeAll } from "vitest";
import { ObjectId } from "mongodb";
import { appRouter } from "./routers";
import { requireMongoDb, collection, type MongoOrganization, type MongoUser, type MongoJoinRequest, type MongoNotification } from "./mongo";
import * as erp from "./erpDb";
import type { User } from "./types";

function makeCaller(user: User | null) {
  return appRouter.createCaller({ req: {} as never, res: { cookie: () => {}, clearCookie: () => {} } as never, user });
}

describe("NEXCORE Multi-Tenant Organization Onboarding & RBAC Suite", () => {
  const runId = Date.now();
  let orgA: { id: string; name: string; slug: string };
  let orgB: { id: string; name: string; slug: string };
  let adminA: User;
  let adminB: User;
  let employeeUser: User;

  beforeAll(async () => {
    await requireMongoDb();
  });

  describe("Phase 2: Organization Registration & Creator Role Assignment", () => {
    it("successfully creates an organization and atomically assigns the creator as an active Admin", async () => {
      const slugA = `acme-consulting-${runId}`;
      const res = await makeCaller(null).auth.registerOrganization({
        organizationName: "Acme Consulting Services",
        organizationSlug: slugA,
        description: "Premier enterprise technology advisory",
        adminName: "Alice Admin",
        adminEmail: `alice.${runId}@acme.test`,
        password: "Password123!",
      });

      expect(res.organization).toBeDefined();
      expect(res.organization.name).toBe("Acme Consulting Services");
      expect(res.organization.slug).toBe(slugA);
      expect(res.user.role).toBe("admin");
      expect(res.user.membershipStatus).toBe("active");
      expect(res.user.organizationId).toBe(res.organization.id);

      orgA = res.organization;
      adminA = {
        id: res.user.id,
        openId: res.user.openId,
        name: res.user.name,
        email: res.user.email,
        loginMethod: "password",
        role: "admin",
        status: "active",
        membershipStatus: "active",
        organizationId: res.organization.id,
        consultantId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };
    });

    it("prevents conflicting or duplicate organization slugs", async () => {
      await expect(
        makeCaller(null).auth.registerOrganization({
          organizationName: "Another Acme",
          organizationSlug: orgA.slug,
          adminName: "Imposter",
          adminEmail: `imposter.${runId}@test.com`,
          password: "Password123!",
        }),
      ).rejects.toThrow(/already taken/i);
    });

    it("creates a second distinct organization for cross-tenant isolation testing", async () => {
      const slugB = `apex-solutions-${runId}`;
      const res = await makeCaller(null).auth.registerOrganization({
        organizationName: "Apex Solutions Global",
        organizationSlug: slugB,
        description: "Global operations and strategy",
        adminName: "Bob Admin",
        adminEmail: `bob.${runId}@apex.test`,
        password: "Password123!",
      });

      orgB = res.organization;
      adminB = {
        id: res.user.id,
        openId: res.user.openId,
        name: res.user.name,
        email: res.user.email,
        loginMethod: "password",
        role: "admin",
        status: "active",
        membershipStatus: "active",
        organizationId: res.organization.id,
        consultantId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };
    });
  });

  describe("Phase 3: Organization Discovery & Employee Signup", () => {
    it("safe discovery search returns ONLY public identifier metadata without exposing private records or financials", async () => {
      const searchResults = await makeCaller(null).organizations.search({ query: `acme-consulting-${runId}` });
      expect(searchResults.length).toBeGreaterThanOrEqual(1);
      const match = searchResults.find(o => o.slug === orgA.slug);
      expect(match).toBeDefined();
      expect(match?.name).toBe("Acme Consulting Services");
      expect(match?.slug).toBe(orgA.slug);
      // Safe discovery guarantees: no member counts, no revenues, no admin emails leaked
      expect((match as any).financialMetrics).toBeUndefined();
      expect((match as any).adminEmail).toBeUndefined();
    });

    it("allows employee signup with pending join request to Organization A", async () => {
      const user = await makeCaller(null).auth.signup({
        name: "Edward Employee",
        email: `edward.${runId}@example.com`,
        password: "Password123!",
        organizationId: orgA.id,
        requestedRole: "consultant",
      });

      expect(user.role).toBe("user"); // Stays unprivileged until approved
      expect(user.membershipStatus).toBe("pending");
      expect(user.organizationId).toBe(orgA.id);

      employeeUser = {
        id: user.id,
        openId: user.openId,
        name: user.name,
        email: user.email,
        loginMethod: "password",
        role: "user",
        status: "active",
        membershipStatus: "pending",
        organizationId: orgA.id,
        consultantId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };
    });

    it("strictly blocks pending employee from accessing organization business data", async () => {
      const pendingCaller = makeCaller(employeeUser);
      // Protected data calls must fail
      await expect(pendingCaller.consultants.list()).rejects.toThrow(/pending administrator approval/i);
      await expect(pendingCaller.clients.list()).rejects.toThrow(/pending administrator approval/i);
      await expect(pendingCaller.projects.list()).rejects.toThrow(/pending administrator approval/i);
      await expect(pendingCaller.timeEntries.list({ page: 1, pageSize: 10 })).rejects.toThrow(/pending administrator approval/i);
      await expect(pendingCaller.timeEntries.metrics({})).rejects.toThrow(/pending administrator approval/i);
    });

    it("prevents submitting duplicate active pending join request for same organization", async () => {
      await expect(
        makeCaller(employeeUser).joinRequests.submit({ organizationId: orgA.id }),
      ).rejects.toThrow(/already have an active pending join request/i);
    });
  });

  describe("Phase 4 & 6: Join Request Lifecycle & Persistent In-App Notifications", () => {
    let pendingRequestId: string;

    it("persists in-app notification to Organization A admin upon request submission", async () => {
      const adminCaller = makeCaller(adminA);
      const notifications = await adminCaller.notifications.list({ limit: 10 });
      expect(notifications.length).toBeGreaterThan(0);
      const joinNotification = notifications.find(n => n.type === "JOIN_REQUEST_SUBMITTED");
      expect(joinNotification).toBeDefined();
      expect(joinNotification?.title).toBe("New Organization Join Request");
      expect(joinNotification?.message).toContain("Edward Employee");

      const unread = await adminCaller.notifications.unreadCount();
      expect(unread.count).toBeGreaterThanOrEqual(1);

      // Verify admin can mark notification as read
      const markRes = await adminCaller.notifications.markAsRead({ id: joinNotification!.id });
      expect(markRes.success).toBe(true);
    });

    it("organization admin can view pending join requests for their organization", async () => {
      const requests = await makeCaller(adminA).joinRequests.list({ status: "PENDING" });
      expect(requests.length).toBeGreaterThanOrEqual(1);
      const req = requests.find(r => r.userId === employeeUser.id);
      expect(req).toBeDefined();
      expect(req?.userName).toBe("Edward Employee");
      expect(req?.status).toBe("PENDING");
      pendingRequestId = req!.id;
    });

    it("cross-tenant denial: Admin of Organization B CANNOT view or approve Organization A requests", async () => {
      const adminBCaller = makeCaller(adminB);
      // Admin B trying to approve Org A's join request
      await expect(
        adminBCaller.joinRequests.approve({
          requestId: pendingRequestId,
          assignedRole: "consultant",
        }),
      ).rejects.toThrow(/does not belong to your organization/i);
    });

    it("authorized Admin A approves request and assigns consultant role", async () => {
      const approved = await makeCaller(adminA).joinRequests.approve({
        requestId: pendingRequestId,
        assignedRole: "consultant",
      });

      expect(approved.status).toBe("APPROVED");
      expect(approved.reviewedBy).toBe(adminA.id);
      expect(approved.reviewedAt).toBeDefined();

      // Verify employee received persistent approval notification
      const employeeCaller = makeCaller({ ...employeeUser, membershipStatus: "active", role: "consultant" });
      const empNotifications = await employeeCaller.notifications.list({ limit: 5 });
      const approvalNotice = empNotifications.find(n => n.type === "JOIN_REQUEST_APPROVED");
      expect(approvalNotice).toBeDefined();
      expect(approvalNotice?.message).toContain("approved with role: consultant");
    });

    it("concurrent or duplicate approval attempt on already-resolved request fails gracefully", async () => {
      await expect(
        makeCaller(adminA).joinRequests.approve({
          requestId: pendingRequestId,
          assignedRole: "consultant",
        }),
      ).rejects.toThrow(/current status is APPROVED/i);
    });
  });

  describe("Phase 5: Join Request Rejection Workflow", () => {
    let rejectedEmployee: User;
    let rejectionRequestId: string;

    it("handles employee signup and admin rejection with explicit reason", async () => {
      const user = await makeCaller(null).auth.signup({
        name: "Rachel Reject",
        email: `rachel.${runId}@example.com`,
        password: "Password123!",
        organizationId: orgA.id,
        requestedRole: "finance",
      });

      rejectedEmployee = {
        id: user.id,
        openId: user.openId,
        name: user.name,
        email: user.email,
        loginMethod: "password",
        role: "user",
        status: "active",
        membershipStatus: "pending",
        organizationId: orgA.id,
        consultantId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };

      const req = await makeCaller(rejectedEmployee).joinRequests.myRequest();
      expect(req).toBeDefined();
      rejectionRequestId = req!.id;

      // Admin A rejects request with a reason
      const rejected = await makeCaller(adminA).joinRequests.reject({
        requestId: rejectionRequestId,
        reason: "Role requirements not met for senior finance position.",
      });

      expect(rejected.status).toBe("REJECTED");
      expect(rejected.rejectionReason).toBe("Role requirements not met for senior finance position.");

      // Check rejection notification delivered to employee
      const empNotifs = await makeCaller(rejectedEmployee).notifications.list({ limit: 5 });
      const rejNotice = empNotifs.find(n => n.type === "JOIN_REQUEST_REJECTED");
      expect(rejNotice).toBeDefined();
      expect(rejNotice?.message).toContain("Role requirements not met");

      // Verify rejected employee remains blocked
      await expect(makeCaller({ ...rejectedEmployee, membershipStatus: "rejected" }).consultants.list()).rejects.toThrow(/rejected/i);
    });
  });

  describe("Phase 7: Organization Data Isolation & Scoping", () => {
    let clientA: any;
    let clientB: any;

    it("creates isolated clients and consultants for Organization A and Organization B", async () => {
      clientA = await makeCaller(adminA).clients.create({
        clientCode: `CL-A-${runId}`,
        name: "Acme Client Alpha",
        status: "Active",
        defaultCurrency: "USD",
      });

      clientB = await makeCaller(adminB).clients.create({
        clientCode: `CL-B-${runId}`,
        name: "Apex Client Beta",
        status: "Active",
        defaultCurrency: "EUR",
      });

      expect(clientA.id).toBeDefined();
      expect(clientB.id).toBeDefined();
    });

    it("Organization A admin CANNOT view Organization B clients", async () => {
      const listA = await makeCaller(adminA).clients.list();
      const hasClientB = listA.some(c => c.id === clientB.id);
      expect(hasClientB).toBe(false);

      const hasClientA = listA.some(c => c.id === clientA.id);
      expect(hasClientA).toBe(true);
    });

    it("Organization A admin direct record access to Organization B client is denied", async () => {
      await expect(
        makeCaller(adminA).clients.get({ id: clientB.id }),
      ).rejects.toThrow(/Cross-organization data access is strictly prohibited/i);
    });
  });
});
