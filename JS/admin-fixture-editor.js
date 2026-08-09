// =====================================================================
//  Admin fixture editor (admin only): correct an existing match's date
//  or venue (postponements, venue corrections). Editing venue sets a
//  permanent per-match override (see fixture_list) - it stops following
//  the home team's registered venue for that fixture from then on.
// =====================================================================

const FixtureEditorAdmin = (function () {
    let seasons = [];
    let fixturesList = [];

    function $(id) { return document.getElementById(id); }

    async function init() {
        const me = await NADARL.fetchMyProfile();
        if (!me || me.role !== 'admin') return;
        if (!$('fixtureEditorPanel')) return;

        seasons = await NADARL.fetchSeasons();
        populateSeasons();
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
        fixturesList.forEach(f => body.appendChild(row(f)));
    }

    function row(f) {
        const tr = document.createElement('tr');

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
        tdAction.appendChild(save);
        tr.appendChild(tdAction);

        return tr;
    }

    function wire() {
        $('fxeSeason').addEventListener('change', load);
        $('fxeDeleteAll').addEventListener('click', deleteAllFixtures);
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
