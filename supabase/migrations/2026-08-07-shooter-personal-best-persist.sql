-- Turns the PB "override" from a live formula (best = greatest(computed max,
-- override), recomputed on every read) into a persisted, ratcheting record.
--
-- The problem with the live-formula version: if a shooter set a new PB this
-- season and an admin later ran "Reset Scores" on that season (which deletes
-- score rows), the computed max would drop back out from under them and
-- `best` would revert to the old admin-entered override - silently losing a
-- real, already-achieved result.
--
-- Now `personal_best` (renamed from pb_override) is updated in the database
-- the moment a new high score is actually submitted, via triggers on
-- `match`/`score` - not recomputed live. A season reset only deletes score
-- rows; it never touches `shooter`, so the persisted value survives. The
-- admin edit still works exactly as before: it's a one-off correction/seed
-- for pre-site history, not a standing formula.

alter table public.shooter rename column pb_override to personal_best;

-- ----------------------------------------------------------------------------
-- Backfill: bake every currently-submitted match's result into personal_best
-- once, so nobody's displayed PB regresses when this migration runs.
-- ----------------------------------------------------------------------------
update public.shooter sh
   set personal_best = pb.computed_max
  from (
      select sc.shooter_id, max(sc.total) as computed_max
      from public.score sc
      join public.match m on m.id = sc.match_id
      where m.submitted
      group by sc.shooter_id
  ) pb
 where pb.shooter_id = sh.id
   and pb.computed_max > coalesce(sh.personal_best, 0);

-- ----------------------------------------------------------------------------
-- Admin-only guard (updated for the rename), with an escape hatch for the
-- system ratchet triggers below - a captain submitting a match still isn't
-- allowed to hand-edit personal_best, but the trigger-driven update that
-- happens as a side effect of their submission must go through.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_shooter_pb_override_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if NEW.personal_best is distinct from OLD.personal_best
       and not public.is_admin()
       and coalesce(current_setting('nadarl.pb_ratchet', true), '') <> 'on'
    then
        raise exception 'Only admins can edit a shooter''s personal best.';
    end if;
    return NEW;
end;
$$;

-- ----------------------------------------------------------------------------
-- Ratchet triggers: personal_best only ever moves up, and only in response
-- to an actually-submitted match. Two triggers cover both write orders -
-- live play (scores autosaved throughout editing, match submitted last) and
-- a JSON backup restore (match inserted already-submitted, its scores
-- inserted afterwards).
-- ----------------------------------------------------------------------------
create or replace function public.ratchet_pb_from_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if not NEW.submitted then
        return NEW;
    end if;
    if TG_OP = 'UPDATE' and OLD.submitted then
        return NEW; -- already ratcheted when it first became submitted
    end if;

    perform set_config('nadarl.pb_ratchet', 'on', true);
    update public.shooter sh
       set personal_best = sc.total
      from public.score sc
     where sc.match_id = NEW.id
       and sc.shooter_id = sh.id
       and sc.total > coalesce(sh.personal_best, 0);
    perform set_config('nadarl.pb_ratchet', 'off', true);

    return NEW;
end;
$$;

drop trigger if exists match_submitted_ratchet_pb on public.match;
create trigger match_submitted_ratchet_pb
    after insert or update of submitted on public.match
    for each row
    execute function public.ratchet_pb_from_match();

create or replace function public.ratchet_pb_from_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if NEW.total <= coalesce((select personal_best from public.shooter where id = NEW.shooter_id), 0) then
        return NEW;
    end if;
    if not exists (select 1 from public.match m where m.id = NEW.match_id and m.submitted) then
        return NEW;
    end if;

    perform set_config('nadarl.pb_ratchet', 'on', true);
    update public.shooter set personal_best = NEW.total where id = NEW.shooter_id;
    perform set_config('nadarl.pb_ratchet', 'off', true);

    return NEW;
end;
$$;

drop trigger if exists score_ratchet_pb on public.score;
create trigger score_ratchet_pb
    after insert or update of total on public.score
    for each row
    execute function public.ratchet_pb_from_score();

