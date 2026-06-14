-- 22 physical keys
insert into gym_key (key_no)
select generate_series(1, 22);

-- membership types (catalog)
insert into membership_type (training_type, package, label, is_time_based, sessions) values
  ('individualni','1/1','Individualni 1/1 (dnevna)', false, 1),
  ('individualni','8/1','Individualni 8/1', false, 8),
  ('individualni','10/1','Individualni 10/1', false, 10),
  ('individualni','12/1','Individualni 12/1', false, 12),
  ('duo','1/1','Duo 1/1 (dnevna)', false, 1),
  ('duo','8/1','Duo 8/1', false, 8),
  ('duo','10/1','Duo 10/1', false, 10),
  ('duo','12/1','Duo 12/1', false, 12),
  ('vodjeni','1/1','Vođeni 1/1 (dnevna)', false, 1),
  ('vodjeni','8/1','Vođeni 8/1', false, 8),
  ('vodjeni','10/1','Vođeni 10/1', false, 10),
  ('vodjeni','12/1','Vođeni 12/1', false, 12),
  ('vodjeni','16/1','Vođeni 16/1', false, 16),
  ('otvoreni','1/1','Otvoreni tip 1/1 (dnevna)', false, 1),
  ('otvoreni','8/1','Otvoreni tip 8/1', false, 8),
  ('otvoreni','12/1','Otvoreni tip 12/1', false, 12),
  ('otvoreni','30/1','Otvoreni tip 30/1 (mesečna)', true, null),
  ('kardio','30/1','Kardio 30/1 (mesečna)', true, null);

-- standard prices (RSD)
insert into price (membership_type_id, amount_rsd, is_discount_price)
select mt.id, v.amount_rsd, false
from membership_type mt
join (values
  ('individualni','1/1',1200),
  ('individualni','8/1',8800),
  ('individualni','10/1',9800),
  ('individualni','12/1',11800),
  ('duo','1/1',1000),
  ('duo','8/1',6800),
  ('duo','10/1',7800),
  ('duo','12/1',8800),
  ('vodjeni','1/1',1000),
  ('vodjeni','8/1',3600),
  ('vodjeni','10/1',4100),
  ('vodjeni','12/1',4600),
  ('vodjeni','16/1',5100),
  ('otvoreni','1/1',450),
  ('otvoreni','8/1',2600),
  ('otvoreni','12/1',2800),
  ('otvoreni','30/1',3200),
  ('kardio','30/1',2600)
) as v(training_type, package, amount_rsd)
  on v.training_type = mt.training_type::text and v.package = mt.package;

-- discount prices (Open type only)
insert into price (membership_type_id, amount_rsd, is_discount_price)
select mt.id, v.amount_rsd, true
from membership_type mt
join (values
  ('otvoreni','12/1',2500),
  ('otvoreni','30/1',2700)
) as v(training_type, package, amount_rsd)
  on v.training_type = mt.training_type::text and v.package = mt.package;
