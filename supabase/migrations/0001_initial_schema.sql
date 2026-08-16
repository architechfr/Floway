create extension if not exists pgcrypto;
create extension if not exists postgis;

create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  name text not null,
  brand text,
  latitude double precision not null,
  longitude double precision not null,
  location geography(point, 4326) generated always as (st_setsrid(st_makepoint(longitude, latitude), 4326)::geography) stored,
  motorway text,
  direction text,
  services jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists stations_location_gix on public.stations using gist(location);

create table if not exists public.fuel_prices (
  station_id uuid not null references public.stations(id) on delete cascade,
  fuel_type text not null,
  price_eur_l numeric(6,3) not null,
  observed_at timestamptz not null,
  primary key (station_id, fuel_type)
);

create table if not exists public.station_events (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  anonymous_session_id uuid not null,
  event_type text not null check (event_type in ('enter_station','queue_start','queue_end','exit_station')),
  occurred_at timestamptz not null default now(),
  source text not null check (source in ('manual','inferred','operator')),
  confidence numeric(4,3) not null default 1 check (confidence >= 0 and confidence <= 1)
);
create index if not exists station_events_station_time_idx on public.station_events(station_id, occurred_at desc);

create table if not exists public.wait_observations (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  anonymous_session_id uuid,
  wait_minutes numeric(6,2) not null check (wait_minutes >= 0),
  observed_at timestamptz not null default now(),
  source text not null check (source in ('crowd','inferred','operator')),
  confidence numeric(4,3) not null default 1 check (confidence >= 0 and confidence <= 1)
);
create index if not exists wait_observations_recent_idx on public.wait_observations(station_id, observed_at desc);

create table if not exists public.station_wait_estimates (
  station_id uuid primary key references public.stations(id) on delete cascade,
  estimated_wait_minutes numeric(6,2),
  confidence numeric(4,3) not null default 0,
  sample_count integer not null default 0,
  calculated_at timestamptz not null default now()
);

alter table public.stations enable row level security;
alter table public.fuel_prices enable row level security;
alter table public.station_events enable row level security;
alter table public.wait_observations enable row level security;
alter table public.station_wait_estimates enable row level security;

create policy "public stations read" on public.stations for select using (true);
create policy "public fuel prices read" on public.fuel_prices for select using (true);
create policy "public estimates read" on public.station_wait_estimates for select using (true);
