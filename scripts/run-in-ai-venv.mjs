import { spawnSync } from 'node:child_process';
import { aiPython } from './ai-python.mjs';

const [moduleName, ...args] = process.argv.slice(2);

if (!moduleName) {
  console.error('Usage: node scripts/run-in-ai-venv.mjs <python-module> [args...]');
  process.exit(1);
}

const result = spawnSync(aiPython(), ['-m', moduleName, ...args], { stdio: 'inherit' });

if (result.error) {
  console.error(`Failed to start the AI engine interpreter: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
