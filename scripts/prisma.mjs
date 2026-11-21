// Prisma CLI reads `.env`, but this repository keeps local values in
// `.env.local`. Load it first, then run the CLI without shell `.cmd` shims.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { config } from 'dotenv';

const root = process.cwd();
config({ path: resolve(root, '.env.local') });
config({ path: resolve(root, '.env') });

const cli = resolve(root, 'node_modules', 'prisma', 'build', 'index.js');
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
