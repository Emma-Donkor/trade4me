import * as database from './index';

describe('@ts/database', () => {
  it('re-exports the Prisma client contract', () => {
    expect(Object.keys(database)).toEqual(expect.arrayContaining(['Prisma', 'PrismaClient']));
  });
});
