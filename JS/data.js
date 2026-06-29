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
            isBye: f.is_bye
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

    return {
        fetchTeams,
        fetchTeamByName,
        fetchTeamShootersStats,
        fetchAllShooterStats,
        fetchFixtures,
        fetchMatchScorecard,
        fetchMyProfile,
        fetchProfiles,
        updateProfile
    };
})();
