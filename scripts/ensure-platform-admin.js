/* eslint-disable no-console */
const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");
const { createSeedClient } = require("./seed-client");

const email = process.env.PLATFORM_ADMIN_EMAIL || "platform.admin@example.com";
const password = process.env.PLATFORM_ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "PlatformAdmin123!");
const name = process.env.PLATFORM_ADMIN_NAME || "Platform Admin";

async function main() {
  if (!password) {
    throw new Error("PLATFORM_ADMIN_PASSWORD is required in production");
  }

  const seedConnection = createSeedClient();
  const db = seedConnection.client;
  if (typeof db.connect === "function") await db.connect();
  console.log(`Ensuring platform admin through ${seedConnection.mode} data path.`);

  try {
    const { data: activeAdmins, error: adminError } = await db
      .from("PlatformAdmin")
      .select("id,userId,isActive")
      .eq("isActive", true)
      .limit(10);

    if (adminError) throw new Error(`PlatformAdmin lookup failed: ${adminError.message}`);

    if (activeAdmins?.length) {
      const userIds = activeAdmins.map((admin) => admin.userId).filter(Boolean);
      const { data: users, error: usersError } = await db
        .from("User")
        .select("id,email,name,status")
        .in("id", userIds);
      if (usersError) throw new Error(`Platform admin user lookup failed: ${usersError.message}`);

      console.log("Active platform admin already exists:");
      for (const admin of activeAdmins) {
        const user = (users ?? []).find((row) => row.id === admin.userId);
        console.log(`- ${user?.email ?? admin.userId} (${user?.name ?? "Unnamed"}, ${user?.status ?? "unknown"})`);
      }
      console.log("Password is not recoverable. Reset it manually if needed.");
      return;
    }

    const now = new Date().toISOString();
    const roleId = randomUUID();
    const userId = randomUUID();
    const platformAdminId = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    const { error: roleError } = await db.from("Role").insert({
      id: roleId,
      tenantId: null,
      name: "Super Admin",
      description: "Platform administrator with full access",
      permissions: {
        modules: {
          leads: "full",
          opportunities: "full",
          activities: "full",
          admin: "full",
        },
        recordAccess: "ALL",
        platform: true,
      },
      createdAt: now,
      updatedAt: now,
    });
    if (roleError) throw new Error(`Role insert failed: ${roleError.message}`);

    const { error: userError } = await db.from("User").insert({
      id: userId,
      tenantId: null,
      email: email.toLowerCase(),
      name,
      password: passwordHash,
      status: "ACTIVE",
      roleId,
      createdAt: now,
      updatedAt: now,
    });
    if (userError) throw new Error(`User insert failed: ${userError.message}`);

    const { error: platformError } = await db.from("PlatformAdmin").insert({
      id: platformAdminId,
      userId,
      permissions: {
        tenants: true,
        users: true,
        roles: true,
        billing: true,
      },
      canImpersonate: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    if (platformError) throw new Error(`PlatformAdmin insert failed: ${platformError.message}`);

    console.log("Created platform admin:");
    console.log(`Email: ${email.toLowerCase()}`);
    console.log(`Password: ${password}`);
  } finally {
    if (typeof db.close === "function") await db.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
