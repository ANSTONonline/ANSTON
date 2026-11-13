-- =============================================================================
-- Anston: refund choice on listings, and "Other" categories.
-- Run after 20261116000000_fifteen_more_languages.sql.
-- =============================================================================

-- Each listing says whether the seller accepts refunds, and for how long.
alter table public.listings add column if not exists refund_policy text
  check (refund_policy in ('refundable', 'non_refundable'));
alter table public.listings add column if not exists refund_days integer
  check (refund_days between 1 and 90);

-- "Other" for items that don't fit a category, and "Other services".
insert into public.categories (slug, name_en, name_ar, name_es, name_zh, name_fr, name_ur, names, icon, allowed_modes, requires_license, sort_order, attribute_schema)
values ('other', 'Other', 'أخرى', 'Otros', '其他', 'Autres', 'دیگر',
        '{"hi": "अन्य", "bn": "অন্যান্য", "id": "Lainnya", "pt": "Outros", "ru": "Другое", "de": "Sonstiges", "it": "Altro", "tr": "Diğer", "ja": "その他", "ko": "기타", "vi": "Khác", "fil": "Iba pa", "fa": "سایر", "sw": "Nyingine", "he": "אחר"}'::jsonb, '📦', '{sale,auction,rental}', false, 105, '{}')
on conflict (slug) do nothing;

insert into public.categories (parent_id, slug, name_en, name_ar, name_es, name_zh, name_fr, name_ur, names, icon, allowed_modes, requires_license, sort_order)
select s.id, 'other-services', 'Other services', 'خدمات أخرى', 'Otros servicios', '其他服务',
       'Autres services', 'دیگر خدمات', '{"hi": "अन्य सेवाएँ", "bn": "অন্যান্য সেবা", "id": "Jasa lainnya", "pt": "Outros serviços", "ru": "Другие услуги", "de": "Sonstige Dienstleistungen", "it": "Altri servizi", "tr": "Diğer hizmetler", "ja": "その他のサービス", "ko": "기타 서비스", "vi": "Dịch vụ khác", "fil": "Iba pang serbisyo", "fa": "سایر خدمات", "sw": "Huduma nyingine", "he": "שירותים אחרים"}'::jsonb, '✨', '{booking}', false, 99
from public.categories s where s.slug = 'services'
on conflict (slug) do nothing;
