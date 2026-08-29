begin;

create table public.offers (
  id uuid primary key default extensions.gen_random_uuid(),
  duel_id uuid not null references public.duels(id) on delete cascade,
  vendor_organization_id uuid not null references public.vendor_profiles(organization_id),
  vendor_product_id uuid not null references public.vendor_products(id),
  created_by uuid not null references public.users(id),
  plan_name text not null,
  annual_price numeric(14,2) not null check (annual_price > 0),
  monthly_equivalent numeric(14,2) generated always as (round(annual_price / 12, 2)) stored,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  seats_included integer not null check (seats_included > 0),
  implementation_fee numeric(14,2) not null default 0 check (implementation_fee >= 0),
  migration_fee numeric(14,2) not null default 0 check (migration_fee >= 0),
  contract_months integer not null check (contract_months > 0),
  price_lock_months integer not null check (price_lock_months >= 0),
  valid_until timestamptz not null,
  migration_included boolean not null,
  onboarding_included boolean not null,
  support_included text not null,
  included_features text[] not null default '{}',
  uncovered_features text[] not null default '{}',
  limitations text,
  commercial_comment text check (commercial_comment is null or length(commercial_comment) <= 1000),
  accuracy_confirmed_at timestamptz,
  status public.offer_status not null default 'draft',
  submitted_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (duel_id, vendor_organization_id),
  check (valid_until > created_at)
);

create table public.offer_features (
  offer_id uuid not null references public.offers(id) on delete cascade,
  duel_requirement_id uuid not null references public.duel_requirements(id) on delete cascade,
  coverage public.requirement_coverage not null,
  note text,
  primary key (offer_id, duel_requirement_id)
);

create table public.offer_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  snapshot jsonb not null,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  unique (offer_id, version_number)
);

create table public.selections (
  id uuid primary key default extensions.gen_random_uuid(),
  duel_id uuid not null unique references public.duels(id),
  offer_id uuid not null unique references public.offers(id),
  selected_by uuid not null references public.users(id),
  selected_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default extensions.gen_random_uuid(),
  selection_id uuid not null references public.selections(id),
  vendor_organization_id uuid not null references public.vendor_profiles(organization_id),
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_checkout_session_id text unique,
  provider_payment_intent_id text unique,
  idempotency_key text not null unique,
  amount integer not null check (amount > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  status public.payment_status not null default 'pending',
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.introductions (
  id uuid primary key default extensions.gen_random_uuid(),
  selection_id uuid not null unique references public.selections(id),
  payment_id uuid unique references public.payments(id),
  buyer_organization_id uuid not null references public.buyer_profiles(organization_id),
  vendor_organization_id uuid not null references public.vendor_profiles(organization_id),
  status public.introduction_status not null default 'awaiting_payment',
  introduced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deal_outcomes (
  id uuid primary key default extensions.gen_random_uuid(),
  introduction_id uuid not null unique references public.introductions(id),
  outcome public.deal_outcome_kind not null,
  final_annual_price numeric(14,2) check (final_annual_price is null or final_annual_price > 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  contract_months integer check (contract_months is null or contract_months > 0),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.public_wins (
  id uuid primary key default extensions.gen_random_uuid(),
  deal_outcome_id uuid not null unique references public.deal_outcomes(id),
  slug text not null unique,
  buyer_display_name text not null,
  vendor_display_name text,
  buyer_consented_at timestamptz not null,
  vendor_consented_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  channel public.notification_channel not null,
  template_key text not null,
  payload jsonb not null default '{}',
  status public.notification_status not null default 'pending',
  provider_message_id text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  check (user_id is not null or organization_id is not null)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  organization_id uuid references public.organizations(id) on delete set null,
  old_data jsonb,
  new_data jsonb,
  request_id text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default extensions.gen_random_uuid(),
  reporter_user_id uuid not null references public.users(id),
  duel_id uuid references public.duels(id),
  vendor_organization_id uuid references public.vendor_profiles(organization_id),
  reason text not null,
  details text,
  status public.report_status not null default 'open',
  assigned_to uuid references public.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (duel_id is not null or vendor_organization_id is not null)
);

create table public.admin_actions (
  id uuid primary key default extensions.gen_random_uuid(),
  admin_user_id uuid not null references public.users(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index offers_duel_status_idx on public.offers(duel_id, status, annual_price);
create index offers_vendor_status_idx on public.offers(vendor_organization_id, status, updated_at desc);
create index offer_versions_offer_idx on public.offer_versions(offer_id, version_number desc);
create index payments_vendor_created_idx on public.payments(vendor_organization_id, created_at desc);
create index introductions_buyer_idx on public.introductions(buyer_organization_id, created_at desc);
create index introductions_vendor_idx on public.introductions(vendor_organization_id, created_at desc);
create index notifications_delivery_idx on public.notifications(status, scheduled_at) where status = 'pending';
create index audit_logs_record_idx on public.audit_logs(table_name, record_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs(actor_user_id, created_at desc);
create index reports_queue_idx on public.reports(status, created_at) where status in ('open', 'investigating');

commit;
