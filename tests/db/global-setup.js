/**
 * Creates a fresh test database, applies the Supabase shim and then every
 * migration in supabase/migrations in filename order.
 *
 * DATABASE_URL must point at a PostgreSQL 15+ server as a superuser, e.g.
 *   postgres://postgres:postgres@localhost:5432/postgres
 * The test database name is studylog_test (dropped and recreated each run).
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const TEST_DB = 'studylog_test';

module.exports = async () => {
  process.env.TZ = 'America/Los_Angeles';
  const adminUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`drop database if exists ${TEST_DB} with (force)`);
  await admin.query(`create database ${TEST_DB}`);
  await admin.end();

  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${TEST_DB}`;
  process.env.STUDYLOG_TEST_DATABASE_URL = testUrl.toString();

  const db = new Client({ connectionString: testUrl.toString() });
  await db.connect();
  const root = path.resolve(__dirname, '..', '..');
  await db.query(fs.readFileSync(path.join(__dirname, 'supabase-shim.sql'), 'utf8'));
  const migrationsDir = path.join(root, 'supabase', 'migrations');
  for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }
  await db.end();
};
