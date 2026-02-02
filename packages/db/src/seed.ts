import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";
import path from "path";
import { users, projects } from "./schema";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

async function seed() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log("🌱 Seeding database...");

  try {
    const sql = neon(connectionString);
    const db = drizzle(sql);

    // Create test user
    const testEmail = "test@sme-studio.dev";
    const testPassword = "test123456";
    const passwordHash = await bcrypt.hash(testPassword, 10);

    console.log("📝 Creating test user...");

    const insertedUsers = await db
      .insert(users)
      .values({
        email: testEmail,
        passwordHash,
        emailVerified: true,
        plan: "free",
        creditsTotal: 30,
        creditsUsed: 0,
        creditsRollover: 0,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          passwordHash,
          updatedAt: new Date(),
        },
      })
      .returning();

    const testUser = insertedUsers[0];
    if (!testUser) {
      throw new Error("Failed to create test user");
    }

    console.log(`✅ Test user created/updated: ${testUser.email}`);

    // Create test project
    console.log("📁 Creating test project...");

    const insertedProjects = await db
      .insert(projects)
      .values({
        userId: testUser.id,
        name: "Mon premier projet",
      })
      .returning();

    const testProject = insertedProjects[0];
    if (!testProject) {
      throw new Error("Failed to create test project");
    }

    console.log(`✅ Test project created: ${testProject.name}`);

    console.log("\n🎉 Seed completed successfully!");
    console.log("\n📋 Test credentials:");
    console.log(`   Email: ${testEmail}`);
    console.log(`   Password: ${testPassword}`);
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

seed();
