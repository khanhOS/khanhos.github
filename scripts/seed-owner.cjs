const { promisify } = require("node:util");
const { randomBytes, scrypt } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const deriveKey = promisify(scrypt);
const db = new PrismaClient();
const ownerEmails = (process.env.OWNER_EMAIL || "hoangbaokhanhhehe@gmail.com")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const ownerPassword = process.env.OWNER_PASSWORD;
const ownerName = process.env.OWNER_NAME || "Khanh";

if (!ownerPassword) {
  throw new Error("OWNER_PASSWORD is required to seed the owner account");
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await deriveKey(password.normalize("NFKC"), salt, 64);
  return `scrypt$16384$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

async function main() {
  const passwordHash = await hashPassword(ownerPassword);

  for (const email of ownerEmails) {
    const user = await db.user.upsert({
      where: { email },
      update: { passwordHash, role: "owner" },
      create: {
        email,
        name: ownerName,
        passwordHash,
        role: "owner",
        avatarSeed: Math.random().toString(36).slice(2, 10),
      },
    });

    await db.userSettings.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
    console.log(`Owner ready: ${user.email}`);
  }
}

main()
  .catch((error) => {
    console.error("Owner seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
