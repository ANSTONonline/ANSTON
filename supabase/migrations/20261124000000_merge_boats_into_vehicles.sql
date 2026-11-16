-- Boats are vehicles: move any boat listings into Vehicles and remove the
-- separate Boats category.
update public.listings
   set category_id = (select id from public.categories where slug = 'vehicles')
 where category_id = (select id from public.categories where slug = 'boats');

delete from public.categories where slug = 'boats';
