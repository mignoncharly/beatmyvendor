begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create type public.system_role as enum ('user', 'admin');
create type public.organization_kind as enum ('buyer', 'vendor');
create type public.membership_role as enum ('owner', 'admin', 'member');
create type public.vendor_approval_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected');
create type public.duel_status as enum (
  'draft', 'pending_verification', 'open', 'reviewing', 'selected',
  'introduced', 'converted', 'closed', 'expired', 'rejected'
);
create type public.offer_status as enum ('draft', 'submitted', 'withdrawn', 'selected', 'not_selected', 'expired');
create type public.introduction_status as enum ('awaiting_payment', 'paid', 'introduced', 'refunded', 'cancelled');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'cancelled');
create type public.billing_frequency as enum ('monthly', 'annual');
create type public.buyer_intent as enum ('checking_market', 'good_offer', 'actively_looking', 'must_switch_before_renewal');
create type public.requirement_kind as enum ('feature', 'integration');
create type public.requirement_coverage as enum ('included', 'partial', 'not_included');
create type public.notification_channel as enum ('email', 'in_app');
create type public.notification_status as enum ('pending', 'sent', 'failed', 'cancelled');
create type public.report_status as enum ('open', 'investigating', 'resolved', 'dismissed');
create type public.deal_outcome_kind as enum ('still_discussing', 'selected_vendor', 'another_vendor', 'stayed_current', 'no_decision');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email extensions.citext not null,
  display_name text,
  system_role public.system_role not null default 'user',
  locale text not null default 'en' check (locale in ('en', 'fr', 'de')),
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

create table public.organizations (
  id uuid primary key default extensions.gen_random_uuid(),
  kind public.organization_kind not null,
  name text not null check (length(name) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  website_url text,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  company_size text,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.membership_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.buyer_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  business_email_status public.verification_status not null default 'unverified',
  business_email_verified_at timestamptz,
  contact_name text,
  contact_email extensions.citext,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vendor_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  approval_status public.vendor_approval_status not null default 'pending',
  approved_at timestamptz,
  approved_by uuid references public.users(id),
  description text,
  logo_path text,
  minimum_customer_size integer check (minimum_customer_size is null or minimum_customer_size >= 1),
  maximum_customer_size integer check (maximum_customer_size is null or maximum_customer_size >= minimum_customer_size),
  countries_served text[] not null default '{}',
  currencies text[] not null default '{}',
  migration_support boolean not null default false,
  contact_name text,
  contact_email extensions.citext,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.software_products (
  id uuid primary key default extensions.gen_random_uuid(),
  category_id uuid not null references public.categories(id),
  name text not null,
  slug text not null unique,
  website_url text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.software_competitors (
  software_product_id uuid not null references public.software_products(id) on delete cascade,
  competitor_product_id uuid not null references public.software_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (software_product_id, competitor_product_id),
  check (software_product_id <> competitor_product_id)
);

create table public.vendor_products (
  id uuid primary key default extensions.gen_random_uuid(),
  vendor_organization_id uuid not null references public.vendor_profiles(organization_id) on delete cascade,
  software_product_id uuid not null references public.software_products(id),
  product_name text not null,
  product_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (vendor_organization_id, software_product_id)
);

create table public.vendor_product_replacements (
  vendor_product_id uuid not null references public.vendor_products(id) on delete cascade,
  replaces_software_product_id uuid not null references public.software_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (vendor_product_id, replaces_software_product_id)
);

create table public.duels (
  id uuid primary key default extensions.gen_random_uuid(),
  public_id bigint generated always as identity unique,
  slug text unique,
  buyer_organization_id uuid not null references public.buyer_profiles(organization_id),
  created_by uuid not null references public.users(id),
  category_id uuid not null references public.categories(id),
  current_software_product_id uuid not null references public.software_products(id),
  current_plan text,
  current_price numeric(14,2) not null check (current_price > 0),
  billing_frequency public.billing_frequency not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  annual_spend numeric(14,2) generated always as (
    case when billing_frequency = 'monthly' then current_price * 12 else current_price end
  ) stored,
  seats integer not null check (seats > 0),
  approximate_ticket_volume integer check (approximate_ticket_volume is null or approximate_ticket_volume >= 0),
  current_fees numeric(14,2) not null default 0 check (current_fees >= 0),
  renewal_date date,
  contract_months integer check (contract_months is null or contract_months > 0),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  company_size text not null,
  switching_timeline text,
  buyer_intent public.buyer_intent not null,
  private_comment text,
  status public.duel_status not null default 'draft',
  submission_deadline timestamptz,
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (submission_deadline is null or submission_deadline > created_at)
);

create table public.duel_requirements (
  id uuid primary key default extensions.gen_random_uuid(),
  duel_id uuid not null references public.duels(id) on delete cascade,
  kind public.requirement_kind not null,
  label text not null check (length(label) between 1 and 120),
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (duel_id, kind, label)
);

create table public.duel_verifications (
  id uuid primary key default extensions.gen_random_uuid(),
  duel_id uuid not null references public.duels(id) on delete cascade,
  verification_type text not null check (verification_type in ('business_email', 'spend')),
  status public.verification_status not null default 'pending',
  verified_fields text[] not null default '{}',
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (duel_id, verification_type)
);

create table public.duel_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  duel_id uuid not null references public.duels(id) on delete cascade,
  uploaded_by uuid not null references public.users(id),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  retention_until timestamptz not null default (now() + interval '30 days'),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index organization_members_user_idx on public.organization_members(user_id, organization_id);
create index organizations_kind_idx on public.organizations(kind) where deleted_at is null;
create index software_products_category_idx on public.software_products(category_id) where is_active;
create index competitor_reverse_idx on public.software_competitors(competitor_product_id, software_product_id);
create index vendor_replacements_software_idx on public.vendor_product_replacements(replaces_software_product_id, vendor_product_id);
create index duels_buyer_created_idx on public.duels(buyer_organization_id, created_at desc);
create index duels_marketplace_idx on public.duels(status, category_id, current_software_product_id, country_code, submission_deadline)
  where status = 'open';
create index duels_renewal_idx on public.duels(renewal_date) where status = 'open';
create index duel_requirements_duel_idx on public.duel_requirements(duel_id);
create index duel_verifications_queue_idx on public.duel_verifications(status, created_at) where status = 'pending';
create index duel_documents_retention_idx on public.duel_documents(retention_until) where deleted_at is null;

commit;
