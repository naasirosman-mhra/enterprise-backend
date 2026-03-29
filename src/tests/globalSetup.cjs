const { execSync } = require('child_process');

module.exports = async function globalSetup() {
  const testDbUrl = process.env.DATABASE_URL;

  // Push schema to test database (creates tables if they don't exist, safe to rerun)
  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'pipe',
  });

  console.log('\n  Test database ready (inventory_db_test)\n');
};
