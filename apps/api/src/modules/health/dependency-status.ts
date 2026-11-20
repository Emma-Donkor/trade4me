export interface DependencyStatus {
  status: 'up' | 'down';
  latencyMs: number;
  error: string | null;
}

export function dependencyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
