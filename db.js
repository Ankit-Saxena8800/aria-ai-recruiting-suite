const { neon } = require('@neondatabase/serverless');

// Initialize database connection
const sql = neon(process.env.POSTGRES_URL);

// Initialize database tables
async function initDatabase() {
  try {
    // Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        department TEXT,
        status TEXT DEFAULT 'pending',
        role TEXT DEFAULT 'user',
        sso_provider TEXT,
        requested_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ
      )
    `;

    // Create admins table
    await sql`
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
      )
    `;

    // Create audit_logs table
    await sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        action TEXT NOT NULL,
        user_id TEXT,
        username TEXT,
        details JSONB,
        ip_address TEXT,
        user_agent TEXT
      )
    `;

    // Create blacklist table
    await sql`
      CREATE TABLE IF NOT EXISTS blacklist (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        username TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        reason TEXT,
        blacklisted_at TIMESTAMPTZ DEFAULT NOW(),
        original_user_id TEXT
      )
    `;

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

// User operations
async function createUser(userData) {
  const result = await sql`
    INSERT INTO users (
      id, first_name, last_name, email, username, password,
      department, status, role, sso_provider, requested_at
    ) VALUES (
      ${userData.id}, ${userData.firstName}, ${userData.lastName},
      ${userData.email}, ${userData.username}, ${userData.password},
      ${userData.department}, ${userData.status}, ${userData.role},
      ${userData.ssoProvider || null}, ${userData.requestedAt}
    )
    RETURNING *
  `;
  return result[0];
}

async function getUserByUsername(username) {
  const result = await sql`
    SELECT * FROM users WHERE username = ${username} OR email = ${username} LIMIT 1
  `;
  return result[0];
}

async function getUserById(id) {
  const result = await sql`
    SELECT * FROM users WHERE id = ${id} LIMIT 1
  `;
  return result[0];
}

async function getAdminByUsername(username) {
  const result = await sql`
    SELECT * FROM admins WHERE username = ${username} OR email = ${username} LIMIT 1
  `;
  return result[0];
}

async function getAdminById(id) {
  const result = await sql`
    SELECT * FROM admins WHERE id = ${id} LIMIT 1
  `;
  return result[0];
}

async function getAllUsers() {
  const result = await sql`
    SELECT * FROM users ORDER BY requested_at DESC
  `;
  return result;
}

async function updateUserStatus(userId, status) {
  const result = await sql`
    UPDATE users
    SET status = ${status}, updated_at = NOW()
    WHERE id = ${userId}
    RETURNING *
  `;
  return result[0];
}

async function updateUserProfile(userId, data) {
  const result = await sql`
    UPDATE users
    SET
      first_name = ${data.firstName},
      last_name = ${data.lastName},
      department = ${data.department},
      updated_at = NOW()
    WHERE id = ${userId}
    RETURNING *
  `;
  return result[0];
}

async function updateUserPassword(userId, hashedPassword) {
  const result = await sql`
    UPDATE users
    SET password = ${hashedPassword}, updated_at = NOW()
    WHERE id = ${userId}
    RETURNING *
  `;
  return result[0];
}

async function deleteUser(userId) {
  const result = await sql`
    DELETE FROM users WHERE id = ${userId} RETURNING *
  `;
  return result[0];
}

async function softDeleteUser(userId) {
  const result = await sql`
    UPDATE users
    SET status = 'deleted', deleted_at = NOW()
    WHERE id = ${userId}
    RETURNING *
  `;
  return result[0];
}

// Audit log operations
async function createAuditLog(logData) {
  const result = await sql`
    INSERT INTO audit_logs (
      id, action, user_id, username, details, ip_address, user_agent
    ) VALUES (
      ${logData.id}, ${logData.action}, ${logData.userId},
      ${logData.username}, ${JSON.stringify(logData.details)},
      ${logData.ipAddress}, ${logData.userAgent}
    )
    RETURNING *
  `;
  return result[0];
}

async function getAuditLogs(limit = 100) {
  const result = await sql`
    SELECT * FROM audit_logs
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `;
  return result;
}

async function getAuditLogsByUserId(userId, limit = 50) {
  const result = await sql`
    SELECT * FROM audit_logs
    WHERE user_id = ${userId}
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `;
  return result;
}

// Blacklist operations
async function addToBlacklist(data) {
  const result = await sql`
    INSERT INTO blacklist (
      id, email, username, first_name, last_name, reason, original_user_id
    ) VALUES (
      ${data.id}, ${data.email}, ${data.username},
      ${data.firstName}, ${data.lastName}, ${data.reason}, ${data.originalUserId}
    )
    RETURNING *
  `;
  return result[0];
}

async function getBlacklist() {
  const result = await sql`
    SELECT * FROM blacklist ORDER BY blacklisted_at DESC
  `;
  return result;
}

async function isBlacklisted(email, username) {
  const result = await sql`
    SELECT * FROM blacklist
    WHERE email = ${email} OR username = ${username}
    LIMIT 1
  `;
  return result.length > 0;
}

async function removeFromBlacklist(blacklistId) {
  const result = await sql`
    DELETE FROM blacklist WHERE id = ${blacklistId} RETURNING *
  `;
  return result[0];
}

// Check if user exists
async function userExists(email, username) {
  const result = await sql`
    SELECT id FROM users
    WHERE email = ${email} OR username = ${username}
    LIMIT 1
  `;
  return result.length > 0;
}

module.exports = {
  sql,
  initDatabase,
  createUser,
  getUserByUsername,
  getUserById,
  getAdminByUsername,
  getAdminById,
  getAllUsers,
  updateUserStatus,
  updateUserProfile,
  updateUserPassword,
  deleteUser,
  softDeleteUser,
  createAuditLog,
  getAuditLogs,
  getAuditLogsByUserId,
  addToBlacklist,
  getBlacklist,
  isBlacklisted,
  removeFromBlacklist,
  userExists
};
