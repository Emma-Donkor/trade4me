import { describe, expect, it } from '@jest/globals';
import { MONOREPO_ROOT_PACKAGE } from './index';

describe('@ts/types', () => {
  it('exports the monorepo identifier', () => {
    expect(MONOREPO_ROOT_PACKAGE).toBe('tradesense-ai');
  });
});
