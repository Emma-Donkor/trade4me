# TimescaleDB readiness

`MarketCandle` is designed so TimescaleDB can be adopted without restructuring
the Prisma schema or rewriting repositories (README §7.4).

## Why no restructuring is needed

- Candles are keyed by `(pairId, timeframe, timestamp)` and every history/chart
  query is a range scan on that key.
- The declared `market_candle_range_idx (pairId, timeframe, timestamp DESC)`
  index already matches the access pattern; the P04 integration test asserts
  that the query planner uses it.
- `timestamp` is a non-null `DateTime` column on every candle row — the
  partitioning requirement for a hypertable.

## Migration path (when write volume requires it)

1. Install the TimescaleDB extension in PostgreSQL 16.
2. Create the hypertable in a migration — Prisma keeps the same model:

   ```sql
   CREATE EXTENSION IF NOT EXISTS timescaledb;
   SELECT create_hypertable(
     '"MarketCandle"', 'timestamp',
     migrate_data => true,
     if_not_exists => true
   );
   ```

3. Add continuous aggregates for daily/hourly pivots over the same indexed
   range; the API keeps querying `MarketCandle` through `CandleRepository` and
   reads the aggregates from the cache layer.
4. Verify `EXPLAIN` still shows an index/timescaledb scan for the range query.

No application model, relation or repository signature changes are required.