-- ----------------------------------------------------------------------------
-- shooter_stats_for_season - `best` reads the persisted value directly, with
-- the live computed max kept only as a defensive fallback (belt and braces
-- in case a future write path ever misses both triggers above).
-- ----------------------------------------------------------------------------
drop function if exists public.shooter_stats_for_season(uuid);

create function public.shooter_stats_for_season(p_season_id uuid)
returns table (
    shooter_id           uuid,
    shooter_no           integer,
    name                 text,
    role                 text,
    team_id              uuid,
    team_name            text,
    team_slug            text,
    team_venue           text,
    matches_played       bigint,
    best                 integer,
    pb_override          integer,
    season_best          integer,
    tens                 bigint,
    average              numeric,
    handicap             numeric,
    total_matches_played bigint
)
language sql
stable
security definer
set search_path = public
as $$
    select
        sh.id            as shooter_id,
        sh.shooter_no,
        sh.name,
        sh.role,
        sh.team_id,
        t.name           as team_name,
        t.slug           as team_slug,
        t.venue          as team_venue,
        coalesce(count(sc.id) filter (
            where m.submitted and m.season_id = p_season_id
        ), 0)                                                                          as matches_played,
        greatest(
            coalesce(sh.personal_best, 0),
            coalesce(max(sc.total) filter (where m.submitted), 0)
        )                                                                              as best,
        sh.personal_best as pb_override,
        coalesce(max(sc.total) filter (
            where m.submitted and m.season_id = p_season_id
        ), 0)                                                                          as season_best,
        coalesce(sum(sc.tens) filter (
            where m.submitted and m.season_id = p_season_id
        ), 0)                                                                          as tens,
        coalesce(round(avg(sc.total) filter (
            where m.submitted and m.season_id = p_season_id
        ), 1), 0)                                                                      as average,
        public.shooter_handicap(sh.id, null::date)                                     as handicap,
        coalesce(count(sc.id) filter (where m.submitted), 0)                           as total_matches_played
    from public.shooter sh
    join public.team   t   on t.id  = sh.team_id
    left join public.score sc on sc.shooter_id = sh.id
    left join public.match  m  on m.id = sc.match_id
    group by sh.id, sh.shooter_no, sh.name, sh.role, sh.team_id, t.name, t.slug, t.venue
$$;

grant execute on function public.shooter_stats_for_season(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- shooter_stats view - same treatment.
-- ----------------------------------------------------------------------------
create or replace view public.shooter_stats with (security_invoker = true) as
with cur as (
    select id as season_id
    from public.season
    order by
        case when start_date <= current_date and end_date >= current_date then 0 else 1 end,
        case when is_current then 0 else 1 end,
        start_date desc nulls last
    limit 1
)
select
    sh.id            as shooter_id,
    sh.shooter_no,
    sh.name,
    sh.role,
    sh.team_id,
    t.name           as team_name,
    t.slug           as team_slug,
    t.venue          as team_venue,
    coalesce(count(sc.id) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 0)                                                                          as matches_played,
    greatest(
        coalesce(sh.personal_best, 0),
        coalesce(max(sc.total) filter (where m.submitted), 0)
    )                                                                              as best,
    coalesce(max(sc.total) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 0)                                                                          as season_best,
    coalesce(sum(sc.tens) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 0)                                                                          as tens,
    coalesce(round(avg(sc.total) filter (
        where m.submitted and m.season_id = cur.season_id
    ), 1), 0)                                                                      as average,
    public.shooter_handicap(sh.id, null::date)                                     as handicap,
    coalesce(count(sc.id) filter (where m.submitted), 0)                           as total_matches_played,
    sh.personal_best as pb_override
from public.shooter sh
join public.team   t   on t.id  = sh.team_id
cross join cur
left join public.score sc on sc.shooter_id = sh.id
left join public.match  m  on m.id = sc.match_id
group by
    sh.id, sh.shooter_no, sh.name, sh.role, sh.team_id,
    t.name, t.slug, t.venue, cur.season_id, sh.personal_best;
