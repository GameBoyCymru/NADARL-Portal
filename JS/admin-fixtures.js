// =====================================================================
//  Admin fixtures panel (admin only): season create/delete and score
//  resets.
//
//  The automatic round-robin generator and the excluded-Mondays manager
//  that used to live here have both been removed - they're being rebuilt
//  from scratch as a combined Events/Exclusions wizard, so competitions
//  can become real fixtures instead of just blocking a date.
// =====================================================================

const FixturesAdmin = (function () {
    let seasons = [];

    function $(id) { return document.getElementById(id); }

    async function init() {
        const me = await NADARL.fetchMyProfile();
        if (!me || me.role !== 'admin') return;       // section lives in hidden admin panel
        if (!$('fixturesPanel')) return;

        seasons = await NADARL.fetchSeasons();
        populateSeasons();
        wire();
        await loadMatchDayInfo();
        await loadAllocatedMatchDayInfo();
    }

    function selectedSeason() {
        const id = $('fxSeason').value;
        return seasons.find(s => s.id === id) || seasons[0] || null;
    }

    function populateSeasons() {
        const sel = $('fxSeason');
        sel.innerHTML = '';
        if (!seasons.length) {
            const o = document.createElement('option');
            o.value = '';
            o.textContent = 'Create a season below first…';
            sel.appendChild(o);
            sel.disabled = true;
            return;
        }
        sel.disabled = false;
        const current = seasons.find(s => s.is_current) || seasons[0];
        seasons.forEach(s => {
            const o = document.createElement('option');
            o.value = s.id;
            o.textContent = s.name + (s.is_current ? '  (current)' : '');
            if (current && s.id === current.id) o.selected = true;
            sel.appendChild(o);
        });
    }

    async function refreshSeasons() {
        seasons = await NADARL.fetchSeasons();
        populateSeasons();
        await loadAllocatedMatchDayInfo();
    }

    function wire() {
        $('fxAddSeason').addEventListener('click', createSeason);
        $('fxResetSeason').addEventListener('click', resetSeason);
        $('fxDeleteSeason').addEventListener('click', deleteSeason);
        $('fxSeason').addEventListener('change', loadAllocatedMatchDayInfo);
    }

    // Every team needs to play every other team both home and away, once in
    // the League half (half=1) and again, mirrored, in the Handicap half
    // (half=2) - see the 'half' column comment in schema.sql. That's a
    // double round-robin per half: with an even number of teams everyone
    // plays every round (2*(N-1) match days); with an odd number one team
    // sits out each round, so it takes 2*N match days instead.
    function matchDaysPerHalf(teamCount) {
        if (teamCount < 2) return 0;
        return teamCount % 2 === 0 ? 2 * (teamCount - 1) : 2 * teamCount;
    }

    // Every team plays every other team both home and away once per half,
    // i.e. every ordered (home, away) pair - N*(N-1) matches, regardless of
    // whether N is odd or even. Byes don't add matches, only affect how
    // many match days it takes to fit them all in (matchDaysPerHalf above).
    function matchesPerHalf(teamCount) {
        if (teamCount < 2) return 0;
        return teamCount * (teamCount - 1);
    }

    async function loadMatchDayInfo() {
        const box = $('fxMatchDayInfo');
        box.innerHTML = '<span class="fx-hint">Loading…</span>';

        const teams = await NADARL.fetchTeams();
        const teamCount = teams.length;
        const daysPerHalf = matchDaysPerHalf(teamCount);
        const matchesHalf = matchesPerHalf(teamCount);

        box.innerHTML = '';
        box.appendChild(statGroup('Match Days', [
            ['League', daysPerHalf],
            ['Handicap', daysPerHalf],
            ['Total', daysPerHalf * 2]
        ]));
        box.appendChild(statGroup('Matches', [
            ['League', matchesHalf],
            ['Handicap', matchesHalf],
            ['Total', matchesHalf * 2]
        ]));

        if (teamCount % 2 !== 0 && teamCount > 0) {
            const note = document.createElement('p');
            note.className = 'fx-hint';
            note.style.marginTop = '10px';
            note.textContent = 'Odd number of teams - one team has a bye each match day.';
            box.appendChild(note);
        }
    }

    // Distinct dates and actual matches (BYE weeks excluded - a bye isn't a
    // match) already scheduled in the selected season, so this can be
    // compared against "Match Days Required" above to see how much of the
    // season is actually done.
    async function loadAllocatedMatchDayInfo() {
        const box = $('fxAllocatedMatchDayInfo');
        box.innerHTML = '<span class="fx-hint">Loading…</span>';

        const season = selectedSeason();
        const fixturesList = season ? await NADARL.fetchFixtures(season.id) : [];
        const played = fixturesList.filter(f => !f.isBye);

        const leagueDays = new Set(fixturesList.filter(f => f.half !== 2).map(f => f.date)).size;
        const hcDays = new Set(fixturesList.filter(f => f.half === 2).map(f => f.date)).size;
        const totalDays = new Set(fixturesList.map(f => f.date)).size;

        const leagueMatches = played.filter(f => f.half !== 2).length;
        const hcMatches = played.filter(f => f.half === 2).length;

        box.innerHTML = '';
        box.appendChild(statGroup('Match Days', [
            ['League', leagueDays],
            ['Handicap', hcDays],
            ['Total', totalDays]
        ]));
        box.appendChild(statGroup('Matches', [
            ['League', leagueMatches],
            ['Handicap', hcMatches],
            ['Total', played.length]
        ]));
    }

    // A labelled cluster of stat tiles (e.g. "Match Days": League/Handicap/
    // Total) - title is optional so a single standalone stat (Teams) can
    // reuse the same tile styling without a redundant heading.
    function statGroup(title, entries) {
        const wrap = document.createElement('div');
        wrap.className = 'fx-stat-group';
        if (title) {
            const h = document.createElement('h4');
            h.className = 'fx-stat-group-title';
            h.textContent = title;
            wrap.appendChild(h);
        }
        const grid = document.createElement('div');
        grid.className = 'fx-stat-grid';
        entries.forEach(([label, value]) => grid.appendChild(matchDayStat(label, value)));
        wrap.appendChild(grid);
        return wrap;
    }

    function matchDayStat(label, value) {
        const stat = document.createElement('div');
        stat.className = 'fx-stat';
        const l = document.createElement('span');
        l.className = 'fx-stat-label';
        l.textContent = label;
        const v = document.createElement('span');
        v.className = 'fx-stat-value';
        v.textContent = value;
        stat.appendChild(l);
        stat.appendChild(v);
        return stat;
    }

    // Clears every entered score for the selected season and resets each of
    // its matches back to unconfirmed/unsubmitted. The fixture schedule
    // (dates, teams, venues) and excluded Mondays are left exactly as they
    // are - this only wipes shooter/team stats, not the season's structure.
    // That includes any Personal Best set or manually entered within this
    // season: Season Best is tracked per season, and a shooter's all-time
    // Personal Best is just the highest of those across every season - so
    // resetting one season removes its contribution to that too. Other
    // seasons are untouched.
    async function resetSeason() {
        const season = selectedSeason();
        if (!season) { show('No season selected.', 'error'); return; }
        if (!confirm(
            'Reset season "' + season.name + '"? ' +
            'This clears all entered scores and stats for this season, including any Personal Best ' +
            'set or manually entered within it. Fixtures and excluded dates are kept, and other seasons ' +
            'are untouched. This cannot be undone.'
        )) return;

        const btn = $('fxResetSeason');
        btn.disabled = true;
        const res = await NADARL.resetSeason(season.id);
        btn.disabled = false;
        if (!res.ok) { show('Could not reset season: ' + res.error, 'error'); return; }

        show('Season "' + season.name + '" has been reset.', 'success');
    }

    async function deleteSeason() {
        const season = selectedSeason();
        if (!season) { show('No season selected.', 'error'); return; }
        if (!confirm(
            'Permanently delete season "' + season.name + '" and all of its fixtures and scores? ' +
            'This cannot be undone.'
        )) return;

        const btn = $('fxDeleteSeason');
        btn.disabled = true;
        const res = await NADARL.deleteSeason(season.id);
        btn.disabled = false;
        if (!res.ok) { show('Could not delete season: ' + res.error, 'error'); return; }

        await refreshSeasons();
        show('Season "' + season.name + '" deleted.', 'success');
    }

    async function createSeason() {
        const nameEl = $('fxNewSeasonName');
        const name = nameEl.value.trim();
        if (!name) { show('Enter a season name (e.g. 2026-27).', 'error'); return; }
        const btn = $('fxAddSeason');
        btn.disabled = true;
        const res = await NADARL.addSeason({
            name,
            is_current: $('fxNewSeasonCurrent').checked
        });
        btn.disabled = false;
        if (!res.ok) { show('Could not create season: ' + res.error, 'error'); return; }
        nameEl.value = '';
        await refreshSeasons();
        show('Season "' + name + '" created.', 'success');
    }

    function show(text, type) {
        const el = $('fxMessage');
        el.textContent = text;
        el.className = 'login-message login-message-' + (type || '');
        el.hidden = false;
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', FixturesAdmin.init);
