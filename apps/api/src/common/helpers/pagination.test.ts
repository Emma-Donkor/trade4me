import { cursorPage, decodeCursor, encodeCursor, emptyPage } from './pagination';

describe('cursor pagination helper', () => {
  it('round-trips opaque cursors', () => {
    expect(decodeCursor(encodeCursor(25))).toBe(25);
  });

  it('slices items and reports a next cursor only when more remain', () => {
    const first = cursorPage(['a', 'b', 'c'], { limit: 2 });
    expect(first).toEqual({
      items: ['a', 'b'],
      limit: 2,
      nextCursor: encodeCursor(2),
      hasMore: true,
    });

    const second = cursorPage(['a', 'b', 'c'], { limit: 2, cursor: first.nextCursor! });
    expect(second).toEqual({ items: ['c'], limit: 2, nextCursor: null, hasMore: false });
  });

  it('returns an honest empty page', () => {
    expect(emptyPage({ limit: 10 })).toEqual({
      items: [],
      limit: 10,
      nextCursor: null,
      hasMore: false,
    });
  });

  it('rejects malformed cursors', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow('Invalid cursor');
  });
});
