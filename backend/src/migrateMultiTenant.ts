import "dotenv/config";
import { getMongoDb, requireMongoDb, collection, type MongoUser, type MongoOrganization, type ConsultantDocument, type ClientDocument, type ProjectDocument, type TimeEntryDocument } from "./mongo";
import { ObjectId } from "mongodb";

export interface MigrationSummary {
  organizationId: string;
  organizationSlug: string;
  usersMigrated: number;
  consultantsMigrated: number;
  clientsMigrated: number;
  projectsMigrated: number;
  timeEntriesMigrated: number;
  timestamp: string;
}

export async function runMultiTenantMigration(): Promise<MigrationSummary> {
  const db = await requireMongoDb();
  const now = new Date();

  // 1. Ensure or find Primary Organization
  const orgsCollection = collection<MongoOrganization>(db, "organizations");
  let primaryOrg = await orgsCollection.findOne({ slug: "nexcore-tech" });

  if (!primaryOrg) {
    const orgId = new ObjectId();
    primaryOrg = {
      _id: orgId,
      name: "Nexcore Technologies",
      slug: "nexcore-tech",
      description: "Default primary organization for migrated legacy consultant operations.",
      createdBy: new ObjectId("000000000000000000000001"),
      createdAt: now,
      updatedAt: now,
    };
    await orgsCollection.insertOne(primaryOrg);
    console.log(`[Migration] Created primary organization: ${primaryOrg.name} (${primaryOrg._id.toHexString()})`);
  } else {
    console.log(`[Migration] Using existing primary organization: ${primaryOrg.name} (${primaryOrg._id.toHexString()})`);
  }

  const primaryOrgId = primaryOrg._id;

  // 2. Associate unassigned users with primary organization
  const usersCollection = collection<MongoUser>(db, "users");
  const userResult = await usersCollection.updateMany(
    {
      $or: [
        { organizationId: { $exists: false } },
        { organizationId: null },
      ],
    },
    {
      $set: {
        organizationId: primaryOrgId,
        membershipStatus: "active",
        updatedAt: now,
      },
    },
  );

  // 3. Associate unassigned consultants
  const consultantsCollection = collection<ConsultantDocument>(db, "consultants");
  const consultantResult = await consultantsCollection.updateMany(
    {
      $or: [
        { organizationId: { $exists: false } },
        { organizationId: null },
      ],
    },
    {
      $set: {
        organizationId: primaryOrgId,
        updatedAt: now,
      },
    },
  );

  // 4. Associate unassigned clients
  const clientsCollection = collection<ClientDocument>(db, "clients");
  const clientResult = await clientsCollection.updateMany(
    {
      $or: [
        { organizationId: { $exists: false } },
        { organizationId: null },
      ],
    },
    {
      $set: {
        organizationId: primaryOrgId,
        updatedAt: now,
      },
    },
  );

  // 5. Associate unassigned projects
  const projectsCollection = collection<ProjectDocument>(db, "projects");
  const projectResult = await projectsCollection.updateMany(
    {
      $or: [
        { organizationId: { $exists: false } },
        { organizationId: null },
      ],
    },
    {
      $set: {
        organizationId: primaryOrgId,
        updatedAt: now,
      },
    },
  );

  // 6. Associate unassigned time entries
  const timeEntriesCollection = collection<TimeEntryDocument>(db, "timeEntries");
  const timeEntryResult = await timeEntriesCollection.updateMany(
    {
      $or: [
        { organizationId: { $exists: false } },
        { organizationId: null },
      ],
    },
    {
      $set: {
        organizationId: primaryOrgId,
        updatedAt: now,
      },
    },
  );

  const summary: MigrationSummary = {
    organizationId: primaryOrgId.toHexString(),
    organizationSlug: primaryOrg.slug,
    usersMigrated: userResult.modifiedCount,
    consultantsMigrated: consultantResult.modifiedCount,
    clientsMigrated: clientResult.modifiedCount,
    projectsMigrated: projectResult.modifiedCount,
    timeEntriesMigrated: timeEntryResult.modifiedCount,
    timestamp: now.toISOString(),
  };

  console.log("[Migration] Migration completed successfully:", summary);
  return summary;
}

if (process.argv[1] && process.argv[1].endsWith("migrateMultiTenant.ts")) {
  runMultiTenantMigration()
    .then((summary) => {
      console.log("Migration finished with summary:", JSON.stringify(summary, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
