// =====================================================================
//  NADARL data-access layer
//  Thin async wrappers over the Supabase client (window.db).
//  Every function returns a Promise that resolves to plain data,
//  shaped to match what the page renderers expect.
// =====================================================================

const NADARL = (function () {
    const db = () => window.db;

    const ROLE_ORDER = { captain: 0, secretary: 1, treasurer: 2 };

    function sortByRoleThenName(rows) {
        return rows.sort((a, b) => {
            const ra = a.role ? ROLE_ORDER[a.role] : 3;
            const rb = b.role ? ROLE_ORDER[b.role] : 3;
            if (ra !== rb) return ra - rb;
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
    async function fetchFixtures() {
        const { data, error } = await db().from('fixture_list')
            .select('*')
            .order('date');
        if (error) { console.error('fetchFixtures', error); return []; }
        return data.map(f => ({
            id: f.id,
            date: f.date,
            homeTeam: f.home_team,
            awayTeam: f.away_team,        // null for BYE
            venue: f.venue,
            isBye: f.is_bye,
            half: f.half                  // 1 = first half, 2 = second half (handicaps)
        }));
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
    async function fetchShooterStatsForSeason(seasonId) {
        const { data, error } = await db().rpc('shooter_stats_for_season', { p_season_id: seasonId });
        if (error) { console.error('fetchShooterStatsForSeason', error); return []; }
        return data.sort((a, b) => Number(b.average) - Number(a.average));
    }

    // All seasons, ordered by name.
    async function fetchSeasons() {
        const { data, error } = await db().from('season')
            .select('id,name,start_date,end_date,is_current')
            .order('name');
        if (error) { console.error('fetchSeasons', error); return []; }
        return data;
    }

    // Whether a season already has any fixtures saved.
    async function seasonHasMatches(seasonId) {
        const { count, error } = await db().from('match')
            .select('id', { count: 'exact', head: true })
            .eq('season_id', seasonId);
        if (error) { console.error('seasonHasMatches', error); return false; }
        return (count || 0) > 0;
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
        const { error } = await db().from('match')
            .delete()
            .eq('season_id', seasonId);
        if (error) { console.error('clearMatches', error); return { ok: false, error: error.message }; }
        return { ok: true };
    }

    // Bulk insert matches. rows: [{ season_id, match_date, home_team_id, away_team_id, venue }].
    async function insertMatches(rows) {
        const { error } = await db().from('match').insert(rows);
        if (error) { console.error('insertMatches', error); return { ok: false, error: error.message }; }
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
        const { error } = await db().from('exclusion')
            .delete()
            .eq('season_id', seasonId);
        if (error) { console.error('clearExclusions', error); return { ok: false, error: error.message }; }
        return { ok: true };
    }

    // Bulk insert exclusions. rows: [{ season_id, match_date, reason }].
    async function insertExclusions(rows) {
        const { error } = await db().from('exclusion').insert(rows);
        if (error) { console.error('insertExclusions', error); return { ok: false, error: error.message }; }
        return { ok: true };
    }

    // Create a season. If is_current, clears that flag on all other seasons first.
    async function addSeason({ name, start_date, end_date, is_current }) {
        if (is_current) {
            await db().from('season').update({ is_current: false })
                .neq('id', '00000000-0000-0000-0000-000000000000');
        }
        const { data, error } = await db().from('season')
            .insert({
                name: String(name).trim(),
                start_date: start_date || null,
                end_date: end_date || null,
                is_current: !!is_current
            })
            .select('id,name,is_current')
            .single();
        if (error) { console.error('addSeason', error); return { ok: false, error: error.message }; }
        return { ok: true, season: data };
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

    // Handicap formula config (single row). { target, factor }.
    async function fetchHandicapConfig() {
        const { data, error } = await db().from('handicap_config')
            .select('target,factor')
            .eq('id', 1)
            .maybeSingle();
        if (error) { console.error('fetchHandicapConfig', error); return { target: 70, factor: 1 }; }
        return data || { target: 70, factor: 1 };
    }

    // Update the handicap formula. Admin only - RLS enforces.
    async function updateHandicapConfig({ target, factor }) {
        const patch = {};
        if (target !== undefined) patch.target = Number(target);
        if (factor !== undefined) patch.factor = Number(factor);
        const { data, error } = await db().from('handicap_config')
            .update(patch)
            .eq('id', 1)
            .select('target,factor')
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
        (data || []).forEach(r => { map[r.shooter_id] = Number(r.handicap) || 0; });
        return map;
    }

    return {
        fetchTeams,
        fetchTeamByName,
        fetchTeamSlugMap,
        fetchTeamShootersStats,
        fetchAllShooterStats,
        fetchShooterStatsForSeason,
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
        seasonHasMatches,
        deleteSeason,
        clearMatches,
        insertMatches,
        fetchExclusions,
        clearExclusions,
        insertExclusions,
        addSeason,
        addTeam,
        updateTeam,
        deleteTeam,
        fetchHandicapConfig,
        updateHandicapConfig,
        fetchHandicaps
    };
})();
