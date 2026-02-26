const { execSync } = require('child_process');

module.exports = async function globalSetup() {
  const testDbUrl = 'postgresql://Naasir.Osman@localhost:5432/inventory_db_test';

  // Create the test database if it doesn't already exist
  try {
    execSync('createdb inventory_db_test', { stdio: 'pipe' });
  } catch {
    // Already exists — fine
  }

  // Push schema to test database (creates tables if they don't exist, safe to rerun)
  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'pipe',
  });

  console.log('\n  Test database ready (inventory_db_test)\n');
};
