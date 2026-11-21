import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, pageOf, pagination } from './base.repo';

describe('pagination helpers', () => {
  it('uses stable defaults for absent input', () => {
    expect(pagination()).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    });
  });

  it('computes skip from page and clamps an oversized page size', () => {
    expect(pagination({ page: 3, pageSize: 20 })).toEqual({
      page: 3,
      pageSize: 20,
      skip: 40,
      take: 20,
    });
    expect(pagination({ page: 2, pageSize: 10_000 })).toMatchObject({
      pageSize: MAX_PAGE_SIZE,
      take: MAX_PAGE_SIZE,
    });
  });

  it('falls back for zero, negative and non-finite values', () => {
    expect(pagination({ page: 0, pageSize: -5 })).toMatchObject({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
    expect(pagination({ page: Number.NaN, pageSize: 1.9 })).toMatchObject({ page: 1, pageSize: 1 });
  });

  it('describes page position and totals', () => {
    const query = pagination({ page: 2, pageSize: 10 });
    expect(pageOf(Array.from({ length: 10 }), 25, query)).toEqual({
      items: expect.any(Array),
      page: 2,
      pageSize: 10,
      total: 25,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
    expect(pageOf([], 0, pagination()).hasPrev).toBe(false);
  });
});
