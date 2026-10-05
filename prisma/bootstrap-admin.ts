// One-time command: creates the first administrator (default pavan@thekenkolife.com) and the
// "Kenko Life" company. Run it after the purge, or on a fresh database.
//
//   PowerShell:  $env:BOOTSTRAP_ADMIN_PASSWORD="<your password>"; npm run bootstrap:admin
//   Add -- --reset to change the password of an existing account.
//
// Every other login (Admin, HR, CFO ...) is then created from the "Logins" page by this account.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedDepreciationMasters } from "../src/lib/depreciation-defaults";

const db = new PrismaClient();

async function main() {
  const email = (process.env.SUPER_ADMIN_EMAIL || "pavan@thekenkolife.com").trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
  const reset = process.argv.includes("--reset");
  if (password.length < 12) throw new Error("Set BOOTSTRAP_ADMIN_PASSWORD (at least 12 characters) in the environment first.");

  const existing = await db.user.findUnique({ where: { email } });
  if (existing && !reset) {
    console.log(`${email} already exists. Nothing changed (use -- --reset to set a new password).`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    if (existing) await db.user.update({ where: { email }, data: { passwordHash, role: "ADMIN" } });
    else await db.user.create({ data: { email, role: "ADMIN", passwordHash } });
    console.log(`Administrator ${email} ${existing ? "password reset" : "created"}.`);
  }

  // Kenko Life stays the first entry of the Company Master (R9).
  const company = await db.company.findFirst();
  if (!company) {
    await db.company.create({ data: { name: "Kenko Life", code: "KL" } });
    console.log('Company "Kenko Life" created.');
  }

  // Starter asset categories and Income Tax blocks (placeholders flagged "to verify" on the setup screen).
  const seeded = await seedDepreciationMasters(db);
  if (seeded) console.log(`${seeded} placeholder depreciation master rows added. Verify them under Depreciation Setup.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
