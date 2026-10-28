/**
 * Seed script to create test organizations with users
 * Run with: npx tsx src/seedOrganizations.ts
 */

import "dotenv/config";
import { requireMongoDb } from "./mongo";
import { hashPassword, normalizeEmail } from "./password";
import { ObjectId } from "mongodb";

interface TestOrganization {
  name: string;
  slug: string;
  description: string;
  users: {
    email: string;
    password: string;
    name: string;
    role: "admin" | "manager" | "finance" | "consultant" | "user";
  }[];
}

const TEST_ORGANIZATIONS: TestOrganization[] = [
  {
    name: "Acme Consulting",
    slug: "acme-consulting",
    description: "Leading management consulting firm specializing in digital transformation",
    users: [
      {
        email: "admin@acme.nexcore.test",
        password: "Acme@Admin123",
        name: "Sarah Johnson",
        role: "admin",
      },
      {
        email: "manager@acme.nexcore.test",
        password: "Acme@Manager123",
        name: "Michael Chen",
        role: "manager",
      },
      {
        email: "finance@acme.nexcore.test",
        password: "Acme@Finance123",
        name: "Emily Davis",
        role: "finance",
      },
      {
        email: "consultant@acme.nexcore.test",
        password: "Acme@Consultant123",
        name: "David Kim",
        role: "consultant",
      },
    ],
  },
  {
    name: "TechVision Partners",
    slug: "techvision-partners",
    description: "Boutique technology consulting firm focused on cloud and AI solutions",
    users: [
      {
        email: "admin@techvision.nexcore.test",
        password: "TechVision@Admin123",
        name: "Jennifer Martinez",
        role: "admin",
      },
      {
        email: "manager@techvision.nexcore.test",
        password: "TechVision@Manager123",
        name: "Robert Brown",
        role: "manager",
      },
      {
        email: "finance@techvision.nexcore.test",
        password: "TechVision@Finance123",
        name: "Lisa Anderson",
        role: "finance",
      },
      {
        email: "consultant@techvision.nexcore.test",
        password: "TechVision@Consultant123",
        name: "James Wilson",
        role: "consultant",
      },
    ],
  },
  {
    name: "Strategic Solutions Inc",
    slug: "strategic-solutions",
    description: "Full-service business strategy and operations consulting firm",
    users: [
      {
        email: "admin@strategic.nexcore.test",
        password: "Strategic@Admin123",
        name: "Amanda Taylor",
        role: "admin",
      },
      {
        email: "manager@strategic.nexcore.test",
        password: "Strategic@Manager123",
        name: "Christopher Lee",
        role: "manager",
      },
      {
        email: "finance@strategic.nexcore.test",
        password: "Strategic@Finance123",
        name: "Patricia Garcia",
        role: "finance",
      },
      {
        email: "consultant@strategic.nexcore.test",
        password: "Strategic@Consultant123",
        name: "Daniel Rodriguez",
        role: "consultant",
      },
    ],
  },
  {
    name: "Innovation Advisors",
    slug: "innovation-advisors",
    description: "Agile consulting firm helping startups scale and innovate",
    users: [
      {
        email: "admin@innovation.nexcore.test",
        password: "Innovation@Admin123",
        name: "Michelle White",
        role: "admin",
      },
      {
        email: "manager@innovation.nexcore.test",
        password: "Innovation@Manager123",
        name: "Kevin Thompson",
        role: "manager",
      },
      {
        email: "finance@innovation.nexcore.test",
        password: "Innovation@Finance123",
        name: "Nancy Harris",
        role: "finance",
      },
      {
        email: "consultant@innovation.nexcore.test",
        password: "Innovation@Consultant123",
        name: "Steven Clark",
        role: "consultant",
      },
    ],
  },
  {
    name: "Global Edge Consulting",
    slug: "global-edge",
    description: "International consulting firm with expertise in market expansion",
    users: [
      {
        email: "admin@globaledge.nexcore.test",
        password: "GlobalEdge@Admin123",
        name: "Jessica Lewis",
        role: "admin",
      },
      {
        email: "manager@globaledge.nexcore.test",
        password: "GlobalEdge@Manager123",
        name: "Brian Walker",
        role: "manager",
      },
      {
        email: "finance@globaledge.nexcore.test",
        password: "GlobalEdge@Finance123",
        name: "Karen Hall",
        role: "finance",
      },
      {
        email: "consultant@globaledge.nexcore.test",
        password: "GlobalEdge@Consultant123",
        name: "Thomas Allen",
        role: "consultant",
      },
    ],
  },
];

