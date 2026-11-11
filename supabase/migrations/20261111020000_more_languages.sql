-- =============================================================================
-- Anston: add Spanish, Chinese (Mandarin, Simplified), French and Urdu
-- Run after 20261111000000_initial_schema.sql.
-- =============================================================================

-- Languages a user can pick and a listing can be written in.
alter type public.app_language add value if not exists 'es';  -- Spanish
alter type public.app_language add value if not exists 'zh';  -- Chinese (Mandarin, Simplified)
alter type public.app_language add value if not exists 'fr';  -- French
alter type public.app_language add value if not exists 'ur';  -- Urdu

-- Category names in the new languages.
alter table public.categories
  add column if not exists name_es text,
  add column if not exists name_zh text,
  add column if not exists name_fr text,
  add column if not exists name_ur text;

update public.categories c
set name_es = v.name_es, name_zh = v.name_zh, name_fr = v.name_fr, name_ur = v.name_ur
from (values
  ('vehicles',       'Vehículos',               '车辆',     'Véhicules',               'گاڑیاں'),
  ('real-estate',    'Casas y apartamentos',    '房屋与公寓', 'Maisons et appartements', 'مکانات اور اپارٹمنٹس'),
  ('boats',          'Barcos',                  '船只',     'Bateaux',                 'کشتیاں'),
  ('clothes',        'Ropa',                    '服装',     'Vêtements',               'کپڑے'),
  ('jewelry',        'Joyería',                 '珠宝',     'Bijoux',                  'زیورات'),
  ('accessories',    'Accesorios',              '配饰',     'Accessoires',             'لوازمات'),
  ('furniture',      'Muebles',                 '家具',     'Meubles',                 'فرنیچر'),
  ('equipment',      'Equipos',                 '设备',     'Équipement',              'سامان'),
  ('instruments',    'Instrumentos musicales',  '乐器',     'Instruments de musique',  'موسیقی کے آلات'),
  ('food',           'Comida',                  '食品',     'Alimentation',            'کھانا'),
  ('services',       'Servicios',               '服务',     'Services',                'خدمات'),
  ('cleaning',       'Limpieza',                '清洁',     'Ménage',                  'صفائی'),
  ('sports-classes', 'Clases deportivas',       '体育课程', 'Cours de sport',          'کھیلوں کی کلاسیں'),
  ('music-lessons',  'Clases de música',        '音乐课',   'Cours de musique',        'موسیقی کے اسباق'),
  ('drivers',        'Conductores',             '司机',     'Chauffeurs',              'ڈرائیور'),
  ('investigators',  'Investigadores privados', '私家侦探', 'Détectives privés',       'نجی تفتیش کار')
) as v(slug, name_es, name_zh, name_fr, name_ur)
where c.slug = v.slug;

-- New categories added later fall back to English until translated.
update public.categories
set name_es = coalesce(name_es, name_en),
    name_zh = coalesce(name_zh, name_en),
    name_fr = coalesce(name_fr, name_en),
    name_ur = coalesce(name_ur, name_en);

alter table public.categories
  alter column name_es set not null,
  alter column name_zh set not null,
  alter column name_fr set not null,
  alter column name_ur set not null;
