import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

async function main() {
  const newPassword = "password123";
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update super admin
  await prisma.superAdmin.updateMany({
    where: { email: { equals: "Support@sreevaai.com", mode: "insensitive" } },
    data: { password: hashedPassword }
  });

  // Update org admin 1
  await prisma.organizationCredentials.updateMany({
    where: { email: { equals: "tulasi@gmail.com", mode: "insensitive" } },
    data: { password: hashedPassword }
  });

  // Update org admin 2
  await prisma.organizationCredentials.updateMany({
    where: { email: { equals: "lumoscale@gmail.com", mode: "insensitive" } },
    data: { password: hashedPassword }
  });

  console.log("Passwords for all accounts successfully reset to:", newPassword);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
