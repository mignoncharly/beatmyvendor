begin;

insert into public.categories (name, slug, description)
values ('Customer Support', 'customer-support', 'Helpdesk, ticketing, live chat, knowledge base, and customer service platforms.')
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true;

with category as (
  select id from public.categories where slug = 'customer-support'
)
insert into public.software_products (category_id, name, slug, website_url)
select category.id, product.name, product.slug, product.website_url
from category
cross join (values
  ('Zendesk', 'zendesk', 'https://www.zendesk.com'),
  ('Intercom', 'intercom', 'https://www.intercom.com'),
  ('Freshdesk', 'freshdesk', 'https://www.freshworks.com/freshdesk/'),
  ('Front', 'front', 'https://front.com'),
  ('Help Scout', 'help-scout', 'https://www.helpscout.com'),
  ('Zoho Desk', 'zoho-desk', 'https://www.zoho.com/desk/'),
  ('LiveAgent', 'liveagent', 'https://www.liveagent.com'),
  ('Gorgias', 'gorgias', 'https://www.gorgias.com'),
  ('Tidio', 'tidio', 'https://www.tidio.com'),
  ('HubSpot Service Hub', 'hubspot-service-hub', 'https://www.hubspot.com/products/service')
) as product(name, slug, website_url)
on conflict (slug) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  website_url = excluded.website_url,
  is_active = true;

-- Directed edges make `competes_with` queries cheap in either direction. In the
-- launch category every seeded product is a credible alternative to every other.
insert into public.software_competitors (software_product_id, competitor_product_id)
select source.id, competitor.id
from public.software_products source
join public.categories c on c.id = source.category_id and c.slug = 'customer-support'
join public.software_products competitor
  on competitor.category_id = source.category_id and competitor.id <> source.id
on conflict do nothing;

commit;
