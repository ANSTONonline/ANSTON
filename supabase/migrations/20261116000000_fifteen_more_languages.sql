-- =============================================================================
-- Anston: 15 more languages.
-- Hindi, Bengali, Indonesian, Portuguese, Russian, German, Italian, Turkish,
-- Japanese, Korean, Vietnamese, Filipino, Persian, Swahili and Hebrew.
-- Category names for these languages live in one `names` column ({"de": ...}),
-- so adding a language later doesn't need a new column.
-- Run after 20261111020000_more_languages.sql.
-- =============================================================================

alter type public.app_language add value if not exists 'hi';
alter type public.app_language add value if not exists 'bn';
alter type public.app_language add value if not exists 'id';
alter type public.app_language add value if not exists 'pt';
alter type public.app_language add value if not exists 'ru';
alter type public.app_language add value if not exists 'de';
alter type public.app_language add value if not exists 'it';
alter type public.app_language add value if not exists 'tr';
alter type public.app_language add value if not exists 'ja';
alter type public.app_language add value if not exists 'ko';
alter type public.app_language add value if not exists 'vi';
alter type public.app_language add value if not exists 'fil';
alter type public.app_language add value if not exists 'fa';
alter type public.app_language add value if not exists 'sw';
alter type public.app_language add value if not exists 'he';

alter table public.categories add column if not exists names jsonb not null default '{}'::jsonb;

