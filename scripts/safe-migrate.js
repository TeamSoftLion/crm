const { execSync } = require('child_process');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  for (let i = 1; i <= 8; i++) {
    try {
      console.log(`🔄 prisma migrate deploy (try ${i})`);
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      console.log('✅ prisma migrate deploy success');
      process.exit(0);
    } catch (e) {
      console.log('⚠️ DB not ready yet, waiting 6s...');
      await sleep(6000);
    }
  }

  console.log('⚠️ prisma migrate deploy skipped (DB still sleeping)');
  process.exit(0);
})();
