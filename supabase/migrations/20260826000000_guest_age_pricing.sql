alter table public.weddings
  add column child_price numeric(12, 2) not null default 0,
  add constraint weddings_child_price_nonnegative check (child_price >= 0);

alter table public.registrations
  add column adult_count integer not null default 0,
  add column child_count integer not null default 0,
  add column young_child_count integer not null default 0;

-- Existing registrations did not distinguish age groups. Treat every existing
-- attendee as an adult so pending, confirmed and cancelled rows are preserved.
update public.registrations
set adult_count = guest_count,
    child_count = 0,
    young_child_count = 0;

alter table public.registrations
  add constraint registrations_adult_count_nonnegative check (adult_count >= 0),
  add constraint registrations_child_count_nonnegative check (child_count >= 0),
  add constraint registrations_young_child_count_nonnegative check (young_child_count >= 0),
  add constraint registrations_age_counts_match_guest_count
    check (adult_count + child_count + young_child_count = guest_count);

alter table public.guests
  drop constraint guests_age_category_valid;

-- Historic guests only supported adult/child and could be uncategorized.
update public.guests
set age_category = 'adult'
where age_category is null;

alter table public.guests
  alter column age_category set not null,
  add constraint guests_age_category_valid
    check (age_category in ('adult', 'child', 'young_child'));