update public.categories set names = names || '{"hi": "वाहन", "bn": "যানবাহন", "id": "Kendaraan", "pt": "Veículos", "ru": "Транспорт", "de": "Fahrzeuge", "it": "Veicoli", "tr": "Araçlar", "ja": "車・乗り物", "ko": "차량", "vi": "Xe cộ", "fil": "Sasakyan", "fa": "وسایل نقلیه", "sw": "Magari", "he": "רכבים"}'::jsonb where slug = 'vehicles';
update public.categories set names = names || '{"hi": "घर और अपार्टमेंट", "bn": "বাড়ি ও অ্যাপার্টমেন্ট", "id": "Rumah & Apartemen", "pt": "Casas e apartamentos", "ru": "Дома и квартиры", "de": "Häuser & Wohnungen", "it": "Case e appartamenti", "tr": "Ev ve daire", "ja": "住宅・マンション", "ko": "주택·아파트", "vi": "Nhà & căn hộ", "fil": "Bahay at apartment", "fa": "خانه و آپارتمان", "sw": "Nyumba na fleti", "he": "בתים ודירות"}'::jsonb where slug = 'real-estate';
update public.categories set names = names || '{"hi": "नावें", "bn": "নৌকা", "id": "Kapal", "pt": "Barcos", "ru": "Лодки", "de": "Boote", "it": "Barche", "tr": "Tekneler", "ja": "ボート", "ko": "보트", "vi": "Tàu thuyền", "fil": "Bangka", "fa": "قایق", "sw": "Boti", "he": "סירות"}'::jsonb where slug = 'boats';
update public.categories set names = names || '{"hi": "कपड़े", "bn": "পোশাক", "id": "Pakaian", "pt": "Roupas", "ru": "Одежда", "de": "Kleidung", "it": "Abbigliamento", "tr": "Giyim", "ja": "服", "ko": "의류", "vi": "Quần áo", "fil": "Damit", "fa": "پوشاک", "sw": "Nguo", "he": "בגדים"}'::jsonb where slug = 'clothes';
update public.categories set names = names || '{"hi": "गहने", "bn": "গহনা", "id": "Perhiasan", "pt": "Joias", "ru": "Украшения", "de": "Schmuck", "it": "Gioielli", "tr": "Takı", "ja": "ジュエリー", "ko": "주얼리", "vi": "Trang sức", "fil": "Alahas", "fa": "جواهرات", "sw": "Vito", "he": "תכשיטים"}'::jsonb where slug = 'jewelry';
update public.categories set names = names || '{"hi": "एक्सेसरीज़", "bn": "অ্যাক্সেসরিজ", "id": "Aksesori", "pt": "Acessórios", "ru": "Аксессуары", "de": "Accessoires", "it": "Accessori", "tr": "Aksesuarlar", "ja": "アクセサリー", "ko": "액세서리", "vi": "Phụ kiện", "fil": "Accessories", "fa": "اکسسوری", "sw": "Mapambo", "he": "אקססוריז"}'::jsonb where slug = 'accessories';
update public.categories set names = names || '{"hi": "फ़र्नीचर", "bn": "আসবাবপত্র", "id": "Perabot", "pt": "Móveis", "ru": "Мебель", "de": "Möbel", "it": "Mobili", "tr": "Mobilya", "ja": "家具", "ko": "가구", "vi": "Nội thất", "fil": "Muwebles", "fa": "مبلمان", "sw": "Samani", "he": "רהיטים"}'::jsonb where slug = 'furniture';
update public.categories set names = names || '{"hi": "उपकरण", "bn": "যন্ত্রপাতি", "id": "Peralatan", "pt": "Equipamentos", "ru": "Оборудование", "de": "Geräte", "it": "Attrezzature", "tr": "Ekipman", "ja": "機器・工具", "ko": "장비", "vi": "Thiết bị", "fil": "Kagamitan", "fa": "تجهیزات", "sw": "Vifaa", "he": "ציוד"}'::jsonb where slug = 'equipment';
update public.categories set names = names || '{"hi": "वाद्य यंत्र", "bn": "বাদ্যযন্ত্র", "id": "Alat musik", "pt": "Instrumentos musicais", "ru": "Музыкальные инструменты", "de": "Musikinstrumente", "it": "Strumenti musicali", "tr": "Müzik aletleri", "ja": "楽器", "ko": "악기", "vi": "Nhạc cụ", "fil": "Instrumentong pangmusika", "fa": "آلات موسیقی", "sw": "Ala za muziki", "he": "כלי נגינה"}'::jsonb where slug = 'instruments';
update public.categories set names = names || '{"hi": "खाना", "bn": "খাবার", "id": "Makanan", "pt": "Comida", "ru": "Еда", "de": "Essen", "it": "Cibo", "tr": "Yemek", "ja": "食品", "ko": "음식", "vi": "Đồ ăn", "fil": "Pagkain", "fa": "غذا", "sw": "Chakula", "he": "אוכל"}'::jsonb where slug = 'food';
update public.categories set names = names || '{"hi": "सेवाएँ", "bn": "সেবা", "id": "Jasa", "pt": "Serviços", "ru": "Услуги", "de": "Dienstleistungen", "it": "Servizi", "tr": "Hizmetler", "ja": "サービス", "ko": "서비스", "vi": "Dịch vụ", "fil": "Serbisyo", "fa": "خدمات", "sw": "Huduma", "he": "שירותים"}'::jsonb where slug = 'services';
update public.categories set names = names || '{"hi": "सफ़ाई", "bn": "পরিষ্কার-পরিচ্ছন্নতা", "id": "Kebersihan", "pt": "Limpeza", "ru": "Уборка", "de": "Reinigung", "it": "Pulizie", "tr": "Temizlik", "ja": "清掃", "ko": "청소", "vi": "Dọn dẹp", "fil": "Paglilinis", "fa": "نظافت", "sw": "Usafi", "he": "ניקיון"}'::jsonb where slug = 'cleaning';
update public.categories set names = names || '{"hi": "खेल की कक्षाएँ", "bn": "খেলাধুলার ক্লাস", "id": "Kelas olahraga", "pt": "Aulas de esportes", "ru": "Спортивные занятия", "de": "Sportkurse", "it": "Corsi sportivi", "tr": "Spor dersleri", "ja": "スポーツ教室", "ko": "스포츠 강습", "vi": "Lớp thể thao", "fil": "Klase sa sports", "fa": "کلاس‌های ورزشی", "sw": "Madarasa ya michezo", "he": "שיעורי ספורט"}'::jsonb where slug = 'sports-classes';
update public.categories set names = names || '{"hi": "संगीत की कक्षाएँ", "bn": "গানের ক্লাস", "id": "Les musik", "pt": "Aulas de música", "ru": "Уроки музыки", "de": "Musikunterricht", "it": "Lezioni di musica", "tr": "Müzik dersleri", "ja": "音楽レッスン", "ko": "음악 레슨", "vi": "Học nhạc", "fil": "Aralin sa musika", "fa": "آموزش موسیقی", "sw": "Masomo ya muziki", "he": "שיעורי מוזיקה"}'::jsonb where slug = 'music-lessons';
update public.categories set names = names || '{"hi": "ड्राइवर", "bn": "চালক", "id": "Sopir", "pt": "Motoristas", "ru": "Водители", "de": "Fahrer", "it": "Autisti", "tr": "Şoförler", "ja": "ドライバー", "ko": "운전기사", "vi": "Tài xế", "fil": "Drayber", "fa": "راننده", "sw": "Madereva", "he": "נהגים"}'::jsonb where slug = 'drivers';
update public.categories set names = names || '{"hi": "निजी जासूस", "bn": "বেসরকারি গোয়েন্দা", "id": "Detektif swasta", "pt": "Detetives particulares", "ru": "Частные детективы", "de": "Privatdetektive", "it": "Investigatori privati", "tr": "Özel dedektifler", "ja": "探偵", "ko": "사설탐정", "vi": "Thám tử tư", "fil": "Pribadong imbestigador", "fa": "کارآگاه خصوصی", "sw": "Wapelelezi binafsi", "he": "חוקרים פרטיים"}'::jsonb where slug = 'investigators';
