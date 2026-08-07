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
    // pb_override (DB column: personal_best) is admin-only - a DB trigger
    // rejects the write for anyone else, so only pass it when the caller is
    // actually an admin. It's a one-off seed/correction, not a standing
    // formula: real submitted matches ratchet it up automatically from then
    // on (see 2026-08-07-shooter-personal-best-persist.sql), surviving even
    // a season score reset.
    async function updateShooter(shooterId, { name, role, pb_override }) {
        const patch = { name: normalizeName(name), role: role || null };
        if (pb_override !== undefined) {
            patch.personal_best = pb_override === null || pb_override === '' ? null : Number(pb_override);
        }
        const { data, error } = await db().from('shooter')
            .update(patch)
            .eq('id', shooterId)
            .select('id,shooter_no,name,role,team_id,pb_override:personal_best');
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
    async function fetchTeamShootersStatsForSeason(teamId, seasonId) {
        const stats = await fetchShooterStatsForSeason(seasonId);
        return sortByRoleThenName(stats.filter(s => s.team_id === teamId));
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

    // Clears every entered score for a season and resets each of its matches
    // back to unconfirmed/unsubmitted - the fixture schedule itself (dates,
    // teams, venues, half) is untouched. Admin only - RLS enforces.
    async function resetSeasonScores(seasonId) {
        const { data: matches, error: matchError } = await db().from('match')
            .select('id')
            .eq('season_id', seasonId);
        if (matchError) { console.error('resetSeasonScores', matchError); return { ok: false, error: matchError.message }; }

        const matchIds = (matches || []).map(m => m.id);
        if (!matchIds.length) return { ok: true };

        const { error: scoreError } = await db().from('score').delete().in('match_id', matchIds);
        if (scoreError) { console.error('resetSeasonScores', scoreError); return { ok: false, error: scoreError.message }; }

        const { error: statusError } = await db().from('match')
            .update({ submitted: false, home_confirmed: false, away_confirmed: false })
            .in('id', matchIds);
        if (statusError) { console.error('resetSeasonScores', statusError); return { ok: false, error: statusError.message }; }

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
    const BACKUP_TABLES = ['season', 'team', 'shooter', 'match', 'exclusion', 'score', 'handicap_config', 'user_profile'];
    const BACKUP_IMPORT_TABLES = ['season', 'team', 'shooter', 'match', 'exclusion', 'score', 'handicap_config'];
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

    return {
        fetchTeams,
        fetchTeamByName,
        fetchTeamSlugMap,
        fetchTeamShootersStats,
        fetchTeamShootersStatsForSeason,
        fetchAllShooterStats,
        fetchShooterStatsForSeason,
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
        pickCurrentSeason,
        seasonHasMatches,
        deleteSeason,
        clearMatches,
        resetSeasonScores,
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
        fetchHandicaps,
        exportAllData,
        importAllData,
        fetchGalleryItems,
        addGalleryItem,
        updateGalleryItem,
        deleteGalleryItem,
        reorderGalleryItems
    };
})();
