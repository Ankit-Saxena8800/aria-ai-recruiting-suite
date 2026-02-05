#!/usr/bin/env node

/**
 * Password Migration Script
 *
 * This script migrates plain-text passwords in users.json to bcrypt hashed passwords.
 *
 * IMPORTANT:
 * - Run this ONCE before deploying the new security updates
 * - Creates a backup before making changes
 * - Safe to run multiple times (skips already hashed passwords)
 *
 * Usage: node migrate-passwords.js
 */

const fs = require('fs');
const bcrypt = require('bcrypt');
const path = require('path');

const USERS_FILE = path.join(__dirname, 'users.json');
const BACKUP_FILE = path.join(__dirname, `users.json.backup.${Date.now()}`);
const SALT_ROUNDS = 10;

async function migratePasswords() {
  console.log('🔐 Password Migration Script');
  console.log('=' .repeat(50));

  // Check if users.json exists
  if (!fs.existsSync(USERS_FILE)) {
    console.error('❌ Error: users.json not found!');
    process.exit(1);
  }

  // Create backup
  console.log('📦 Creating backup...');
  fs.copyFileSync(USERS_FILE, BACKUP_FILE);
  console.log(`✅ Backup created: ${BACKUP_FILE}`);

  // Read users data
  const usersData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));

  let migratedCount = 0;
  let skippedCount = 0;

  // Migrate admins
  console.log('\n👑 Migrating admin passwords...');
  for (let i = 0; i < usersData.admins.length; i++) {
    const admin = usersData.admins[i];

    // Check if password is already hashed (bcrypt hashes start with $2b$)
    if (admin.password && !admin.password.startsWith('$2b$')) {
      console.log(`   Hashing password for admin: ${admin.username}`);
      const hashedPassword = await bcrypt.hash(admin.password, SALT_ROUNDS);
      usersData.admins[i].password = hashedPassword;
      migratedCount++;
    } else {
      console.log(`   ⏭️  Skipping ${admin.username} (already hashed)`);
      skippedCount++;
    }
  }

  // Migrate regular users
  console.log('\n👤 Migrating user passwords...');
  for (let i = 0; i < usersData.users.length; i++) {
    const user = usersData.users[i];

    // Skip SSO users (they don't have passwords)
    if (user.ssoProvider) {
      console.log(`   ⏭️  Skipping ${user.username} (SSO user)`);
      skippedCount++;
      continue;
    }

    // Check if password is already hashed
    if (user.password && !user.password.startsWith('$2b$')) {
      console.log(`   Hashing password for user: ${user.username}`);
      const hashedPassword = await bcrypt.hash(user.password, SALT_ROUNDS);
      usersData.users[i].password = hashedPassword;
      migratedCount++;
    } else {
      console.log(`   ⏭️  Skipping ${user.username} (already hashed or no password)`);
      skippedCount++;
    }
  }

  // Write updated data back to file
  console.log('\n💾 Writing updated data...');
  fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2), 'utf-8');

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('✅ Migration Complete!');
  console.log(`   Migrated: ${migratedCount} passwords`);
  console.log(`   Skipped: ${skippedCount} passwords`);
  console.log(`   Backup: ${BACKUP_FILE}`);
  console.log('=' .repeat(50));
  console.log('\n💡 Next steps:');
  console.log('   1. Verify the migration worked correctly');
  console.log('   2. Test login with migrated accounts');
  console.log('   3. Deploy the updated dashboard-server.js');
  console.log('   4. Keep the backup file safe for rollback if needed');
  console.log('');
}

// Run migration
migratePasswords().catch(error => {
  console.error('❌ Migration failed:', error);
  console.error('   Restore from backup:', BACKUP_FILE);
  process.exit(1);
});
