// Simple environment loader that runs before the main server
require('dotenv').config({ path: '.env' });

// Now spawn the main server using tsx
const { spawn } = require('child_process');
const tsx = spawn('npx', ['tsx', 'server/index.ts'], {
  stdio: 'inherit',
  env: { ...process.env } // Pass all environment variables including the ones we just loaded
});

tsx.on('close', (code) => {
  process.exit(code);
}); 