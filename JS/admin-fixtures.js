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

    function populateSeasons(preferredId) {
        const sel = $('fxSeason');
        sel.innerHTML = '';
        if (!seasons.length) {
            const o = document.createElement('option');
            o.value = '';
            o.textContent = 'Create a season below first…';
            sel.appendChild(o);
            sel.disabled = true;
            updateSeasonMoveButtons();
            return;
        }
        sel.disabled = false;
        const preferred = preferredId && seasons.find(s => s.id === preferredId);
        const current = preferred || seasons.find(s => s.is_current) || seasons[0];
        seasons.forEach(s => {
            const o = document.createElement('option');
            o.value = s.id;
            o.textContent = s.name + (s.is_current ? '  (current)' : '');
            if (current && s.id === current.id) o.selected = true;
            sel.appendChild(o);
        });
        updateSeasonMoveButtons();
    }

    function updateSeasonMoveButtons() {
        const season = selectedSeason();
        const idx = season ? seasons.findIndex(s => s.id === season.id) : -1;
        $('fxSeasonMoveUp').disabled = idx <= 0;
        $('fxSeasonMoveDown').disabled = idx === -1 || idx >= seasons.length - 1;
    }

    // Swaps the selected season with its neighbour and persists the new
    // order for every season (see reorderSeasons) - repeated moves let an
    // admin slot a newly-added historical season in before others, or fix
    // one that was entered in the wrong order.
    async function moveSeason(direction) {
        const season = selectedSeason();
        if (!season) return;
        const idx = seasons.findIndex(s => s.id === season.id);
        const swapIdx = idx + direction;
        if (idx === -1 || swapIdx < 0 || swapIdx >= seasons.length) return;

        const reordered = seasons.slice();
        [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

        $('fxSeasonMoveUp').disabled = true;
        $('fxSeasonMoveDown').disabled = true;
        const res = await NADARL.reorderSeasons(reordered.map(s => s.id));
        if (!res.ok) { show('Could not reorder seasons: ' + res.error, 'error'); updateSeasonMoveButtons(); return; }

        seasons = await NADARL.fetchSeasons();
        populateSeasons(season.id);
    }

    async function refreshSeasons() {
        seasons = await NADARL.fetchSeasons();
        populateSeasons();
        await loadAllocatedMatchDayInfo();
    }

    // The only way to change which season is current after it's been
    // created - the "Set as current season" checkbox on the add form only
    // applies at the moment a season is created.
    async function setCurrentSeason() {
        const season = selectedSeason();
        if (!season) return;
        if (season.is_current) { show('"' + season.name + '" is already the current season.', 'success'); return; }

        const btn = $('fxSeasonSetCurrent');
        btn.disabled = true;
        const res = await NADARL.setCurrentSeason(season.id);
        btn.disabled = false;
        if (!res.ok) { show('Could not set current season: ' + res.error, 'error'); return; }

        seasons = await NADARL.fetchSeasons();
        populateSeasons(season.id);
        show('"' + season.name + '" is now the current season.', 'success');
    }

    function wire() {
        $('fxAddSeason').addEventListener('click', createSeason);
        $('fxFillTestData').addEventListener('click', fillSeasonWithTestData);
        $('fxResetSeason').addEventListener('click', resetSeason);
        $('fxDeleteSeason').addEventListener('click', deleteSeason);
        $('fxSeasonSetCurrent').addEventListener('click', setCurrentSeason);
        $('fxSeasonMoveUp').addEventListener('click', () => moveSeason(-1));
        $('fxSeasonMoveDown').addEventListener('click', () => moveSeason(1));
        $('fxSeason').addEventListener('change', () => {
            updateSeasonMoveButtons();
            loadAllocatedMatchDayInfo();
        });
    }

    // Tops a team's roster up to 7 shooters with dummy "Test Shooter N"
    // entries if it has fewer, so every fixture has enough players for a
    // full card, then returns the roster (existing + newly added).
    async function ensureTeamRoster(teamId) {
        const roster = await NADARL.fetchShootersForTeam(teamId);
        while (roster.length < 7) {
            const res = await NADARL.addShooter(teamId, { name: `Test Shooter ${roster.length + 1}`, role: null });
            if (!res.ok) break; // don't loop forever if adding fails
            roster.push(res.shooter);
        }
        return roster;
    }

    // A random 7-shot card (0-10 per shot) for up to 7 shooters from the
    // given roster.
    function randomCard(roster) {
        return roster.slice(0, 7).map(s => {
            const shots = Array.from({ length: 7 }, () => Math.floor(Math.random() * 11));
            return {
                shooter_id: s.id,
                shots,
                total: shots.reduce((a, b) => a + b, 0),
                tens: shots.filter(v => v === 10).length
            };
        });
    }

    // Generates and submits a full scorecard for every not-yet-submitted
    // fixture in the selected season - for testing season-to-season
    // behaviour (stats, handicaps, personal bests) without waiting for a
    // real season to be played. Already-submitted matches are left alone,
    // as are BYE weeks (nothing to score).
    async function fillSeasonWithTestData() {
        const season = selectedSeason();
        if (!season) { show('No season selected.', 'error'); return; }

        if (!confirm(
            'Fill season "' + season.name + '" with randomly generated test data? ' +
            'This tops up any team with fewer than 7 players with dummy "Test Shooter" entries, then ' +
            'generates and submits a full scorecard for every fixture in this season that isn\'t already ' +
            'submitted. Already-submitted matches are left untouched. For testing only - use Reset Season ' +
            'afterwards to clear it back out.'
        )) return;

        const btn = $('fxFillTestData');
        btn.disabled = true;
        show('Filling "' + season.name + '" with test data - this can take a while for a full season…', 'success');

        const [teams, fixturesList, matchStatuses] = await Promise.all([
            NADARL.fetchTeams(),
            NADARL.fetchFixtures(season.id),
            NADARL.fetchSeasonMatchStatuses(season.id)
        ]);
        const submittedIds = new Set(matchStatuses.filter(m => m.submitted).map(m => m.id));
        const toFill = fixturesList.filter(f => !f.isBye && !submittedIds.has(f.id));

        if (!toFill.length) {
            btn.disabled = false;
            show('Nothing to fill - every fixture in "' + season.name + '" is already submitted (or the season has no matches).', 'success');
            return;
        }

        const teamIds = new Set();
        toFill.forEach(f => {
            const home = teams.find(t => t.name === f.homeTeam);
            const away = teams.find(t => t.name === f.awayTeam);
            if (home) teamIds.add(home.id);
            if (away) teamIds.add(away.id);
        });

        const rosters = {};
        for (const teamId of teamIds) {
            rosters[teamId] = await ensureTeamRoster(teamId);
        }

        let filled = 0;
        const failures = [];
        for (const f of toFill) {
            const home = teams.find(t => t.name === f.homeTeam);
            const away = teams.find(t => t.name === f.awayTeam);
            if (!home || !away) {
                failures.push(`${f.homeTeam} vs ${f.awayTeam} (${f.date}): team not found`);
                continue;
            }

            const homeRes = await NADARL.saveTeamScores(f.id, home.id, randomCard(rosters[home.id]));
            const awayRes = await NADARL.saveTeamScores(f.id, away.id, randomCard(rosters[away.id]));
            if (!homeRes.ok || !awayRes.ok) {
                failures.push(`${f.homeTeam} vs ${f.awayTeam} (${f.date}): ` + (homeRes.error || awayRes.error));
                continue;
            }

            await NADARL.confirmMatchSide(f.id, 'home');
            await NADARL.confirmMatchSide(f.id, 'away');
            const submitRes = await NADARL.submitMatch(f.id);
            if (!submitRes.ok) {
                failures.push(`${f.homeTeam} vs ${f.awayTeam} (${f.date}): could not submit`);
                continue;
            }
            filled++;
        }

        btn.disabled = false;

        if (failures.length) {
            show(`Filled ${filled} of ${toFill.length} fixture(s). Failed: ` + failures.join('; '), filled ? 'success' : 'error');
        } else {
            show(`Filled and submitted ${filled} fixture(s) in "${season.name}" with test data.`, 'success');
        }
        await loadAllocatedMatchDayInfo();
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
    // season is actually done. seasonOverride lets admin-fixture-editor.js
    // (which has its own, independent season dropdown) refresh this for
    // whichever season it just changed matches in, rather than whatever
    // this panel's own dropdown happens to be showing.
    async function loadAllocatedMatchDayInfo(seasonOverride) {
        const box = $('fxAllocatedMatchDayInfo');
        box.innerHTML = '<span class="fx-hint">Loading…</span>';

        const season = seasonOverride || selectedSeason();
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

    // Exposed so admin-fixture-editor.js can refresh "Match Days Allocated"
    // after adding/deleting matches, without the two modules needing to
    // share any other state.
    return { init, refreshAllocatedMatchDays: loadAllocatedMatchDayInfo };
})();

document.addEventListener('DOMContentLoaded', FixturesAdmin.init);
