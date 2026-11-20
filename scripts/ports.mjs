import { execFileSync } from 'node:child_process';
import net from 'node:net';

export const DEV_PORTS = [3000, 4000, 8000];

/** Returns true when something is already listening on the given port. */
export function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (error) => {
      resolve(error.code === 'EADDRINUSE' || error.code === 'EACCES');
    });
    server.once('listening', () => server.close(() => resolve(false)));
    server.listen(port);
  });
}

export async function findBusyPorts(ports = DEV_PORTS) {
  const results = await Promise.all(ports.map(async (port) => [port, await isPortInUse(port)]));
  return results.filter(([, busy]) => busy).map(([port]) => port);
}

/** Best-effort lookup of the process IDs listening on the dev ports. */
export function findListeningPids(ports = DEV_PORTS) {
  const pids = new Set();

  if (process.platform === 'win32') {
    let output = '';
    try {
      output = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' });
    } catch {
      return pids;
    }

    for (const line of output.split(/\r?\n/)) {
      const columns = line.trim().split(/\s+/);
      if (columns.length < 5) continue;
      const [, localAddress, , state, pid] = columns;
      if (state !== 'LISTENING' || !pid || pid === '0') continue;
      if (ports.some((port) => localAddress.endsWith(`:${port}`))) pids.add(pid);
    }
    return pids;
  }

  for (const port of ports) {
    try {
      const output = execFileSync('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN'], {
        encoding: 'utf8',
      });
      for (const pid of output.split(/\s+/)) if (pid) pids.add(pid);
    } catch {
      // lsof is optional; ignore and report whatever was found.
    }
  }
  return pids;
}
