-- Seeds the physical basket pool. baskets are a fixed, reusable resource —
-- assigned to a prescription on send, released back to the pool on complete
-- (see BasketsService.assignBasket / releaseBasket). Safe to re-run.
INSERT INTO basket (basket_id, station_status)
SELECT 'BASKET-' || LPAD(n::text, 2, '0'), 0
FROM generate_series(1, 20) AS n
ON CONFLICT (basket_id) DO NOTHING;
