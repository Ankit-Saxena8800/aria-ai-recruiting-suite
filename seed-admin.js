const { sql, getAdminByUsername } = require('./db');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

async function seedAdmin() {
  try {
    console.log('🌱 Seeding default admin account...');

    // Check if admin already exists
    const existingAdmin = await getAdminByUsername('admin');
    if (existingAdmin) {
      console.log('✅ Admin account already exists');
      console.log(`Username: admin`);
      return;
    }

    // Create default admin
    const hashedPassword = await bcrypt.hash('aria2024', 10);

    await sql`
      INSERT INTO admins (
        id, first_name, last_name, email, username, password, role
      ) VALUES (
        ${uuidv4()},
        'ARIA',
        'Admin',
        'admin@stage.in',
        'admin',
        ${hashedPassword},
        'admin'
      )
    `;

    console.log('✅ Default admin account created successfully!');
    console.log('');
    console.log('📝 Login credentials:');
    console.log('   Username: admin');
    console.log('   Password: aria2024');
    console.log('');
    console.log('⚠️  Please change this password after first login!');

  } catch (error) {
    console.error('❌ Error seeding admin:', error);
    throw error;
  } finally {
    process.exit();
  }
}

seedAdmin();
