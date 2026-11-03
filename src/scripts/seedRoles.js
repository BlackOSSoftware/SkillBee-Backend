import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { Permission } from '../models/Permission.js';
import { Role } from '../models/Role.js';
import { ROLE_SLUGS, USER_STATUS } from '../config/security.js';
import { User } from '../models/User.js';

async function seedSuperAdminIfRequested() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL;
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    return;
  }

  const role = await Role.findBySlug(ROLE_SLUGS.SUPER_ADMIN);
  if (!role) {
    throw new Error('super_admin role missing after seed');
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.log(`Super admin already exists: ${email}`);
    return;
  }

  const [firstName, ...rest] = (process.env.SEED_SUPER_ADMIN_NAME || 'Super Admin').split(
    ' '
  );
  const user = new User({
    firstName,
    lastName: rest.join(' ') || 'Admin',
    email: email.toLowerCase(),
    roleId: role._id,
    status: USER_STATUS.ACTIVE,
    emailVerified: true,
  });
  await user.setPassword(password);
  await user.save();
  console.log(`Created super admin: ${email}`);
}

async function main() {
  await connectDatabase();
  await Permission.ensureDefaults();
  await Role.ensureDefaults();

  const roles = await Role.find().sort({ name: 1 });
  console.log('Seeded roles:');
  for (const role of roles) {
    console.log(`  - ${role.slug}: [${role.permissions.join(', ')}]`);
  }

  const permissions = await Permission.find().sort({ code: 1 });
  console.log(`Seeded permissions: ${permissions.length}`);

  await seedSuperAdminIfRequested();
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
