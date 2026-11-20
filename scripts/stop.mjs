import { execFileSync } from 'node:child_process';
import { DEV_PORTS, findListeningPids } from './ports.mjs';

const pids = findListeningPids();

if (pids.size === 0) {
  console.log(`No processes found on ports ${DEV_PORTS.join(', ')}.`);
  process.exit(0);
}

for (const pid of pids) {
  // A process can exit between discovery and termination; skip that race.
  try {
    process.kill(Number(pid), 0);
  } catch {
    continue;
  }

  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' });
    } else {
      execFileSync('kill', ['-9', pid], { stdio: 'ignore' });
    }
    console.log(`Stopped process ${pid}`);
  } catch {
    // It may have exited during the kill attempt; only warn if still alive.
    try {
      process.kill(Number(pid), 0);
      console.warn(`Could not stop process ${pid}`);
    } catch {
      // Already gone.
    }
  }
}
