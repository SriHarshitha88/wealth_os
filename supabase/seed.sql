-- Optional: 24 well-known NSE stocks with PLACEHOLDER prices so you can test
-- the New-Transaction picker and the dashboard immediately, without keys.
-- Prices here are dummy; run `npm run import:securities` + the cron for real ones.
-- (angel_token is left null so the price-cron skips these until you do the real import.)

insert into securities (symbol, name, exchange, sector, last_price, prev_close) values
  ('RELIANCE','Reliance Industries','NSE','Energy',2984,2952),
  ('TCS','Tata Consultancy Services','NSE','IT',4102,4006),
  ('INFY','Infosys','NSE','IT',1868,1833),
  ('HDFCBANK','HDFC Bank','NSE','Financials',1576,1582),
  ('ICICIBANK','ICICI Bank','NSE','Financials',1244,1238),
  ('TRENT','Trent','NSE','Consumer',6255,6067),
  ('DIXON','Dixon Technologies','NSE','Small Cap',14310,13733),
  ('BSE','BSE Ltd','NSE','Financials',2710,2664),
  ('ASIANPAINT','Asian Paints','NSE','Materials',2680,2712),
  ('BHARTIARTL','Bharti Airtel','NSE','Telecom',1512,1498),
  ('ITC','ITC','NSE','FMCG',478,476),
  ('SBIN','State Bank of India','NSE','Financials',842,838),
  ('LT','Larsen & Toubro','NSE','Industrials',3688,3651),
  ('HINDUNILVR','Hindustan Unilever','NSE','FMCG',2452,2461),
  ('BAJFINANCE','Bajaj Finance','NSE','Financials',7188,7102),
  ('MARUTI','Maruti Suzuki','NSE','Auto',12640,12511),
  ('TATAMOTORS','Tata Motors','NSE','Auto',984,972),
  ('SUNPHARMA','Sun Pharma','NSE','Pharma',1720,1706),
  ('WIPRO','Wipro','NSE','IT',298,293),
  ('ADANIENT','Adani Enterprises','NSE','Industrials',2890,2848),
  ('TITAN','Titan Company','NSE','Consumer',3456,3439),
  ('NESTLEIND','Nestle India','NSE','FMCG',2510,2517),
  ('KOTAKBANK','Kotak Mahindra Bank','NSE','Financials',1802,1794),
  ('AXISBANK','Axis Bank','NSE','Financials',1156,1149)
on conflict (exchange, symbol) do nothing;
