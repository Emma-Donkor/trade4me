import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Resolve the Python interpreter for the AI engine. Uses the project venv when
 * it exists (created by scripts/setup-ai.sh|ps1), otherwise falls back to the
 * interpreter on PATH so the failure message stays meaningful.
 */
export function aiPython() {
  const root = process.cwd();
  const venvPython = resolve(
    root,
    'apps/ai-engine/.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );

  return existsSync(venvPython) ? venvPython : 'python';
}
