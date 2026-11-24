-- =============================================================================
-- Service categories: remove Private investigators; add Landscaping,
-- Childcare and Tutoring (with names in every language).
--
-- Any existing Private investigator listings move to "Other services" so
-- nothing breaks; the category is then switched off (kept for history).
-- =============================================================================

update public.listings
   set category_id = (select id from public.categories where slug = 'other-services')
 where category_id = (select id from public.categories where slug = 'investigators');

update public.categories set is_active = false where slug = 'investigators';

insert into public.categories (parent_id, slug, name_en, name_ar, name_es, name_zh, name_fr, name_ur, names, icon, allowed_modes, requires_license, sort_order)
select s.id, v.slug, v.name_en, v.name_ar, v.name_es, v.name_zh, v.name_fr, v.name_ur, v.names::jsonb, v.icon, '{booking}', v.requires_license, v.sort_order
from public.categories s,
     (values
       ('landscaping', 'Landscaping', 'تنسيق الحدائق', 'Jardinería y paisajismo', '园林绿化', 'Aménagement paysager', 'لینڈ اسکیپنگ',
        '{"hi": "लैंडस्केपिंग", "bn": "ল্যান্ডস্কেপিং", "id": "Pertamanan", "pt": "Paisagismo", "ru": "Ландшафтный дизайн", "de": "Garten- und Landschaftsbau", "it": "Giardinaggio", "tr": "Peyzaj", "ja": "造園", "ko": "조경", "vi": "Cảnh quan sân vườn", "fil": "Landscaping", "fa": "محوطه‌سازی", "sw": "Upambaji wa bustani", "he": "גינון"}',
        '🌿', false, 5),
       ('childcare', 'Childcare', 'رعاية الأطفال', 'Cuidado de niños', '儿童看护', 'Garde d''enfants', 'بچوں کی دیکھ بھال',
        '{"hi": "बच्चों की देखभाल", "bn": "শিশু পরিচর্যা", "id": "Pengasuhan anak", "pt": "Cuidado infantil", "ru": "Присмотр за детьми", "de": "Kinderbetreuung", "it": "Assistenza all''infanzia", "tr": "Çocuk bakımı", "ja": "保育・ベビーシッター", "ko": "아이 돌봄", "vi": "Trông trẻ", "fil": "Pag-aalaga ng bata", "fa": "مراقبت از کودک", "sw": "Malezi ya watoto", "he": "שמרטפות וטיפול בילדים"}',
        '👶', true, 6),
       ('tutoring', 'Tutoring', 'الدروس الخصوصية', 'Clases particulares', '家教辅导', 'Soutien scolaire', 'ٹیوشن',
        '{"hi": "ट्यूशन", "bn": "টিউশন", "id": "Les privat", "pt": "Aulas particulares", "ru": "Репетиторство", "de": "Nachhilfe", "it": "Ripetizioni", "tr": "Özel ders", "ja": "家庭教師", "ko": "과외", "vi": "Gia sư", "fil": "Tutoring", "fa": "تدریس خصوصی", "sw": "Masomo ya ziada", "he": "שיעורים פרטיים"}',
        '📚', false, 7)
     ) as v(slug, name_en, name_ar, name_es, name_zh, name_fr, name_ur, names, icon, requires_license, sort_order)
where s.slug = 'services'
on conflict (slug) do update
  set is_active = true, names = excluded.names, icon = excluded.icon, sort_order = excluded.sort_order;
