/**
 * Seed script to create test users for all roles
 * Run with: npx tsx src/seedTestUsers.ts
 */

import "dotenv/config";
import { requireMongoDb } from "./mongo";
import { hashPassword, normalizeEmail } from "./password";
import { ObjectId } from "mongodb";

interface TestUser {
  email: string;
  password: string;
  name: string;
  role: "admin" | "manager" | "finance" | "consultant" | "user";
  description: string;
}

const TEST_USERS: TestUser[] = [
  {
    email: "admin@nexcore.test",
    password: "Admin@123",
    name: "Admin User",
    role: "admin",
    description: "Full system administrator with all permissions",
  },
  {
    email: "manager@nexcore.test",
    password: "Manager@123",
    name: "Manager User",
    role: "manager",
    description: "Manager with access to team utilization and time entries",
  },
  {
    email: "finance@nexcore.test",
    password: "Finance@123",
    name: "Finance User",
    role: "finance",
    description: "Finance role with access to revenue and billing data",
  },
  {
    email: "consultant@nexcore.test",
    password: "Consultant@123",
    name: "Consultant User",
    role: "consultant",
    description: "Consultant who can manage their own time entries",
  },
  {
    email: "user@nexcore.test",
    password: "User@123",
    name: "Basic User",
    role: "user",
    description: "Basic user with limited permissions",
  },
];

async function seedTestUsers() {
  console.log("🌱 Starting test user seed process...\n");

  try {
    const db = await requireMongoDb();
    const usersCollection = db.collection("users");

    console.log("📊 Test User Credentials");
    console.log("=" .repeat(80));
    console.log("");

    for (const testUser of TEST_USERS) {
      const normalized = normalizeEmail(testUser.email);
      
      // Check if user already exists
      const existing = await usersCollection.findOne({ email: normalized });
      
      if (existing) {
        console.log(`⏭️  SKIPPED: ${testUser.name}`);
        console.log(`   Email: ${testUser.email}`);
        console.log(`   Role: ${testUser.role}`);
        console.log(`   Reason: User already exists`);
        console.log("");
        continue;
      }

      // Hash password
      const { hash, salt } = hashPassword(testUser.password);

      // Create user document
      const now = new Date();
      const openId = `seed_${testUser.role}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const userDoc = {
        _id: new ObjectId(),
        openId,
        name: testUser.name,
        email: normalized,
        passwordHash: hash,
        passwordSalt: salt,
        status: "active",
        loginMethod: "password",
        role: testUser.role,
        consultantId: null,
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      };

      await usersCollection.insertOne(userDoc);

      console.log(`✅ CREATED: ${testUser.name}`);
      console.log(`   Email: ${testUser.email}`);
      console.log(`   Password: ${testUser.password}`);
      console.log(`   Role: ${testUser.role}`);
      console.log(`   Description: ${testUser.description}`);
      console.log("");
    }

    console.log("=" .repeat(80));
    console.log("\n✨ Test user seeding complete!\n");
    console.log("📝 Quick Reference:");
    console.log("");
    console.log("Admin:      admin@nexcore.test      / Admin@123");
    console.log("Manager:    manager@nexcore.test    / Manager@123");
    console.log("Finance:    finance@nexcore.test    / Finance@123");
    console.log("Consultant: consultant@nexcore.test / Consultant@123");
    console.log("User:       user@nexcore.test       / User@123");
    console.log("");
    console.log("🔐 All passwords follow the pattern: [Role]@123");
    console.log("");

  } catch (error) {
    console.error("❌ Error seeding test users:", error);
    process.exit(1);
  }

  process.exit(0);
}

seedTestUsers();
