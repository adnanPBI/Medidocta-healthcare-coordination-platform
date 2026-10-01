begin;

create table if not exists taxonomy_languages (
  code text primary key,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  sort_order integer not null default 1000,
  created_at timestamptz not null default now()
);

create table if not exists taxonomy_language_labels (
  language_code text not null references taxonomy_languages(code) on delete cascade,
  locale text not null check (locale in ('fr','en')),
  label text not null,
  primary key (language_code, locale)
);

create table if not exists taxonomy_specialties (
  code text primary key,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  sort_order integer not null default 1000,
  created_at timestamptz not null default now()
);

create table if not exists taxonomy_specialty_labels (
  specialty_code text not null references taxonomy_specialties(code) on delete cascade,
  locale text not null check (locale in ('fr','en')),
  label text not null,
  primary key (specialty_code, locale)
);

create table if not exists taxonomy_cities (
  code text primary key,
  country_code char(2) not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  sort_order integer not null default 1000,
  created_at timestamptz not null default now()
);

create table if not exists taxonomy_city_labels (
  city_code text not null references taxonomy_cities(code) on delete cascade,
  locale text not null check (locale in ('fr','en')),
  label text not null,
  primary key (city_code, locale)
);

alter table doctor_profiles
  add column if not exists display_name text,
  add column if not exists public_bio text,
  add column if not exists profile_version integer not null default 1 check (profile_version > 0);

alter table healthcare_facilities
  add column if not exists display_name text,
  add column if not exists public_summary text,
  add column if not exists city_code text references taxonomy_cities(code),
  add column if not exists profile_version integer not null default 1 check (profile_version > 0);

create table if not exists doctor_specialties (
  doctor_id uuid not null references doctor_profiles(id) on delete cascade,
  specialty_code text not null references taxonomy_specialties(code),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (doctor_id, specialty_code)
);

create unique index if not exists ux_doctor_primary_specialty
  on doctor_specialties(doctor_id)
  where is_primary;

create table if not exists doctor_languages (
  doctor_id uuid not null references doctor_profiles(id) on delete cascade,
  language_code text not null references taxonomy_languages(code),
  created_at timestamptz not null default now(),
  primary key (doctor_id, language_code)
);

create index if not exists idx_facility_city on healthcare_facilities(city_code);
create index if not exists idx_doctor_specialty_code on doctor_specialties(specialty_code);
create index if not exists idx_doctor_language_code on doctor_languages(language_code);

commit;
