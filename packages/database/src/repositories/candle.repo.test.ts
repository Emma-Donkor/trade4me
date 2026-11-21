import { CANDLE_SELECT, CandleRepository, type CandleRangeInput } from './candle.repo';

describe('CandleRepository projection', () => {
  it('selects only documented candle columns (no SELECT *)', () => {
    expect(Object.keys(CANDLE_SELECT).sort()).toEqual(
      [
        'id',
        'pairId',
        'timeframe',
        'timestamp',
        'open',
        'high',
        'low',
        'close',
        'volume',
        'provider',
      ].sort(),
    );
    expect(Object.values(CANDLE_SELECT).every((value) => value === true)).toBe(true);
  });

  it('queries a bounded range through the select, ordered by the indexed timestamp', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const repository = new CandleRepository();
    Object.assign(repository, { client: { marketCandle: { findMany, count } } });

    const input: CandleRangeInput = {
      pairId: 'pair-1',
      timeframe: 'H1',
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2026-01-02T00:00:00Z'),
      page: 2,
      pageSize: 10,
    };
    const result = await repository.findByRange(input);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          pairId: 'pair-1',
          timeframe: 'H1',
          timestamp: { gte: input.from, lte: input.to },
        },
        select: CANDLE_SELECT,
        orderBy: { timestamp: 'desc' },
        skip: 10,
        take: 10,
      }),
    );
    expect(result).toMatchObject({ page: 2, pageSize: 10, total: 0, hasNext: false });
  });
});
