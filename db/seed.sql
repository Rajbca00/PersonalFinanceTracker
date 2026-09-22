-- =============================================================
-- Personal Finance Tracker — sample data
-- Run AFTER schema.sql (Neon SQL Editor, or psql "$DATABASE_URL" -f db/seed.sql). Safe to re-run (it clears the tables first).
-- Covers Jul / Aug / Sep 2026 so month comparison and trip
-- highlighting have something real to show.
-- =============================================================

truncate transactions, import_batches, events, credit_cards, accounts, categories, buckets restart identity cascade;

-- ------------------------------------------------------------------
-- Buckets
-- ------------------------------------------------------------------
insert into buckets (name, color, sort_order) values
  ('Personal',   'blue',   1),
  ('Laya & Bee', 'purple', 2),
  ('Temple',     'amber',  3);

-- ------------------------------------------------------------------
-- Categories
-- ------------------------------------------------------------------
insert into categories (name, kind, icon, is_system, sort_order) values
  ('Clothes & Accessories',      'expense',  'shirt',    false,  1),
  ('Products',                   'expense',  'box',      false,  2),
  ('Grocery',                    'expense',  'cart',     false,  3),
  ('Cylinder',                   'expense',  'flame',    false,  4),
  ('EB',                         'expense',  'bolt',     false,  5),
  ('Car Fuel',                   'expense',  'car',      false,  6),
  ('Bike Fuel',                  'expense',  'bike',     false,  7),
  ('Car Service & Repairs',      'expense',  'wrench',   false,  8),
  ('Gifts',                      'expense',  'gift',     false,  9),
  ('Recharge & Utilities',       'expense',  'phone',    false, 10),
  ('Malls & Movies',             'expense',  'film',     false, 11),
  ('Outside Food',               'expense',  'utensils', false, 12),
  ('Household & Quick Commerce', 'expense',  'home',     false, 13),
  ('Misc',                       'expense',  'tag',      false, 14),
  ('Salary / Income',            'income',   'wallet',   true,  15),
  ('Other Income',               'income',   'coins',    true,  16),
  ('Credit Card Payment',        'transfer', 'card',     true,  17),
  ('Bank Transfer',              'transfer', 'swap',     true,  18);

-- ------------------------------------------------------------------
-- Accounts
-- ------------------------------------------------------------------
insert into accounts (name, type, institution, opening_balance, sort_order) values
  ('HDFC Savings',  'savings', 'HDFC Bank',  185000, 1),
  ('SBI Savings',   'savings', 'State Bank of India', 92000, 2),
  ('ICICI Savings', 'savings', 'ICICI Bank', 41000, 3),
  ('Cash',          'cash',    null,          12000, 4);

-- ------------------------------------------------------------------
-- Credit cards
-- ------------------------------------------------------------------
insert into credit_cards (name, provider, credit_limit, opening_outstanding, statement_day, due_day, sort_order) values
  ('HDFC Credit Card',  'HDFC Bank',  350000, 0, 18, 5, 1),
  ('ICICI Credit Card', 'ICICI Bank', 200000, 0, 25, 12, 2);

-- ------------------------------------------------------------------
-- Trips & events
-- ------------------------------------------------------------------
insert into events (name, start_date, end_date, description, bucket_id)
select v.name, v.start_date, v.end_date, v.description, b.id
from (values
  ('Goa Trip',              date '2026-09-05', date '2026-09-08', 'Four days in North Goa',            'Personal'),
  ('Wife Birthday',         date '2026-09-14', date '2026-09-14', 'Dinner, cake and gift',             'Personal'),
  ('Temple Kumbabishekam',  date '2026-08-16', date '2026-08-18', 'Consecration ceremony expenses',    'Temple'),
  ('Christmas Shopping',    date '2026-12-10', date '2026-12-24', 'Gifts and decorations',             'Personal')
) as v(name, start_date, end_date, description, bucket)
join buckets b on b.name = v.bucket;

-- ------------------------------------------------------------------
-- Transactions
-- ------------------------------------------------------------------
insert into transactions (
  txn_date, type, amount,
  account_id, credit_card_id, dest_account_id, dest_credit_card_id,
  bucket_id, category_id, event_id,
  merchant, note, reviewed
)
select
  v.txn_date, v.type, v.amount,
  sa.id, sc.id, da.id, dc.id,
  b.id, c.id, e.id,
  v.merchant, v.note, true
