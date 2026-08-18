// =====================================================================
//  NADARL data-access layer
//  Thin async wrappers over the Supabase client (window.db).
//  Every function returns a Promise that resolves to plain data,
//  shaped to match what the page renderers expect.
// =====================================================================

const NADARL = (function () {
    const db = () => window.db;

    const ROLE_ORDER = { captain: 0, secretary: 1, treasurer: 2 };

    // Shooters with a role (captain/secretary/treasurer) always come first,
    // in that order. Everyone else is sorted by average descending, with
    // ties (including no average yet, i.e. 0) falling back to name.
    function sortByRoleThenName(rows) {
        return rows.sort((a, b) => {
            const ra = a.role ? ROLE_ORDER[a.role] : 3;
            const rb = b.role ? ROLE_ORDER[b.role] : 3;
            if (ra !== rb) return ra - rb;
            if (ra === 3) {
                return Number(b.average) - Number(a.average) || String(a.name).localeCompare(String(b.name));
            }
            return String(a.name).localeCompare(String(b.name));
        });
    }

    async function fetchTeams() {
        const { data, error } = await db().from('team')
            .select('id,name,venue,slug')
            .order('name');
        if (error) { console.error('fetchTeams', error); return []; }
        return data;
    }

    async function fetchTeamByName(name) {
        const { data, error } = await db().from('team')
            .select('*')
            .eq('name', name)
            .maybeSingle();
        if (error) { console.error('fetchTeamByName', error); return null; }
        return data;
    }

    // Map of team name -> slug, for resolving logo image paths.
    async function fetchTeamSlugMap() {
        const teams = await fetchTeams();
        const map = {};
        teams.forEach(t => { if (t.slug) map[t.name] = t.slug; });
        return map;
    }

    // Shooter stats for one team (sorted captain > secretary > treasurer > name).
    async function fetchTeamShootersStats(teamId) {
        const { data, error } = await db().from('shooter_stats')
            .select('*')
            .eq('team_id', teamId);
        if (error) { console.error('fetchTeamShootersStats', error); return []; }
        return sortByRoleThenName(data);
    }

    // All shooters across the league, sorted by average desc.
    async function fetchAllShooterStats() {
        const { data, error } = await db().from('shooter_stats')
            .select('*');
        if (error) { console.error('fetchAllShooterStats', error); return []; }
        return data.sort((a, b) => Number(b.average) - Number(a.average));
    }

    // Fixtures shaped like the old hardcoded objects: { date, homeTeam, awayTeam, venue, isBye }
    // seasonId is optional - omit to fetch fixtures across every season.
    async function fetchFixtures(seasonId) {
        let query = db().from('fixture_list').select('*').order('date');
        if (seasonId) query = query.eq('season_id', seasonId);
        const { data, error } = await query;
        if (error) { console.error('fetchFixtures', error); return []; }
        return data.map(f => ({
            id: f.id,
            date: f.date,
            homeTeam: f.home_team,
            awayTeam: f.away_team,        // null for BYE
            venue: f.venue,
            isBye: f.is_bye,
            half: f.half,                 // 1 = first half, 2 = second half (handicaps)
            seasonId: f.season_id
        }));
    }

    // Today's date as 'YYYY-MM-DD'.
    function todayDate() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // The season whose start_date/end_date span covers today, falling back to
    // the is_current flag, then the most recently-started season, if none do
    // (e.g. between seasons, or a future season was created ahead of time).
    function pickCurrentSeason(seasons) {
        if (!seasons.length) return null;
        const today = todayDate();
        const byDate = seasons.find(s => s.start_date && s.end_date && s.start_date <= today && today <= s.end_date);
        if (byDate) return byDate;
        const byFlag = seasons.find(s => s.is_current);
        if (byFlag) return byFlag;
        return seasons[seasons.length - 1];
    }

    // All scorecard rows for a match, resolved by date + the two team names.
    async function fetchMatchScorecard(date, homeName, awayName) {
        const { data, error } = await db().from('match_scorecard')
            .select('*')
            .eq('date', date)
            .in('team_name', [homeName, awayName]);
        if (error) { console.error('fetchMatchScorecard', error); return []; }
        return data;
    }

    // A single match record (id + team ids) resolved by date + team names.
    async function fetchMatch(date, homeName, awayName) {
        const { data, error } = await db().from('fixture_list')
            .select('id,date,home_team_id,away_team_id,home_team,away_team,half')
            .eq('date', date)
            .eq('home_team', homeName)
            .eq('away_team', awayName)
            .maybeSingle();
        if (error) { console.error('fetchMatch', error); return null; }
        return data;
    }

    // All shooters for a team (for the score-entry dropdowns).
    async function fetchShootersForTeam(teamId) {
        const { data, error } = await db().from('shooter')
            .select('id,shooter_no,name,role')
            .eq('team_id', teamId)
            .order('name');
        if (error) { console.error('fetchShootersForTeam', error); return []; }
        return data;
    }

    // Replace all scores for one team in a match with the given rows.
    async function saveTeamScores(matchId, teamId, rows) {
        const { error: derr } = await db().from('score')
            .delete()
            .eq('match_id', matchId)
            .eq('team_id', teamId);
        if (derr) { console.error('saveTeamScores delete', derr); return { ok: false, error: derr.message }; }
        if (!rows.length) return { ok: true };
        const payload = rows.map(r => ({
            match_id: matchId,
            shooter_id: r.shooter_id,
            team_id: teamId,
            shots: r.shots,
            total: r.total,
            tens: r.tens
        }));
        const { error: ierr } = await db().from('score').insert(payload);
        if (ierr) { console.error('saveTeamScores insert', ierr); return { ok: false, error: ierr.message }; }
        return { ok: true };
    }

    // Live updates: fire onChange whenever scores for a match change.
    function subscribeMatchScores(matchId, onChange) {
        if (!db || !db().channel) return null;
        return db().channel('match-scores-' + matchId)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'score', filter: 'match_id=eq.' + matchId },
                onChange)
            .subscribe();
    }

    function unsubscribeChannel(channel) {
        if (channel && db && db().removeChannel) {
            db().removeChannel(channel);
        }
    }

    // Confirmation / submission status for a match.
    async function fetchMatchStatus(matchId) {
        const { data, error } = await db().from('match')
            .select('id,home_confirmed,away_confirmed,submitted')
            .eq('id', matchId)
            .maybeSingle();
        if (error) { console.error('fetchMatchStatus', error); return null; }
        return data;
    }

    // Confirm one side of a match (security definer checks permissions).
    async function confirmMatchSide(matchId, side) {
        const { data, error } = await db().rpc('confirm_match_side', { p_match: matchId, p_side: side });
        if (error) { console.error('confirmMatchSide', error); return { ok: false, error: error.message }; }
        return { ok: !!data };
    }

    // Unconfirm one side of a match.
    async function unconfirmMatchSide(matchId, side) {
        const { data, error } = await db().rpc('unconfirm_match_side', { p_match: matchId, p_side: side });
        if (error) { console.error('unconfirmMatchSide', error); return { ok: false, error: error.message }; }
        return { ok: !!data };
    }

    // Reset both confirmations (e.g. after scores are edited).
    async function resetMatchConfirm(matchId) {
        const { data, error } = await db().rpc('reset_match_confirm', { p_match: matchId });
        if (error) { console.error('resetMatchConfirm', error); return { ok: false, error: error.message }; }
        return { ok: !!data };
    }

    // Submit (commit) a match once both sides confirmed.
    async function submitMatch(matchId) {
        const { data, error } = await db().rpc('submit_match', { p_match: matchId });
        if (error) { console.error('submitMatch', error); return { ok: false, error: error.message }; }
        return { ok: !!data };
    }

    // Live updates for confirmation / submission state.
    function subscribeMatch(matchId, onChange) {
        if (!db || !db().channel) return null;
        return db().channel('match-status-' + matchId)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'match', filter: 'id=eq.' + matchId },
                onChange)
            .subscribe();
    }

    // Profile of the currently signed-in user (or null if not signed in).
    async function fetchMyProfile() {
        const { data: { user } } = await db().auth.getUser();
        if (!user) return null;
        const { data, error } = await db().from('user_profile')
            .select('id,email,role,team_id')
            .eq('id', user.id)
            .maybeSingle();
        if (error) { console.error('fetchMyProfile', error); return null; }
        return data;
    }

    // All user profiles (admin only - RLS enforces write; reads are public).
    async function fetchProfiles() {
        const { data, error } = await db().from('user_profile')
            .select('id,email,role,team_id')
            .order('email');
        if (error) { console.error('fetchProfiles', error); return []; }
        return data;
    }

    // Update a profile's role and/or team. Returns { ok, error, count }.
    async function updateProfile(id, { role, team_id }) {
        const patch = {};
        if (role !== undefined) patch.role = role;
        if (team_id !== undefined) patch.team_id = team_id;
        const { data, error } = await db().from('user_profile')
            .update(patch)
            .eq('id', id)
            .select('id');
        if (error) { console.error('updateProfile', error); return { ok: false, error: error.message }; }
        return { ok: true, count: data ? data.length : 0 };
    }

    // Add a shooter to a team (captain of that team or admin). RLS enforces.
    function normalizeName(name) {
        return String(name).trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }

    async function addShooter(teamId, { name, role }) {
        const { data, error } = await db().from('shooter')
            .insert({
                team_id: teamId,
                name: normalizeName(name),
                role: role || null
            })
            .select('id,shooter_no,name,role,team_id')
            .single();
        if (error) { console.error('addShooter', error); return { ok: false, error: error.message }; }
        return { ok: true, shooter: data };
    }

    // Update a shooter's name/role (captain of that team or admin). RLS enforces.
    async function updateShooter(shooterId, { name, role }) {
        const patch = { name: normalizeName(name), role: role || null };
        const { data, error } = await db().from('shooter')
            .update(patch)
            .eq('id', shooterId)
            .select('id,shooter_no,name,role,team_id');
        if (error) { console.error('updateShooter', error); return { ok: false, error: error.message }; }
        return { ok: true, shooter: data && data[0] };
    }

    // All shooters' stats for one specific season (League Table season switcher).
    // Ties (including shooters with no average yet, i.e. 0) fall back to
    // alphabetical order by name instead of whatever order the query returned.
    async function fetchShooterStatsForSeason(seasonId) {
        const { data, error } = await db().rpc('shooter_stats_for_season', { p_season_id: seasonId });
        if (error) { console.error('fetchShooterStatsForSeason', error); return []; }
        return data.sort((a, b) =>
            Number(b.average) - Number(a.average) ||
            String(a.name).localeCompare(String(b.name))
        );
    }

    // One team's shooter stats for a specific season (Team page season switcher).
    // Default order matches fetchShooterStatsForSeason (average desc, then
    // name) - the team page's sortable headers take it from there.
    async function fetchTeamShootersStatsForSeason(teamId, seasonId) {
        const stats = await fetchShooterStatsForSeason(seasonId);
        return stats.filter(s => s.team_id === teamId);
    }

    // A single shooter's basic info + team, for the Shooter Profile page header.
    async function fetchShooterById(shooterId) {
        const { data, error } = await db().from('shooter')
            .select('id,shooter_no,name,role,team_id,team:team_id(name,slug,venue)')
            .eq('id', shooterId)
            .maybeSingle();
        if (error) { console.error('fetchShooterById', error); return null; }
        return data;
    }

    // One shooter's per-match score log for a specific season (submitted
    // matches only), oldest first - the Shooter Profile page's results table.
    async function fetchShooterMatchHistory(shooterId, seasonId) {
        const { data, error } = await db().from('shooter_match_history')
            .select('*')
            .eq('shooter_id', shooterId)
            .eq('season_id', seasonId)
            .eq('submitted', true)
            .order('date');
        if (error) { console.error('fetchShooterMatchHistory', error); return []; }
        return data;
    }

    // One shooter's per-match score log across every season (submitted
    // matches only), oldest first - the Shooter Profile page's all-time
    // shot pattern chart.
    async function fetchShooterMatchHistoryAllTime(shooterId) {
        const { data, error } = await db().from('shooter_match_history')
            .select('*')
            .eq('shooter_id', shooterId)
            .eq('submitted', true)
            .order('date');
        if (error) { console.error('fetchShooterMatchHistoryAllTime', error); return []; }
        return data;
    }

    // Team-level W/D/L standings for a season, split by half (1 = no
    // handicap, 2 = handicap) and league ('A' = top 5, 'B' = ranked 5th-7th).
    // Returns one row per team per half/league combo (League Table's four
    // team-standings tables).
    async function fetchTeamStandingsForSeason(seasonId) {
        const { data, error } = await db().rpc('team_league_standings', { p_season_id: seasonId });
        if (error) { console.error('fetchTeamStandingsForSeason', error); return []; }
        return data;
    }

    // All seasons, in their manually-set display order (see reorderSeasons) -
    // this is what lets historical seasons be backfilled "before" the
    // current one, or a misordered season be fixed, instead of being stuck
    // sorting alphabetically by name.
    async function fetchSeasons() {
        const { data, error } = await db().from('season')
            .select('id,name,start_date,end_date,is_current,sort_order')
            .order('sort_order', { ascending: true, nullsFirst: false })
            .order('name');
        if (error) { console.error('fetchSeasons', error); return []; }
        return data;
    }

    // Persist a new display order for seasons. orderedIds is the full list
    // of season ids in the desired order. Admin only - RLS enforces.
    async function reorderSeasons(orderedIds) {
        const results = await Promise.all(orderedIds.map((id, index) =>
            db().from('season').update({ sort_order: index }).eq('id', id)
        ));
        const failed = results.find(r => r.error);
        if (failed) { console.error('reorderSeasons', failed.error); return { ok: false, error: failed.error.message }; }
        return { ok: true };
    }

    // Whether a season already has any fixtures saved.
    async function seasonHasMatches(seasonId) {
        const { count, error } = await db().from('match')
            .select('id', { count: 'exact', head: true })
            .eq('season_id', seasonId);
        if (error) { console.error('seasonHasMatches', error); return false; }
        return (count || 0) > 0;
    }

    // Which entry types already occupy one season+date - for the cross-type
    // conflict warning shown when adding a match, competition, event or
    // exception (see admin-fixture-editor.js, admin-competitions.js,
    // admin-events.js, admin-exceptions.js). Same-type occupancy (e.g.
    // several matches on one day) is normal, so callers ignore their own
    // type in the result.
    async function fetchDateOccupants(seasonId, date) {
        const [matches, exclusions, competitions, events] = await Promise.all([
            db().from('match').select('id', { count: 'exact', head: true }).eq('season_id', seasonId).eq('match_date', date),
            db().from('exclusion').select('id', { count: 'exact', head: true }).eq('season_id', seasonId).eq('match_date', date),
            db().from('competition').select('id', { count: 'exact', head: true }).eq('season_id', seasonId).eq('event_date', date),
            db().from('event').select('id', { count: 'exact', head: true }).eq('season_id', seasonId).eq('event_date', date)
        ]);
        return {
            match: (matches.count || 0) > 0,
            exception: (exclusions.count || 0) > 0,
            competition: (competitions.count || 0) > 0,
            event: (events.count || 0) > 0
        };
    }

    // Delete a season entirely: its matches (scores cascade-delete), its
    // exclusions (cascade via FK), then the season row itself. Admin only.
    async function deleteSeason(seasonId) {
        const cleared = await clearMatches(seasonId);
        if (!cleared.ok) return cleared;
        const { error } = await db().from('season').delete().eq('id', seasonId);
        if (error) { console.error('deleteSeason', error); return { ok: false, error: error.message }; }
        return { ok: true };
    }

    // Delete every match for one season (scores cascade-delete). Admin only - RLS enforces.
    async function clearMatches(seasonId) {
        const { data, error } = await db().from('match')
            .delete()
            .eq('season_id', seasonId)
            .select('id');
        if (error) { console.error('clearMatches', error); return { ok: false, error: error.message }; }
        return { ok: true, count: data ? data.length : 0 };
    }

    // Bulk insert matches. rows: [{ season_id, match_date, home_team_id, away_team_id, venue }].
    async function insertMatches(rows) {
        const { error } = await db().from('match').insert(rows);
        if (error) { console.error('insertMatches', error); return { ok: false, error: error.message }; }
        return { ok: true };
    }

    // Resets a season entirely: clears every entered score, resets each of
    // its matches back to unconfirmed/unsubmitted, and clears that season's
    // persisted Season Best records (shooter_season_best) - so any Personal
    // Best that was set or manually entered within this season goes with
    // it. The fixture schedule itself (dates, teams, venues, half) is
    // untouched. Other seasons' bests, and therefore this shooter's overall
    // best if it was set in one of them, are untouched. Admin only - RLS
    // enforces.
    async function resetSeason(seasonId) {
        const { error: sbError } = await db().from('shooter_season_best')
            .delete()
            .eq('season_id', seasonId);
        if (sbError) { console.error('resetSeason', sbError); return { ok: false, error: sbError.message }; }

        const { data: matches, error: matchError } = await db().from('match')
            .select('id')
            .eq('season_id', seasonId);
        if (matchError) { console.error('resetSeason', matchError); return { ok: false, error: matchError.message }; }

        const matchIds = (matches || []).map(m => m.id);
        if (!matchIds.length) return { ok: true };

        const { error: scoreError } = await db().from('score').delete().in('match_id', matchIds);
        if (scoreError) { console.error('resetSeason', scoreError); return { ok: false, error: scoreError.message }; }

        const { error: statusError } = await db().from('match')
            .update({ submitted: false, home_confirmed: false, away_confirmed: false })
            .in('id', matchIds);
        if (statusError) { console.error('resetSeason', statusError); return { ok: false, error: statusError.message }; }

        return { ok: true };
    }

    // All exclusions (no-match Mondays), ordered by date.
    async function fetchExclusions() {
        const { data, error } = await db().from('exclusion')
            .select('id,season_id,match_date,reason')
            .order('match_date');
        if (error) { console.error('fetchExclusions', error); return []; }
        return data.map(e => ({
            id: e.id,
            season_id: e.season_id,
            date: e.match_date,
            reason: e.reason
        }));
    }

    // Delete every exclusion for one season. Admin only - RLS enforces.
    async function clearExclusions(seasonId) {
        const { data, error } = await db().from('exclusion')
            .delete()
            .eq('season_id', seasonId)
            .select('id');
        if (error) { console.error('clearExclusions', error); return { ok: false, error: error.message }; }
        return { ok: true, count: data ? data.length : 0 };
    }

    // Delete a single exclusion. Admin only - RLS enforces.
    async function deleteExclusion(seasonId, matchDate) {
        const { error } = await db().from('exclusion')
            .delete()
            .eq('season_id', seasonId)
            .eq('match_date', matchDate);
        if (error) { console.error('deleteExclusion', error); return { ok: false, error: error.message }; }
        return { ok: true };
    }

    // Bulk insert exclusions. rows: [{ season_id, match_date, reason }].
    async function insertExclusions(rows) {
        const { error } = await db().from('exclusion').insert(rows);
        if (error) { console.error('insertExclusions', error); return { ok: false, error: error.message }; }
        return { ok: true };
    }

    // Update one exclusion's date/reason. Admin only - RLS enforces.
    async function updateExclusion(id, { match_date, reason }) {
        const { data, error } = await db().from('exclusion')
            .update({ match_date, reason })
            .eq('id', id)
            .select('id');
        if (error) { console.error('updateExclusion', error); return { ok: false, error: error.message }; }
        return { ok: true, count: data ? data.length : 0 };
    }

    // Keeps a season's match schedule contiguous around a calendar entry
    // (exception/competition/event) being added, moved, or removed. Only
    // shifts fixtures that are actually occupying a slot in the way -
    // +7 walks forward from startDate while each week has a match and
    // pushes that whole occupied run one week later (making room); -7
    // walks forward from the week after startDate and, only if it's
    // occupied, pulls that run one week earlier (closing the gap). A no-op
    // (count 0) if nothing is in the way. Admin only - the RPC itself
    // checks is_admin(), same as confirm_match_side etc.
    async function shiftSeasonFixtures(seasonId, startDate, deltaDays) {
        const { data, error } = await db().rpc('shift_season_fixtures', {
            p_season_id: seasonId,
            p_start_date: startDate,
            p_delta_days: deltaDays
        });
        if (error) { console.error('shiftSeasonFixtures', error); return { ok: false, error: error.message }; }
        return { ok: true, count: data || 0 };
    }

    // ---------------------------------------------------------------------
    // Competitions - a season-scoped calendar entry with its own results
    // page (competition.html). Generic MVP: a name/venue/description plus a
    // shooter+score entry list (competition_entry) - not yet split into
    // bespoke per-competition-type shapes.
    // ---------------------------------------------------------------------

    // All competitions, optionally scoped to one season, ordered by date.
    async function fetchCompetitions(seasonId) {
        let query = db().from('competition')
            .select('id,season_id,event_date,name,venue,description')
            .order('event_date');
        if (seasonId) query = query.eq('season_id', seasonId);
        const { data, error } = await query;
        if (error) { console.error('fetchCompetitions', error); return []; }
        return data.map(c => ({
            id: c.id,
            seasonId: c.season_id,
            date: c.event_date,
            name: c.name,
            venue: c.venue,
            description: c.description
        }));
    }

    // Single competition, for the competition.html header. Admin only to
    // write - RLS enforces.
    async function fetchCompetitionById(id) {
        const { data, error } = await db().from('competition')
            .select('id,season_id,event_date,name,venue,description')
            .eq('id', id)
            .maybeSingle();
        if (error) { console.error('fetchCompetitionById', error); return null; }
        if (!data) return null;
        return {
            id: data.id,
            seasonId: data.season_id,
            date: data.event_date,
            name: data.name,
            venue: data.venue,
            description: data.description
        };
    }

    async function addCompetition({ season_id, event_date, name, venue, description }) {
        const { data, error } = await db().from('competition')
            .insert({ season_id, event_date, name, venue: venue || null, description: description || null })
            .select('id,season_id,event_date,name,venue,description')
            .single();
        if (error) { console.error('addCompetition', error); return { ok: false, error: error.message }; }
        return { ok: true, competition: data };
    }

    async function updateCompetition(id, { event_date, name, venue, description }) {
        const { data, error } = await db().from('competition')
            .update({ event_date, name, venue: venue || null, description: description || null })
            .eq('id', id)
            .select('id');
        if (error) { console.error('updateCompetition', error); return { ok: false, error: error.message }; }
        return { ok: true, count: data ? data.length : 0 };
    }

    // Deletes the competition and its results (competition_entry cascades).
    async function deleteCompetition(id) {
        const { data, error } = await db().from('competition')
            .delete()
            .eq('id', id)
            .select('id');
        if (error) { console.error('deleteCompetition', error); return { ok: false, error: error.message }; }
        return { ok: true, count: data ? data.length : 0 };
    }

    // Delete every competition (and its results) for one season. Admin only - RLS enforces.
    async function clearCompetitions(seasonId) {
        const { data, error } = await db().from('competition')
            .delete()
            .eq('season_id', seasonId)
            .select('id');
        if (error) { console.error('clearCompetitions', error); return { ok: false, error: error.message }; }
        return { ok: true, count: data ? data.length : 0 };
    }

    // A competition's results, highest score first.
    async function fetchCompetitionEntries(competitionId) {
        const { data, error } = await db().from('competition_entry')
            .select('id,competition_id,shooter_id,score,notes')
            .eq('competition_id', competitionId)
            .order('score', { ascending: false });
        if (error) { console.error('fetchCompetitionEntries', error); return []; }
        return data;
    }

    // Every shooter league-wide (competitions aren't team-scoped, unlike
    // match score entry) - for the competition results shooter picker.
    async function fetchAllShooters() {
        const { data, error } = await db().from('shooter')
            .select('id,shooter_no,name,team_id')
            .order('name');
        if (error) { console.error('fetchAllShooters', error); return []; }
        return data;
    }

    // Add or update one shooter's result for a competition (real upsert on
    // the (competition_id, shooter_id) unique constraint - entries are
    // edited one row at a time, not autosaved as a whole block like match
    // scores). Admin only - RLS enforces.
    async function upsertCompetitionEntry(competitionId, shooterId, { score, notes }) {
        const { data, error } = await db().from('competition_entry')
            .upsert(
                { competition_id: competitionId, shooter_id: shooterId, score: Number(score) || 0, notes: notes || null },
                { onConflict: 'competition_id,shooter_id' }
            )
            .select('id,competition_id,shooter_id,score,notes')
            .maybeSingle();
        if (error) { console.error('upsertCompetitionEntry', error); return { ok: false, error: error.message }; }
        return { ok: true, entry: data };
    }

    async function deleteCompetitionEntry(id) {
        const { data, error } = await db().from('competition_entry')
            .delete()
            .eq('id', id)
            .select('id');
        if (error) { console.error('deleteCompetitionEntry', error); return { ok: false, error: error.message }; }
        return { ok: true, count: data ? data.length : 0 };
    }

    // Live updates: fire onChange whenever a competition's results change.
    // Tear down with the existing generic unsubscribeChannel().
    function subscribeCompetitionEntries(competitionId, onChange) {
        if (!db || !db().channel) return null;
        return db().channel('competition-entries-' + competitionId)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'competition_entry', filter: 'competition_id=eq.' + competitionId },
                onChange)
            .subscribe();
    }

    // ---------------------------------------------------------------------
    // Events - a season-scoped, purely informational calendar entry (venue,
    // attire, description). No results/entries, unlike competitions.
    // ---------------------------------------------------------------------

    async function fetchEvents(seasonId) {
        let query = db().from('event')
            .select('id,season_id,event_date,name,venue,attire,description')
            .order('event_date');
        if (seasonId) query = query.eq('season_id', seasonId);
        const { data, error } = await query;
        if (error) { console.error('fetchEvents', error); return []; }
        return data.map(e => ({
            id: e.id,
            seasonId: e.season_id,
            date: e.event_date,
            name: e.name,
            venue: e.venue,
            attire: e.attire,
            description: e.description
        }));
    }

    async function fetchEventById(id) {
        const { data, error } = await db().from('event')
            .select('id,season_id,event_date,name,venue,attire,description')
            .eq('id', id)
            .maybeSingle();
        if (error) { console.error('fetchEventById', error); return null; }
        if (!data) return null;
        return {
            id: data.id,
            seasonId: data.season_id,
            date: data.event_date,
            name: data.name,
            venue: data.venue,
            attire: data.attire,
            description: data.description
        };
    }

    async function addEvent({ season_id, event_date, name, venue, attire, description }) {
        const { data, error } = await db().from('event')
            .insert({ season_id, event_date, name, venue: venue || null, attire: attire || null, description: description || null })
            .select('id,season_id,event_date,name,venue,attire,description')
            .single();
        if (error) { console.error('addEvent', error); return { ok: false, error: error.message }; }
        return { ok: true, event: data };
    }

    async function updateEvent(id, { event_date, name, venue, attire, description }) {
        const { data, error } = await db().from('event')
            .update({ event_date, name, venue: venue || null, attire: attire || null, description: description || null })
            .eq('id', id)
            .select('id');
        if (error) { console.error('updateEvent', error); return { ok: false, error: error.message }; }
        return { ok: true, count: data ? data.length : 0 };
    }

    async function deleteEvent(id) {
        const { data, error } = await db().from('event')
            .delete()
            .eq('id', id)
            .select('id');
        if (error) { console.error('deleteEvent', error); return { ok: false, error: error.message }; }
        return { ok: true, count: data ? data.length : 0 };
    }

    // Delete every event for one season. Admin only - RLS enforces.
    async function clearEvents(seasonId) {
        const { data, error } = await db().from('event')
            .delete()
            .eq('season_id', seasonId)
            .select('id');
        if (error) { console.error('clearEvents', error); return { ok: false, error: error.message }; }
        return { ok: true, count: data ? data.length : 0 };
    }

    // ---------------------------------------------------------------------
    // Fixture editor - lets an admin correct an existing match's date/venue
    // after the fact (postponements, venue corrections). Setting venue is a
    // permanent override for this match (see fixture_list) - it stops
    // following the home team's registered venue from then on. A changed
    // match_date can collide with the (match_date, home_team_id,
    // away_team_id) unique constraint; the caller must surface `error` from
    // a failed result rather than assume success. Admin only - RLS enforces.
    // ---------------------------------------------------------------------
    async function updateMatchFixture(matchId, { match_date, venue }) {
        const patch = {};
        if (match_date !== undefined) patch.match_date = match_date;
        if (venue !== undefined) patch.venue = venue === '' ? null : venue;
        const { data, error } = await db().from('match')
            .update(patch)
            .eq('id', matchId)
            .select('id');
        if (error) { console.error('updateMatchFixture', error); return { ok: false, error: error.message }; }
        return { ok: true, count: data ? data.length : 0 };
    }

    // Manually create one match (admin-authored schedule - see admin-fixture-editor.js).
    // away_team_id may be null for a BYE week. The (match_date, home_team_id,
    // away_team_id) unique constraint rejects an exact duplicate; the caller
    // must surface `error` from a failed result rather than assume success.
    // Admin only - RLS enforces.
    async function addMatch({ season_id, match_date, home_team_id, away_team_id, venue, half }) {
        const { data, error } = await db().from('match')
            .insert({
                season_id,
                match_date,
                home_team_id,
                away_team_id: away_team_id || null,
                venue: venue || null,
                half: half || 1
            })
            .select('id')
            .single();
        if (error) { console.error('addMatch', error); return { ok: false, error: error.message }; }
        return { ok: true, match: data };
    }

    // Delete a single match (scores cascade-delete). Admin only - RLS enforces.
    async function deleteMatch(matchId) {
        const { data, error } = await db().from('match')
            .delete()
            .eq('id', matchId)
            .select('id');
        if (error) { console.error('deleteMatch', error); return { ok: false, error: error.message }; }
        return { ok: true, count: data ? data.length : 0 };
    }

    // Create a season. If is_current, clears that flag on all other seasons first.
    async function addSeason({ name, start_date, end_date, is_current }) {
        if (is_current) {
            await db().from('season').update({ is_current: false })
                .neq('id', '00000000-0000-0000-0000-000000000000');
        }

        // New seasons always append to the end of the manual display order -
        // to backfill an older season "before" others, add it here then use
        // reorderSeasons (see the season manager's move up/down controls) to
        // move it into place.
        const { data: maxRow } = await db().from('season')
            .select('sort_order')
            .order('sort_order', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();
        const nextSortOrder = maxRow && maxRow.sort_order != null ? maxRow.sort_order + 1 : 0;

        const { data, error } = await db().from('season')
            .insert({
                name: String(name).trim(),
                start_date: start_date || null,
                end_date: end_date || null,
                is_current: !!is_current,
                sort_order: nextSortOrder
            })
            .select('id,name,is_current')
            .single();
        if (error) { console.error('addSeason', error); return { ok: false, error: error.message }; }
        return { ok: true, season: data };
    }

    // Marks one season as current, clearing the flag on every other season
    // first - this is the only way to change which season is current after
    // it's been created (the "Current season" checkbox on the add form only
    // applies at creation time). pickCurrentSeason() falls back to whichever
    // season is last in the list if none of them have this flag set, so an
    // explicit "current" is what keeps that fallback from silently kicking
    // in. Admin only - RLS enforces.
    async function setCurrentSeason(seasonId) {
        await db().from('season').update({ is_current: false })
            .neq('id', '00000000-0000-0000-0000-000000000000');
        const { error } = await db().from('season')
            .update({ is_current: true })
            .eq('id', seasonId);
        if (error) { console.error('setCurrentSeason', error); return { ok: false, error: error.message }; }
        return { ok: true };
    }

    // Create a team. Admin only - RLS enforces.
    async function addTeam({ name, venue, slug }) {
        const { data, error } = await db().from('team')
            .insert({
                name: String(name).trim(),
                venue: String(venue).trim(),
                slug: String(slug).trim()
            })
            .select('id,name,venue,slug')
            .single();
        if (error) { console.error('addTeam', error); return { ok: false, error: error.message }; }
        return { ok: true, team: data };
    }

    // Update a team's name/venue/slug. Admin only - RLS enforces.
    async function updateTeam(id, { name, venue, slug }) {
        const patch = {
            name: String(name).trim(),
            venue: String(venue).trim(),
            slug: String(slug).trim()
        };
        const { data, error } = await db().from('team')
            .update(patch)
            .eq('id', id)
            .select('id');
        if (error) { console.error('updateTeam', error); return { ok: false, error: error.message }; }
        return { ok: true, count: data ? data.length : 0 };
    }

    // Delete a team. Admin only - RLS enforces.
    async function deleteTeam(id) {
        const { data, error } = await db().from('team')
            .delete()
            .eq('id', id)
            .select('id');
        if (error) { console.error('deleteTeam', error); return { ok: false, error: error.message }; }
        return { ok: true, count: data ? data.length : 0 };
    }

    // Summer League periods (it runs once a year and doesn't line up with
    // the main league's season boundaries, so it gets its own standalone
    // pagination instead of hooking into the season table). Ordered by
    // sort_order (see reorderSummerLeaguePeriods).
    async function fetchSummerLeaguePeriods() {
        const { data, error } = await db().from('summer_league_period')
            .select('id,name,sort_order,is_current')
            .order('sort_order', { ascending: true });
        if (error) { console.error('fetchSummerLeaguePeriods', error); return []; }
        return data;
    }

    // Add a Summer League period, defaulting to the end of the list (most
    // recent). Admin only - RLS enforces.
    async function addSummerLeaguePeriod(name) {
        const { data: maxRow } = await db().from('summer_league_period')
            .select('sort_order')
            .order('sort_order', { ascending: false })
            .limit(1)
            .maybeSingle();
        const sortOrder = maxRow ? maxRow.sort_order + 1 : 0;

        const { data, error } = await db().from('summer_league_period')
            .insert({ name: String(name).trim(), sort_order: sortOrder })
            .select('id,name,sort_order,is_current')
            .maybeSingle();
        if (error) { console.error('addSummerLeaguePeriod', error); return { ok: false, error: error.message }; }
        return { ok: true, period: data };
    }

    // Marks one Summer League period as current, clearing the flag on every
    // other period first. This is what the page defaults to on load.
    // Admin only - RLS enforces.
    async function setCurrentSummerLeaguePeriod(id) {
        await db().from('summer_league_period').update({ is_current: false })
            .neq('id', '00000000-0000-0000-0000-000000000000');
        const { error } = await db().from('summer_league_period')
            .update({ is_current: true })
            .eq('id', id);
        if (error) { console.error('setCurrentSummerLeaguePeriod', error); return { ok: false, error: error.message }; }
        return { ok: true };
    }

    // Delete a Summer League period and all of its newsletters (cascade).
    // Admin only - RLS enforces.
    async function deleteSummerLeaguePeriod(id) {
        const { error } = await db().from('summer_league_period')
            .delete()
            .eq('id', id);
        if (error) { console.error('deleteSummerLeaguePeriod', error); return { ok: false, error: error.message }; }
        return { ok: true };
    }

    // Persist a new display order for Summer League periods. orderedIds is
    // the full list of period ids in the desired order. Admin only - RLS enforces.
    async function reorderSummerLeaguePeriods(orderedIds) {
        const results = await Promise.all(orderedIds.map((id, index) =>
            db().from('summer_league_period').update({ sort_order: index }).eq('id', id)
        ));
        const failed = results.find(r => r.error);
        if (failed) { console.error('reorderSummerLeaguePeriods', failed.error); return { ok: false, error: failed.error.message }; }
        return { ok: true };
    }

    // Summer League newsletters for one period: each is a titled PDF
    // already uploaded to Documents/summer-league/ on the server (this
    // table stores the filename + title only, not the PDF itself - same
    // convention as gallery images). Ordered by sort_order (see
    // reorderSummerLeagueDocuments) - new newsletters default to the top
    // (newest first), but can be manually reordered from there.
    async function fetchSummerLeagueDocuments(periodId) {
        if (!periodId) return [];
        const { data, error } = await db().from('summer_league_document')
            .select('id,title,filename,sort_order,published_at,created_at')
            .eq('period_id', periodId)
            .order('sort_order', { ascending: true });
        if (error) { console.error('fetchSummerLeagueDocuments', error); return []; }
        return data;
    }

    // Persist a new display order for one period's newsletters. orderedIds
    // is the full list of that period's document ids in the desired order.
    // Admin only - RLS enforces.
    async function reorderSummerLeagueDocuments(orderedIds) {
        const results = await Promise.all(orderedIds.map((id, index) =>
            db().from('summer_league_document').update({ sort_order: index }).eq('id', id)
        ));
        const failed = results.find(r => r.error);
        if (failed) { console.error('reorderSummerLeagueDocuments', failed.error); return { ok: false, error: failed.error.message }; }
        return { ok: true };
    }

    // Add a Summer League newsletter, defaulting to the top of the list
    // (newest first). date (YYYY-MM-DD) defaults to today if omitted - it's
    // shown on the page and can be edited later (see updateSummerLeagueDocument),
    // e.g. to backfill the true date for several newsletters added in bulk.
    // Admin only - RLS enforces.
    async function addSummerLeagueDocument(periodId, { title, filename, date }) {
        const { data: minRow } = await db().from('summer_league_document')
            .select('sort_order')
            .eq('period_id', periodId)
            .order('sort_order', { ascending: true })
            .limit(1)
            .maybeSingle();
        const sortOrder = minRow ? minRow.sort_order - 1 : 0;

        const payload = { period_id: periodId, title: (title || '').trim(), filename: String(filename).trim(), sort_order: sortOrder };
        if (date) payload.published_at = date;

        const { data, error } = await db().from('summer_league_document')
            .insert(payload)
            .select('id,title,filename,sort_order,published_at,created_at')
            .maybeSingle();
        if (error) { console.error('addSummerLeagueDocument', error); return { ok: false, error: error.message }; }
        return { ok: true, document: data };
    }

    // Update a Summer League newsletter's title/filename/date. Admin only - RLS enforces.
    async function updateSummerLeagueDocument(id, { title, filename, date }) {
        const { data, error } = await db().from('summer_league_document')
            .update({ title: (title || '').trim(), filename: String(filename).trim(), published_at: date })
            .eq('id', id)
            .select('id,title,filename,sort_order,published_at,created_at')
            .maybeSingle();
        if (error) { console.error('updateSummerLeagueDocument', error); return { ok: false, error: error.message }; }
        return { ok: true, document: data };
    }

    // Delete a Summer League newsletter. Admin only - RLS enforces.
    async function deleteSummerLeagueDocument(id) {
        const { error } = await db().from('summer_league_document')
            .delete()
            .eq('id', id);
        if (error) { console.error('deleteSummerLeagueDocument', error); return { ok: false, error: error.message }; }
        return { ok: true };
    }

    // Handicap formula config (single row): max(0, round((((target - avg) /
    // divisor) - offset_value) * factor)). { target, divisor, offset_value, factor }.
    const HANDICAP_CONFIG_DEFAULTS = { target: 70, divisor: 2, offset_value: 0.95, factor: 1.4 };
    async function fetchHandicapConfig() {
        const { data, error } = await db().from('handicap_config')
            .select('target,divisor,offset_value,factor')
            .eq('id', 1)
            .maybeSingle();
        if (error) { console.error('fetchHandicapConfig', error); return { ...HANDICAP_CONFIG_DEFAULTS }; }
        return data || { ...HANDICAP_CONFIG_DEFAULTS };
    }

    // Update the handicap formula. Admin only - RLS enforces.
    async function updateHandicapConfig({ target, divisor, offset_value, factor }) {
        const patch = {};
        if (target !== undefined) patch.target = Number(target);
        if (divisor !== undefined) patch.divisor = Number(divisor);
        if (offset_value !== undefined) patch.offset_value = Number(offset_value);
        if (factor !== undefined) patch.factor = Number(factor);
        const { data, error } = await db().from('handicap_config')
            .update(patch)
            .eq('id', 1)
            .select('target,divisor,offset_value,factor')
            .maybeSingle();
        if (error) { console.error('updateHandicapConfig', error); return { ok: false, error: error.message }; }
        return { ok: true, config: data };
    }

    // Handicaps for a set of shooters as-of a date (YYYY-MM-DD), or to date if null.
    // Returns a Map-like object: { shooterId -> number }.
    async function fetchHandicaps(shooterIds, asOfDate) {
        const ids = (shooterIds || []).filter(Boolean);
        if (!ids.length) return {};
        const { data, error } = await db().rpc('handicaps_for', {
            p_before: asOfDate || null,
            p_shooters: ids
        });
        if (error) { console.error('fetchHandicaps', error); return {}; }
        const map = {};
        (data || []).forEach(r => { map[r.shooter_id] = r.handicap == null ? null : Number(r.handicap); });
        return map;
    }

    // ---------------------------------------------------------------------
    // Full data export / import (admin backup & disaster recovery).
    // Covers every base table's rows; the shooter_stats/fixture_list/
    // match_scorecard views are derived and regenerate automatically.
    // user_profile is exported for reference only, never re-imported - its
    // id is a foreign key into Supabase's separate auth.users table, which
    // a freshly-restored project won't have matching rows for. Re-invite
    // admins/captains after a restore and reassign their role/team instead.
    // ---------------------------------------------------------------------
    const BACKUP_TABLES = ['season', 'team', 'shooter', 'match', 'exclusion', 'score', 'handicap_config', 'summer_league_document', 'user_profile'];
    const BACKUP_IMPORT_TABLES = ['season', 'team', 'shooter', 'match', 'exclusion', 'score', 'handicap_config', 'summer_league_document'];
    const BACKUP_CHUNK_SIZE = 500;

    // Downloads every row of every table as one JSON snapshot. Admin only -
    // RLS scopes what each role can see, but only an admin can read every
    // row of every table.
    async function exportAllData() {
        const tables = {};
        for (const name of BACKUP_TABLES) {
            const { data, error } = await db().from(name).select('*');
            if (error) { console.error('exportAllData: ' + name, error); return { ok: false, error: name + ': ' + error.message }; }
            tables[name] = data || [];
        }
        return {
            ok: true,
            payload: {
                exported_at: new Date().toISOString(),
                source: 'NADARL Portal',
                format_version: 1,
                tables
            }
        };
    }

    // handicap_config is seeded with one row (id=1) directly by its
    // migration, on-conflict-do-nothing - so it's never actually empty on a
    // freshly-migrated database, unlike every other table here. Upsert it
    // instead of insert so restoring the exported config doesn't collide
    // with that seeded default row.
    const BACKUP_UPSERT_TABLES = { handicap_config: 'id' };

    // Restores a previous exportAllData() snapshot into an EMPTY database
    // whose schema already matches (supabase/schema.sql + migrations
    // applied first). Inserts row-for-row in FK-safe dependency order,
    // preserving the original ids so foreign keys between exported rows
    // stay intact. onProgress(table, rowCount) fires after each table.
    async function importAllData(payload, onProgress) {
        const tables = (payload && payload.tables) || {};
        for (const name of BACKUP_IMPORT_TABLES) {
            const rows = tables[name];
            if (!rows || !rows.length) { if (onProgress) onProgress(name, 0); continue; }
            const conflictCol = BACKUP_UPSERT_TABLES[name];
            for (let i = 0; i < rows.length; i += BACKUP_CHUNK_SIZE) {
                const chunk = rows.slice(i, i + BACKUP_CHUNK_SIZE);
                const query = conflictCol
                    ? db().from(name).upsert(chunk, { onConflict: conflictCol })
                    : db().from(name).insert(chunk);
                const { error } = await query;
                if (error) { console.error('importAllData: ' + name, error); return { ok: false, error: name + ': ' + error.message }; }
            }
            if (onProgress) onProgress(name, rows.length);
        }
        return { ok: true };
    }

    // All gallery items, each with its list of images (filenames, in display
    // order). Manually ordered items (sort_order set) come first in that
    // order; the rest fall back to newest-first.
    async function fetchGalleryItems() {
        const { data, error } = await db().from('gallery_item')
            .select('id,description,created_at,sort_order,gallery_item_image(filename,sort_order)')
            .order('sort_order', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false })
            .order('sort_order', { ascending: true, foreignTable: 'gallery_item_image' });
        if (error) { console.error('fetchGalleryItems', error); return []; }
        return data.map(item => ({
            ...item,
            images: (item.gallery_item_image || []).map(img => img.filename)
        }));
    }

    // Add a gallery item with one or more images. Each filename must match
    // an image already uploaded to Images/gallery/ on the server. The
    // gallery_item row and its gallery_item_image rows are written together
    // in one transaction (see save_gallery_item). Admin only - RLS enforces.
    async function addGalleryItem({ filenames, description }) {
        const { data, error } = await db().rpc('save_gallery_item', {
            p_id: null,
            p_description: description || '',
            p_filenames: filenames
        });
        if (error) { console.error('addGalleryItem', error); return { ok: false, error: error.message }; }
        const images = filenames.map(f => String(f).trim()).filter(Boolean);
        return { ok: true, item: { ...data[0], images } };
    }

    // Update a gallery item's description and image list (the image list is
    // replaced wholesale, atomically - see save_gallery_item).
    // Admin only - RLS enforces.
    async function updateGalleryItem(id, { filenames, description }) {
        const { data, error } = await db().rpc('save_gallery_item', {
            p_id: id,
            p_description: description || '',
            p_filenames: filenames
        });
        if (error) { console.error('updateGalleryItem', error); return { ok: false, error: error.message }; }
        const images = filenames.map(f => String(f).trim()).filter(Boolean);
        return { ok: true, item: { ...data[0], images } };
    }

    // Delete a gallery item (its images are removed too, via cascade).
    // Admin only - RLS enforces.
    async function deleteGalleryItem(id) {
        const { error } = await db().from('gallery_item')
            .delete()
            .eq('id', id);
        if (error) { console.error('deleteGalleryItem', error); return { ok: false, error: error.message }; }
        return { ok: true };
    }

    // Persist a new display order for gallery photos. orderedIds is the
    // full list of item ids in the desired order. Admin only - RLS enforces.
    async function reorderGalleryItems(orderedIds) {
        const results = await Promise.all(orderedIds.map((id, index) =>
            db().from('gallery_item').update({ sort_order: index }).eq('id', id)
        ));
        const failed = results.find(r => r.error);
        if (failed) { console.error('reorderGalleryItems', failed.error); return { ok: false, error: failed.error.message }; }
        return { ok: true };
    }

    // All trophy items, each with its list of images (filenames, in display
    // order). Manually ordered items (sort_order set) come first in that
    // order; the rest fall back to newest-first. Mirrors fetchGalleryItems.
    async function fetchTrophyItems() {
        const { data, error } = await db().from('trophy_item')
            .select('id,name,description,created_at,sort_order,trophy_item_image(filename,sort_order)')
            .order('sort_order', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false })
            .order('sort_order', { ascending: true, foreignTable: 'trophy_item_image' });
        if (error) { console.error('fetchTrophyItems', error); return []; }
        return data.map(item => ({
            ...item,
            images: (item.trophy_item_image || []).map(img => img.filename)
        }));
    }

    // Add a trophy item with one or more images. Each filename must match
    // an image already uploaded to Images/trophies/ on the server. Admin
    // only - RLS enforces.
    async function addTrophyItem({ name, filenames, description }) {
        const { data, error } = await db().rpc('save_trophy_item', {
            p_id: null,
            p_name: name || '',
            p_description: description || '',
            p_filenames: filenames
        });
        if (error) { console.error('addTrophyItem', error); return { ok: false, error: error.message }; }
        const images = filenames.map(f => String(f).trim()).filter(Boolean);
        return { ok: true, item: { ...data[0], images } };
    }

    // Update a trophy item's name, description, and image list (the image
    // list is replaced wholesale, atomically). Admin only - RLS enforces.
    async function updateTrophyItem(id, { name, filenames, description }) {
        const { data, error } = await db().rpc('save_trophy_item', {
            p_id: id,
            p_name: name || '',
            p_description: description || '',
            p_filenames: filenames
        });
        if (error) { console.error('updateTrophyItem', error); return { ok: false, error: error.message }; }
        const images = filenames.map(f => String(f).trim()).filter(Boolean);
        return { ok: true, item: { ...data[0], images } };
    }

    // Delete a trophy item (its images are removed too, via cascade).
    // Admin only - RLS enforces.
    async function deleteTrophyItem(id) {
        const { error } = await db().from('trophy_item')
            .delete()
            .eq('id', id);
        if (error) { console.error('deleteTrophyItem', error); return { ok: false, error: error.message }; }
        return { ok: true };
    }

    // Persist a new display order for trophies. orderedIds is the full list
    // of item ids in the desired order. Admin only - RLS enforces.
    async function reorderTrophyItems(orderedIds) {
        const results = await Promise.all(orderedIds.map((id, index) =>
            db().from('trophy_item').update({ sort_order: index }).eq('id', id)
        ));
        const failed = results.find(r => r.error);
        if (failed) { console.error('reorderTrophyItems', failed.error); return { ok: false, error: failed.error.message }; }
        return { ok: true };
    }

    // All for-sale items, each with its list of images (filenames, in
    // display order). Manually ordered items (sort_order set) come first in
    // that order; the rest fall back to newest-first. Mirrors
    // fetchTrophyItems.
    async function fetchSaleItems() {
        const { data, error } = await db().from('sale_item')
            .select('id,name,price,description,created_at,sort_order,sale_item_image(filename,sort_order)')
            .order('sort_order', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false })
            .order('sort_order', { ascending: true, foreignTable: 'sale_item_image' });
        if (error) { console.error('fetchSaleItems', error); return []; }
        return data.map(item => ({
            ...item,
            images: (item.sale_item_image || []).map(img => img.filename)
        }));
    }

    // Add a for-sale item with one or more images. Each filename must match
    // an image already uploaded to Images/sales/ on the server. Admin only
    // - RLS enforces.
    async function addSaleItem({ name, price, filenames, description }) {
        const { data, error } = await db().rpc('save_sale_item', {
            p_id: null,
            p_name: name || '',
            p_price: price || '',
            p_description: description || '',
            p_filenames: filenames
        });
        if (error) { console.error('addSaleItem', error); return { ok: false, error: error.message }; }
        const images = filenames.map(f => String(f).trim()).filter(Boolean);
        return { ok: true, item: { ...data[0], images } };
    }

    // Update a for-sale item's name, price, description, and image list
    // (the image list is replaced wholesale, atomically). Admin only - RLS
    // enforces.
    async function updateSaleItem(id, { name, price, filenames, description }) {
        const { data, error } = await db().rpc('save_sale_item', {
            p_id: id,
            p_name: name || '',
            p_price: price || '',
            p_description: description || '',
            p_filenames: filenames
        });
        if (error) { console.error('updateSaleItem', error); return { ok: false, error: error.message }; }
        const images = filenames.map(f => String(f).trim()).filter(Boolean);
        return { ok: true, item: { ...data[0], images } };
    }

    // Delete a for-sale item (its images are removed too, via cascade).
    // Admin only - RLS enforces.
    async function deleteSaleItem(id) {
        const { error } = await db().from('sale_item')
            .delete()
            .eq('id', id);
        if (error) { console.error('deleteSaleItem', error); return { ok: false, error: error.message }; }
        return { ok: true };
    }

    // Persist a new display order for for-sale items. orderedIds is the
    // full list of item ids in the desired order. Admin only - RLS
    // enforces.
    async function reorderSaleItems(orderedIds) {
        const results = await Promise.all(orderedIds.map((id, index) =>
            db().from('sale_item').update({ sort_order: index }).eq('id', id)
        ));
        const failed = results.find(r => r.error);
        if (failed) { console.error('reorderSaleItems', failed.error); return { ok: false, error: failed.error.message }; }
        return { ok: true };
    }

    return {
        fetchTeams,
        fetchTeamByName,
        fetchTeamSlugMap,
        fetchTeamShootersStats,
        fetchTeamShootersStatsForSeason,
        fetchAllShooterStats,
        fetchShooterStatsForSeason,
        fetchShooterById,
        fetchShooterMatchHistory,
        fetchShooterMatchHistoryAllTime,
        fetchTeamStandingsForSeason,
        fetchFixtures,
        fetchMatchScorecard,
        fetchMatch,
        fetchShootersForTeam,
        saveTeamScores,
        subscribeMatchScores,
        unsubscribeChannel,
        fetchMatchStatus,
        confirmMatchSide,
        unconfirmMatchSide,
        resetMatchConfirm,
        submitMatch,
        subscribeMatch,
        fetchMyProfile,
        fetchProfiles,
        updateProfile,
        addShooter,
        updateShooter,
        fetchSeasons,
        reorderSeasons,
        setCurrentSeason,
        pickCurrentSeason,
        seasonHasMatches,
        fetchDateOccupants,
        deleteSeason,
        clearMatches,
        resetSeason,
        insertMatches,
        fetchExclusions,
        clearExclusions,
        insertExclusions,
        deleteExclusion,
        updateExclusion,
        shiftSeasonFixtures,
        fetchCompetitions,
        fetchCompetitionById,
        addCompetition,
        updateCompetition,
        deleteCompetition,
        clearCompetitions,
        fetchCompetitionEntries,
        fetchAllShooters,
        upsertCompetitionEntry,
        deleteCompetitionEntry,
        subscribeCompetitionEntries,
        fetchEvents,
        fetchEventById,
        addEvent,
        updateEvent,
        deleteEvent,
        clearEvents,
        updateMatchFixture,
        addMatch,
        deleteMatch,
        addSeason,
        addTeam,
        updateTeam,
        deleteTeam,
        fetchHandicapConfig,
        updateHandicapConfig,
        fetchHandicaps,
        exportAllData,
        importAllData,
        fetchGalleryItems,
        addGalleryItem,
        updateGalleryItem,
        deleteGalleryItem,
        reorderGalleryItems,
        fetchTrophyItems,
        addTrophyItem,
        updateTrophyItem,
        deleteTrophyItem,
        reorderTrophyItems,
        fetchSaleItems,
        addSaleItem,
        updateSaleItem,
        deleteSaleItem,
        reorderSaleItems,
        fetchSummerLeaguePeriods,
        addSummerLeaguePeriod,
        deleteSummerLeaguePeriod,
        reorderSummerLeaguePeriods,
        setCurrentSummerLeaguePeriod,
        fetchSummerLeagueDocuments,
        addSummerLeagueDocument,
        updateSummerLeagueDocument,
        deleteSummerLeagueDocument,
        reorderSummerLeagueDocuments
    };
})();
