// =====================================================================
//  Admin fixture editor (admin only): manually create matches, and
//  correct an existing match's date or venue (postponements, venue
//  corrections). Editing venue sets a permanent per-match override (see
//  fixture_list) - it stops following the home team's registered venue
//  for that fixture from then on.
// =====================================================================

const FixtureEditorAdmin = (function () {
    let seasons = [];
    let teams = [];
    let fixturesList = [];

    function $(id) { return document.getElementById(id); }

    async function init() {
        const me = await NADARL.fetchMyProfile();
        if (!me || me.role !== 'admin') return;
        if (!$('fixtureEditorPanel')) return;

        seasons = await NADARL.fetchSeasons();
        teams = await NADARL.fetchTeams();
        populateSeasons();
        populateTeamSelects();
        await load();
        wire();
    }

    function selectedSeason() {
        const id = $('fxeSeason').value;
        return seasons.find(s => s.id === id) || seasons[0] || null;
    }

    function populateSeasons() {
        const sel = $('fxeSeason');
        sel.innerHTML = '';
        if (!seasons.length) {
            const o = document.createElement('option');
            o.value = '';
            o.textContent = 'Create a season first…';
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

    function populateTeamSelects() {
        const home = $('fxeNewHome');
        const away = $('fxeNewAway');
        home.innerHTML = '';
        away.innerHTML = '';

        const byeOpt = document.createElement('option');
        byeOpt.value = '';
        byeOpt.textContent = 'BYE (no match)';
        away.appendChild(byeOpt);

        teams.forEach(t => {
            const homeOpt = document.createElement('option');
            homeOpt.value = t.id;
            homeOpt.textContent = t.name;
            home.appendChild(homeOpt);

            const awayOpt = document.createElement('option');
            awayOpt.value = t.id;
            awayOpt.textContent = t.name;
            away.appendChild(awayOpt);
        });
    }

    async function load() {
        const season = selectedSeason();
        fixturesList = season ? await NADARL.fetchFixtures(season.id) : [];
        fixturesList.sort((a, b) => a.date.localeCompare(b.date));
        render();
    }

    function render() {
        const body = $('fxeBody');
        body.innerHTML = '';
        if (!fixturesList.length) {
            body.innerHTML = '<tr><td colspan="6" class="fx-hint">No fixtures for this season.</td></tr>';
            return;
        }
        let lastDate = null;
        let band = false;
        fixturesList.forEach(f => {
            if (f.date !== lastDate) { band = !band; lastDate = f.date; }
            body.appendChild(row(f, band));
        });
    }

    function row(f, band) {
        const tr = document.createElement('tr');
        tr.className = band ? 'fx-date-band-b' : 'fx-date-band-a';

        const tdHome = document.createElement('td');
        tdHome.textContent = f.homeTeam;
        tr.appendChild(tdHome);

        const tdAway = document.createElement('td');
        tdAway.textContent = f.isBye ? 'BYE' : f.awayTeam;
        tr.appendChild(tdAway);

        const dateIn = document.createElement('input');
        dateIn.type = 'date';
        dateIn.className = 'team-input';
        dateIn.value = f.date;
        const tdDate = document.createElement('td');
        tdDate.appendChild(dateIn);
        tr.appendChild(tdDate);

        const venueIn = document.createElement('input');
        venueIn.type = 'text';
        venueIn.className = 'team-input';
        venueIn.placeholder = f.venue || '';
        venueIn.value = f.venue || '';
        const tdVenue = document.createElement('td');
        tdVenue.appendChild(venueIn);
        tr.appendChild(tdVenue);

        const tdHalf = document.createElement('td');
        const half = document.createElement('span');
        half.className = 'fx-half-badge ' + (f.half === 2 ? 'fx-hc' : 'fx-wohc');
        half.textContent = f.half === 2 ? 'HC' : 'League';
        tdHalf.appendChild(half);
        tr.appendChild(tdHalf);

        const tdAction = document.createElement('td');
        const controls = document.createElement('div');
        controls.className = 'row-controls';

        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'row-button';
        save.textContent = 'Save';
        save.addEventListener('click', async () => {
            if (!dateIn.value) { show('Pick a date.', 'error'); return; }
            save.disabled = true;
            const res = await NADARL.updateMatchFixture(f.id, {
                match_date: dateIn.value,
                venue: venueIn.value.trim()
            });
            save.disabled = false;
            if (!res.ok || !res.count) {
                show('Could not save: ' + (res.error || '0 rows changed'), 'error');
                return;
            }
            show(`Saved ${f.homeTeam} vs ${f.isBye ? 'BYE' : f.awayTeam}.`, 'success');
            await load();
        });
        controls.appendChild(save);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'row-button row-button-secondary';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
            if (!confirm(
                `Delete the fixture ${f.homeTeam} vs ${f.isBye ? 'BYE' : f.awayTeam} on ${f.date}? ` +
                'This also deletes any scores entered for it. This cannot be undone.'
            )) return;
            del.disabled = true;
            const res = await NADARL.deleteMatch(f.id);
            del.disabled = false;
            if (!res.ok || !res.count) {
                show('Could not delete: ' + (res.error || '0 rows changed'), 'error');
                return;
            }
            show(`Deleted ${f.homeTeam} vs ${f.isBye ? 'BYE' : f.awayTeam}.`, 'success');
            await load();
        });
        controls.appendChild(del);

        tdAction.appendChild(controls);
        tr.appendChild(tdAction);

        return tr;
    }

    function wire() {
        $('fxeSeason').addEventListener('change', load);
        $('fxeDeleteAll').addEventListener('click', deleteAllFixtures);
        $('fxeAdd').addEventListener('click', addMatch);
    }

    // Manually add one match. Since teams can share a physical venue (so
    // whichever of them is "home" that day is the only one that can use it)
    // and a team obviously can't play twice in one day, both are checked
    // against the season's already-loaded fixture list before inserting -
    // a team clash is a hard stop, a venue clash is a confirm()-gated
    // warning since a shared venue might genuinely have two time slots.
    async function addMatch() {
        const season = selectedSeason();
        if (!season) { show('No season selected.', 'error'); return; }

        const date = $('fxeNewDate').value;
        const homeId = $('fxeNewHome').value;
        const awayId = $('fxeNewAway').value;
        const half = Number($('fxeNewHalf').value);
        const venue = $('fxeNewVenue').value.trim();

        if (!date) { show('Pick a date.', 'error'); return; }
        if (!homeId) { show('Pick a home team.', 'error'); return; }
        if (homeId === awayId) { show('Home and away can\'t be the same team.', 'error'); return; }

        const homeTeam = teams.find(t => t.id === homeId);
        const awayTeam = awayId ? teams.find(t => t.id === awayId) : null;
        const effectiveVenue = venue || (homeTeam ? homeTeam.venue : '');

        const sameDay = fixturesList.filter(f => f.date === date);

        // Whichever of the two new teams (if either) already has a fixture
        // that day, and who they're playing.
        let teamClash = null;
        for (const f of sameDay) {
            const opponent = f.isBye ? 'BYE' : f.awayTeam;
            if (f.homeTeam === homeTeam.name || f.awayTeam === homeTeam.name) {
                teamClash = { team: homeTeam.name, opponent: f.homeTeam === homeTeam.name ? opponent : f.homeTeam };
                break;
            }
            if (awayTeam && (f.homeTeam === awayTeam.name || f.awayTeam === awayTeam.name)) {
                teamClash = { team: awayTeam.name, opponent: f.homeTeam === awayTeam.name ? opponent : f.homeTeam };
                break;
            }
        }
        if (teamClash) {
            show(
                teamClash.team + ' is already scheduled to play on ' + date + ' (vs ' + teamClash.opponent +
                '). A team can\'t play twice on the same day.',
                'error'
            );
            return;
        }

        const venueClash = sameDay.find(f => !f.isBye && f.venue && effectiveVenue && f.venue === effectiveVenue);
        if (venueClash) {
            const proceed = confirm(
                '"' + effectiveVenue + '" is already in use on ' + date + ' for ' + venueClash.homeTeam + ' vs ' +
                venueClash.awayTeam + '. Add this match anyway?'
            );
            if (!proceed) return;
        }

        const btn = $('fxeAdd');
        btn.disabled = true;
        const res = await NADARL.addMatch({
            season_id: season.id,
            match_date: date,
            home_team_id: homeId,
            away_team_id: awayId || null,
            venue,
            half
        });
        btn.disabled = false;
        if (!res.ok) {
            show('Could not add match: ' + (res.error || 'unknown') + '.', 'error');
            return;
        }

        $('fxeNewDate').value = '';
        $('fxeNewVenue').value = '';
        show('Added ' + homeTeam.name + ' vs ' + (awayTeam ? awayTeam.name : 'BYE') + '.', 'success');
        await load();
    }

    async function deleteAllFixtures() {
        const season = selectedSeason();
        if (!season) { show('No season selected.', 'error'); return; }
        if (!confirm(
            'Permanently delete every fixture (and any scores) for season "' + season.name + '"? ' +
            'This cannot be undone.'
        )) return;

        const btn = $('fxeDeleteAll');
        btn.disabled = true;
        const res = await NADARL.clearMatches(season.id);
        btn.disabled = false;
        if (!res.ok) { show('Could not delete fixtures: ' + res.error, 'error'); return; }

        show('Deleted ' + (res.count || 0) + ' fixture(s) from "' + season.name + '".', 'success');
        await load();
    }

    function show(text, type) {
        const el = $('fxeMessage');
        el.textContent = text;
        el.className = 'login-message login-message-' + (type || '');
        el.hidden = false;
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', FixtureEditorAdmin.init);