async function seedOrganizations() {
  console.log("🏢 Starting organization and user seed process...\n");

  try {
    const db = await requireMongoDb();
    const orgsCollection = db.collection("organizations");
    const usersCollection = db.collection("users");

    let totalOrgsCreated = 0;
    let totalUsersCreated = 0;
    let totalSkipped = 0;

    for (const testOrg of TEST_ORGANIZATIONS) {
      console.log(`\n${"=".repeat(80)}`);
      console.log(`🏢 Organization: ${testOrg.name}`);
      console.log(`   Slug: ${testOrg.slug}`);
      console.log(`   Description: ${testOrg.description}`);
      console.log(`${"=".repeat(80)}`);

      // Check if organization already exists
      const existingOrg = await orgsCollection.findOne({ slug: testOrg.slug });

      let orgId: ObjectId;
      let orgCreated = false;

      if (existingOrg) {
        console.log(`⏭️  Organization already exists, using existing ID`);
        orgId = existingOrg._id as ObjectId;
        totalSkipped++;
      } else {
        // Create organization (need a temporary admin user first)
        const now = new Date();
        orgId = new ObjectId();

        const orgDoc = {
          _id: orgId,
          name: testOrg.name,
          slug: testOrg.slug,
          description: testOrg.description,
          createdBy: new ObjectId(), // Placeholder, will update with admin user
          createdAt: now,
          updatedAt: now,
        };

        await orgsCollection.insertOne(orgDoc);
        console.log(`✅ Organization created`);
        totalOrgsCreated++;
        orgCreated = true;
      }

      // Create users for this organization
      console.log(`\n👥 Creating users for ${testOrg.name}:`);
      let adminUserId: ObjectId | null = null;

      for (const testUser of testOrg.users) {
        const normalized = normalizeEmail(testUser.email);

        // Check if user already exists
        const existing = await usersCollection.findOne({ email: normalized });

        if (existing) {
          console.log(`   ⏭️  ${testUser.name} (${testUser.role}) - Already exists`);
          if (testUser.role === "admin" && !adminUserId) {
            adminUserId = existing._id as ObjectId;
          }
          continue;
        }

        // Hash password
        const { hash, salt } = hashPassword(testUser.password);

        // Create user document
        const now = new Date();
        const userId = new ObjectId();
        const openId = `seed_${testOrg.slug}_${testUser.role}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        const userDoc = {
          _id: userId,
          openId,
          name: testUser.name,
          email: normalized,
          passwordHash: hash,
          passwordSalt: salt,
          status: "active",
          loginMethod: "password",
          role: testUser.role,
          organizationId: orgId,
          membershipStatus: "active",
          consultantId: null,
          createdAt: now,
          updatedAt: now,
          lastSignedIn: now,
        };

        await usersCollection.insertOne(userDoc);

        if (testUser.role === "admin") {
          adminUserId = userId;
        }

        console.log(`   ✅ ${testUser.name} (${testUser.role})`);
        console.log(`      Email: ${testUser.email}`);
        console.log(`      Password: ${testUser.password}`);
        totalUsersCreated++;
      }

      // Update organization with correct admin creator if newly created
      if (orgCreated && adminUserId) {
        await orgsCollection.updateOne(
          { _id: orgId },
          { $set: { createdBy: adminUserId, updatedAt: new Date() } }
        );
      }
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log(`\n✨ Organization seeding complete!\n`);
    console.log(`📊 Summary:`);
    console.log(`   Organizations created: ${totalOrgsCreated}`);
    console.log(`   Organizations skipped (already exist): ${totalSkipped}`);
    console.log(`   Users created: ${totalUsersCreated}`);
    console.log(``);

    // Print credential summary
    console.log(`\n${"=".repeat(80)}`);
    console.log(`📋 QUICK REFERENCE - ALL ORGANIZATION CREDENTIALS`);
    console.log(`${"=".repeat(80)}\n`);

    for (const org of TEST_ORGANIZATIONS) {
      console.log(`\n🏢 ${org.name.toUpperCase()} (${org.slug})`);
      console.log(`${"─".repeat(80)}`);
      for (const user of org.users) {
        const roleIcon = 
          user.role === "admin" ? "👑" :
          user.role === "manager" ? "👔" :
          user.role === "finance" ? "💰" :
          user.role === "consultant" ? "💼" : "👤";
        console.log(`${roleIcon} ${user.role.padEnd(12)} │ ${user.email.padEnd(40)} │ ${user.password}`);
      }
    }

    console.log(`\n${"=".repeat(80)}\n`);

  } catch (error) {
    console.error("❌ Error seeding organizations:", error);
    process.exit(1);
  }

  process.exit(0);
}

seedOrganizations();