from (values
  -- ========================= SEPTEMBER 2026 =========================
  (date '2026-09-01', 'income',   130000::numeric, 'HDFC Savings'::text, null::text, null::text, null::text, 'Personal',   'Salary / Income'::text,            null::text,                   'Monthly Salary'::text,      'September payroll'::text),
  (date '2026-09-02', 'expense',      2400,        'SBI Savings',        null,       null,       null,       'Temple',     'EB',                               null,                         'TNEB',                      'August bill'),
  (date '2026-09-02', 'expense',      1150,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Grocery',                          null,                         'More Supermarket',          'Weekly staples'),
  (date '2026-09-03', 'expense',       899,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Recharge & Utilities',             null,                         'Airtel',                    'Broadband'),
  (date '2026-09-03', 'expense',      1180,        'Cash',               null,       null,       null,       'Laya & Bee', 'Products',                         null,                         'Baking Supplies',           'Cream and butter'),
  (date '2026-09-04', 'expense',      3200,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Car Fuel',                         null,                         'Indian Oil',                'Full tank before trip'),
  (date '2026-09-05', 'expense',      8600,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Misc',                             'Goa Trip',                   'IndiGo',                    'Flights'),
  (date '2026-09-05', 'expense',      1450,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Outside Food',                     'Goa Trip',                   'Cafe Bodega',               'Lunch'),
  (date '2026-09-06', 'expense',      4200,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Misc',                             'Goa Trip',                   'Taj Resort',                'Night 1'),
  (date '2026-09-06', 'expense',      2100,        null,                 'ICICI Credit Card', null, null,    'Personal',   'Outside Food',                     'Goa Trip',                   'Thalassa',                  'Dinner'),
  (date '2026-09-07', 'expense',      1300,        'Cash',               null,       null,       null,       'Personal',   'Misc',                             'Goa Trip',                   'Scooter Rental',            'Two days'),
  (date '2026-09-07', 'expense',       850,        'Cash',               null,       null,       null,       'Personal',   'Outside Food',                     'Goa Trip',                   'Beach Shack',               'Breakfast'),
  (date '2026-09-08', 'expense',      4200,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Misc',                             'Goa Trip',                   'Taj Resort',                'Night 2'),
  (date '2026-09-08', 'expense',      1900,        null,                 'ICICI Credit Card', null, null,    'Personal',   'Clothes & Accessories',            'Goa Trip',                   'Anjuna Market',             'Beach shirts'),
  (date '2026-09-09', 'expense',      1050,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Household & Quick Commerce',       null,                         'Swiggy Instamart',          'Restock after trip'),
  (date '2026-09-10', 'expense',      1250,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Grocery',                          null,                         'Reliance Fresh',            'Monthly groceries'),
  (date '2026-09-10', 'income',       12000,       'Cash',               null,       null,       null,       'Laya & Bee', 'Other Income',                     null,                         'Cake Orders',               'Three custom cakes'),
  (date '2026-09-11', 'expense',      1150,        'Cash',               null,       null,       null,       'Personal',   'Cylinder',                         null,                         'Indane',                    'LPG refill'),
  (date '2026-09-11', 'expense',       620,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Outside Food',                     null,                         'Swiggy',                    'Friday dinner'),
  (date '2026-09-12', 'expense',      2850,        null,                 'ICICI Credit Card', null, null,    'Laya & Bee', 'Products',                         null,                         'Amazon',                    'Piping nozzles set'),
  (date '2026-09-12', 'expense',       450,        'Cash',               null,       null,       null,       'Personal',   'Bike Fuel',                        null,                         'HP Petrol Pump',            null),
  (date '2026-09-13', 'expense',      3400,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Malls & Movies',                   null,                         'PVR Cinemas',               'Weekend show'),
  (date '2026-09-14', 'expense',      6500,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Gifts',                            'Wife Birthday',              'Tanishq',                   'Birthday gift'),
  (date '2026-09-14', 'expense',      3200,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Outside Food',                     'Wife Birthday',              'Barbeque Nation',           'Birthday dinner'),
  (date '2026-09-14', 'expense',      1400,        'Cash',               null,       null,       null,       'Laya & Bee', 'Products',                         'Wife Birthday',              'Home Bakery',               'Birthday cake bake'),
  (date '2026-09-15', 'expense',      2100,        'SBI Savings',        null,       null,       null,       'Temple',     'Misc',                             null,                         'Temple Maintenance',        'Cleaning and flowers'),
  (date '2026-09-15', 'expense',       780,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Household & Quick Commerce',       null,                         'Zepto',                     'Late night order'),
  (date '2026-09-16', 'expense',      1499,        null,                 'ICICI Credit Card', null, null,    'Personal',   'Products',                         null,                         'Amazon',                    'Phone accessory'),
  (date '2026-09-16', 'income',        8000,       'HDFC Savings',       null,       null,       null,       'Laya & Bee', 'Other Income',                     null,                         'Cake Orders',               'Wedding order advance'),
  (date '2026-09-17', 'expense',      2600,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Grocery',                          null,                         'BigBasket',                 'Monthly stock up'),
  (date '2026-09-17', 'expense',      3900,        'SBI Savings',        null,       null,       null,       'Temple',     'Recharge & Utilities',             null,                         'Temple Water Supply',       'Tanker'),
  (date '2026-09-18', 'expense',       950,        'Cash',               null,       null,       null,       'Personal',   'Outside Food',                     null,                         'Saravana Bhavan',           'Family lunch'),
  (date '2026-09-19', 'expense',      4800,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Car Service & Repairs',            null,                         'Maruti Service',            'Periodic service'),
  (date '2026-09-19', 'expense',      2200,        null,                 'ICICI Credit Card', null, null,    'Personal',   'Clothes & Accessories',            null,                         'Max Fashion',               'Office shirts'),
  (date '2026-09-20', 'expense',       850,        'Cash',               null,       null,       null,       'Laya & Bee', 'Products',                         null,                         'Cake Supplies',             'Cream'),
  (date '2026-09-20', 'expense',      1100,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Recharge & Utilities',             null,                         'Jio',                       'Mobile recharge'),
  (date '2026-09-21', 'expense',      1299,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Products',                         null,                         'Amazon',                    'Phone accessory'),
  (date '2026-09-21', 'expense',      2500,        'SBI Savings',        null,       null,       null,       'Temple',     'Gifts',                            null,                         'Annadhanam',                'Weekly offering'),
  (date '2026-09-22', 'expense',       450,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Outside Food',                     null,                         'Swiggy',                    'Dinner'),
  (date '2026-09-22', 'expense',      1250,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Grocery',                          null,                         'More Supermarket',          'Monthly groceries'),
  -- transfers (never counted as income or expense)
  (date '2026-09-05', 'transfer',     20000,       'HDFC Savings',       null,       'ICICI Savings', null,  'Personal',   'Bank Transfer',                    null,                         'Self Transfer',             'Moving to ICICI'),
  (date '2026-09-05', 'transfer',     28500,       'HDFC Savings',       null,       null,       'HDFC Credit Card',       'Personal',   'Credit Card Payment',  null,                         'HDFC CC Payment',           'August statement'),
  (date '2026-09-12', 'transfer',      9500,       'HDFC Savings',       null,       null,       'ICICI Credit Card',      'Personal',   'Credit Card Payment',  null,                         'ICICI CC Payment',          'August statement'),
  (date '2026-09-02', 'transfer',      6000,       'HDFC Savings',       null,       'Cash',     null,       'Personal',    'Bank Transfer',                   null,                         'ATM Withdrawal',            'Pocket cash'),

  -- ========================== AUGUST 2026 ===========================
  (date '2026-08-01', 'income',      130000,       'HDFC Savings',       null,       null,       null,       'Personal',   'Salary / Income',                  null,                         'Monthly Salary',            'August payroll'),
  (date '2026-08-02', 'expense',      2250,        'SBI Savings',        null,       null,       null,       'Temple',     'EB',                               null,                         'TNEB',                      'July bill'),
  (date '2026-08-03', 'expense',      1320,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Grocery',                          null,                         'Reliance Fresh',            null),
  (date '2026-08-04', 'expense',      3100,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Car Fuel',                         null,                         'Indian Oil',                null),
  (date '2026-08-05', 'expense',       780,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Outside Food',                     null,                         'Zomato',                    null),
  (date '2026-08-06', 'expense',      1980,        null,                 'ICICI Credit Card', null, null,    'Personal',   'Household & Quick Commerce',       null,                         'Swiggy Instamart',          'Household refill'),
  (date '2026-08-07', 'expense',      1150,        'Cash',               null,       null,       null,       'Personal',   'Cylinder',                         null,                         'Indane',                    'LPG refill'),
  (date '2026-08-08', 'expense',      4300,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Clothes & Accessories',            null,                         'Westside',                  'Kurta set'),
  (date '2026-08-09', 'income',       15000,       'Cash',               null,       null,       null,       'Laya & Bee', 'Other Income',                     null,                         'Cake Orders',               'Onam orders'),
  (date '2026-08-10', 'expense',      2400,        'Cash',               null,       null,       null,       'Laya & Bee', 'Products',                         null,                         'Baking Supplies',           'Bulk flour and sugar'),
  (date '2026-08-11', 'expense',      1650,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Grocery',                          null,                         'BigBasket',                 null),
  (date '2026-08-12', 'expense',       520,        'Cash',               null,       null,       null,       'Personal',   'Bike Fuel',                        null,                         'HP Petrol Pump',            null),
  (date '2026-08-13', 'expense',      2900,        null,                 'ICICI Credit Card', null, null,    'Personal',   'Malls & Movies',                   null,                         'Phoenix Mall',              'Weekend outing'),
  (date '2026-08-14', 'expense',      1100,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Recharge & Utilities',             null,                         'Jio',                       'Mobile recharge'),
  (date '2026-08-16', 'expense',     18000,        'SBI Savings',        null,       null,       null,       'Temple',     'Misc',                             'Temple Kumbabishekam',       'Priest & Rituals',          'Main ceremony'),
  (date '2026-08-16', 'expense',      7500,        'SBI Savings',        null,       null,       null,       'Temple',     'Gifts',                            'Temple Kumbabishekam',       'Annadhanam',                'Community meal'),
  (date '2026-08-17', 'expense',      5200,        'SBI Savings',        null,       null,       null,       'Temple',     'Products',                         'Temple Kumbabishekam',       'Decorations',               'Flowers and lighting'),
  (date '2026-08-18', 'expense',      3400,        'Cash',               null,       null,       null,       'Temple',     'Outside Food',                     'Temple Kumbabishekam',       'Catering',                  'Volunteer meals'),
  (date '2026-08-19', 'expense',      1290,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Products',                         null,                         'Amazon',                    'Kitchen rack'),
  (date '2026-08-20', 'expense',       940,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Outside Food',                     null,                         'Swiggy',                    null),
  (date '2026-08-21', 'expense',      2100,        null,                 'ICICI Credit Card', null, null,    'Laya & Bee', 'Products',                         null,                         'Amazon',                    'Cake boxes'),
  (date '2026-08-22', 'expense',      1480,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Grocery',                          null,                         'More Supermarket',          null),
  (date '2026-08-24', 'expense',      3600,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Car Fuel',                         null,                         'Shell',                     null),
  (date '2026-08-25', 'expense',      1750,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Household & Quick Commerce',       null,                         'Zepto',                     null),
  (date '2026-08-26', 'expense',      5400,        'HDFC Savings',       null,       null,       null,       'Personal',   'Misc',                             null,                         'LIC Premium',               'Quarterly premium'),
  (date '2026-08-27', 'expense',       680,        'Cash',               null,       null,       null,       'Personal',   'Outside Food',                     null,                         'Local Restaurant',          null),
  (date '2026-08-28', 'expense',      2250,        null,                 'ICICI Credit Card', null, null,    'Personal',   'Clothes & Accessories',            null,                         'Max Fashion',               null),
  (date '2026-08-29', 'expense',      1120,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Grocery',                          null,                         'Reliance Fresh',            null),
  (date '2026-08-30', 'expense',      2800,        'SBI Savings',        null,       null,       null,       'Temple',     'Recharge & Utilities',             null,                         'Temple Water Supply',       'Tanker'),
  (date '2026-08-05', 'transfer',     24000,       'HDFC Savings',       null,       null,       'HDFC Credit Card',       'Personal',   'Credit Card Payment',  null,                         'HDFC CC Payment',           'July statement'),
  (date '2026-08-12', 'transfer',      8200,       'HDFC Savings',       null,       null,       'ICICI Credit Card',      'Personal',   'Credit Card Payment',  null,                         'ICICI CC Payment',          'July statement'),
  (date '2026-08-02', 'transfer',      5000,       'HDFC Savings',       null,       'Cash',     null,       'Personal',    'Bank Transfer',                   null,                         'ATM Withdrawal',            'Pocket cash'),

  -- ============================ JULY 2026 ===========================
  (date '2026-07-01', 'income',      125000,       'HDFC Savings',       null,       null,       null,       'Personal',   'Salary / Income',                  null,                         'Monthly Salary',            'July payroll'),
  (date '2026-07-03', 'expense',      2180,        'SBI Savings',        null,       null,       null,       'Temple',     'EB',                               null,                         'TNEB',                      'June bill'),
  (date '2026-07-04', 'expense',      1420,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Grocery',                          null,                         'BigBasket',                 null),
  (date '2026-07-06', 'expense',      2950,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Car Fuel',                         null,                         'Indian Oil',                null),
  (date '2026-07-08', 'expense',       860,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Outside Food',                     null,                         'Swiggy',                    null),
  (date '2026-07-09', 'income',        9500,       'Cash',               null,       null,       null,       'Laya & Bee', 'Other Income',                     null,                         'Cake Orders',               'Two orders'),
  (date '2026-07-10', 'expense',      1900,        'Cash',               null,       null,       null,       'Laya & Bee', 'Products',                         null,                         'Baking Supplies',           null),
  (date '2026-07-12', 'expense',      1150,        'Cash',               null,       null,       null,       'Personal',   'Cylinder',                         null,                         'Indane',                    'LPG refill'),
  (date '2026-07-14', 'expense',      3800,        null,                 'ICICI Credit Card', null, null,    'Personal',   'Malls & Movies',                   null,                         'Phoenix Mall',              null),
  (date '2026-07-16', 'expense',      1100,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Recharge & Utilities',             null,                         'Jio',                       'Mobile recharge'),
  (date '2026-07-18', 'expense',      6200,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Car Service & Repairs',            null,                         'Maruti Service',            'Brake pads'),
  (date '2026-07-20', 'expense',      1560,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Household & Quick Commerce',       null,                         'Swiggy Instamart',          null),
  (date '2026-07-22', 'expense',      2400,        'SBI Savings',        null,       null,       null,       'Temple',     'Misc',                             null,                         'Temple Maintenance',        null),
  (date '2026-07-24', 'expense',      1340,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Grocery',                          null,                         'More Supermarket',          null),
  (date '2026-07-26', 'expense',       590,        'Cash',               null,       null,       null,       'Personal',   'Bike Fuel',                        null,                         'HP Petrol Pump',            null),
  (date '2026-07-28', 'expense',      3100,        null,                 'ICICI Credit Card', null, null,    'Personal',   'Clothes & Accessories',            null,                         'Westside',                  null),
  (date '2026-07-30', 'expense',       720,        null,                 'HDFC Credit Card', null, null,     'Personal',   'Outside Food',                     null,                         'Zomato',                    null),
  (date '2026-07-05', 'transfer',     19500,       'HDFC Savings',       null,       null,       'HDFC Credit Card',       'Personal',   'Credit Card Payment',  null,                         'HDFC CC Payment',           'June statement'),
  (date '2026-07-02', 'transfer',      5000,       'HDFC Savings',       null,       'Cash',     null,       'Personal',    'Bank Transfer',                   null,                         'ATM Withdrawal',            'Pocket cash')
) as v(txn_date, type, amount, src_account, src_card, dest_account, dest_card, bucket, category, event, merchant, note)
left join accounts     sa on sa.name = v.src_account
left join credit_cards sc on sc.name = v.src_card
left join accounts     da on da.name = v.dest_account
left join credit_cards dc on dc.name = v.dest_card
join      buckets      b  on b.name  = v.bucket
left join categories   c  on c.name  = v.category
left join events       e  on e.name  = v.event;
