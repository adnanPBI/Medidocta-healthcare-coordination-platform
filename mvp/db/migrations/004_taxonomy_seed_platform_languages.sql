begin;

-- Only the two platform locales explicitly required by the technical brief are seeded here.
-- Specialty and city catalogs remain empty until Medidocta approves the canonical source/list.
insert into taxonomy_languages(code, status, sort_order) values
  ('fr','ACTIVE',10),
  ('en','ACTIVE',20)
on conflict (code) do update set status = excluded.status, sort_order = excluded.sort_order;

insert into taxonomy_language_labels(language_code, locale, label) values
  ('fr','fr','Français'),
  ('fr','en','French'),
  ('en','fr','Anglais'),
  ('en','en','English')
on conflict (language_code, locale) do update set label = excluded.label;

commit;
