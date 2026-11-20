import concurrently from 'concurrently';
import { aiPython } from './ai-python.mjs';
import { findBusyPorts } from './ports.mjs';

const busyPorts = await findBusyPorts();

if (busyPorts.length > 0) {
  console.error('');
  console.error(
    `  Cannot start: port${busyPorts.length > 1 ? 's' : ''} ${busyPorts.join(', ')} already in use.`,
  );
  console.error('  The development stack may already be running in another terminal.');
  console.error('  Stop it there with CTRL+C, or run `npm run stop` to free the ports.');
  console.error('');
  process.exit(1);
}

const python = `"${aiPython()}"`;

console.log('');
console.log('  TradeSense AI - full development stack (one terminal)');
console.log('  -------------------------------------------------------');
console.log('  web  -> http://localhost:3000');
console.log('  api  -> http://localhost:4000/api/v1/health');
console.log('  ai   -> http://localhost:8000/health');
console.log('  -------------------------------------------------------');
console.log('  Press CTRL+C to stop all three services.');
console.log('');

const { result } = concurrently(
  [
    { name: 'web', command: 'npm run dev -w apps/web', prefixColor: 'cyan' },
    { name: 'api', command: 'npm run dev -w apps/api', prefixColor: 'green' },
    {
      name: 'ai',
      command: `${python} -m uvicorn app.main:app --reload --app-dir apps/ai-engine --port 8000`,
      prefixColor: 'magenta',
    },
  ],
  {
    killOthersOn: ['failure'],
    restartTries: 0,
    successCondition: 'all',
    timestampFormat: 'HH:mm:ss',
  },
);

result.catch((error) => {
  console.error(`Development stack stopped: ${error.message}`);
  process.exitCode = 1;
});
