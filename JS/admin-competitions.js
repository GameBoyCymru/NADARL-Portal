// =====================================================================
//  Admin competitions panel (admin only): competition create/edit/delete.
//  Results entry (shooters + scores) happens on competition.html itself,
//  not here - this panel only owns the competition's own metadata.
//  Adding or deleting a competition shifts that season's remaining
//  fixtures by a week (forward to make room / backward to close the gap)
//  so the weekly schedule stays contiguous - see shiftSeasonFixtures.
// =====================================================================

const CompetitionsAdmin = (function () {
    const SHIFT_DAYS = 7;

    let seasons = [];
    let competitions = [];

    function $(id) { return document.getElementById(id); }

    async function init() {
        const me = await NADARL.fetchMyProfile();
        if (!me || me.role !== 'admin') return;
        if (!$('competitionsPanel')) return;

        seasons = await NADARL.fetchSeasons();
        populateSeasons();
        await load();
        wire();
    }

    function selectedSeason() {
        const id = $('compSeason').value;
        return seasons.find(s => s.id === id) || seasons[0] || null;
    }

    function populateSeasons() {
        const sel = $('compSeason');
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
        competitions = season ? await NADARL.fetchCompetitions(season.id) : [];
        render();
    }

    function render() {
        const body = $('compBody');
        body.innerHTML = '';
        if (!competitions.length) {
            body.innerHTML = '<tr><td colspan="5" class="fx-hint">No competitions for this season.</td></tr>';
            return;
        }
        competitions.forEach(c => body.appendChild(row(c)));
    }

    function row(c) {
        const tr = document.createElement('tr');

        const dateIn = textInput(c.date, 'date');
        const nameIn = textInput(c.name);
        const venueIn = textInput(c.venue || '');
        const descIn = textInput(c.description || '');

        [dateIn, nameIn, venueIn, descIn].forEach(input => {
            const td = document.createElement('td');
            td.appendChild(input);
            tr.appendChild(td);
        });

        const tdAction = document.createElement('td');
        const controls = document.createElement('div');
        controls.className = 'row-controls';

        const results = document.createElement('a');
        results.className = 'row-button row-button-secondary';
        results.textContent = 'Results';
        results.href = `competition.html?id=${encodeURIComponent(c.id)}`;
        controls.appendChild(results);

        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'row-button';
        save.textContent = 'Save';
        save.addEventListener('click', async () => {
            if (!dateIn.value || !nameIn.value.trim()) {
                show('Date and name are required.', 'error');
                return;
            }
            save.disabled = true;
            const res = await NADARL.updateCompetition(c.id, {
                event_date: dateIn.value,
                name: nameIn.value.trim(),
                venue: venueIn.value.trim(),
                description: descIn.value.trim()
            });
            save.disabled = false;
            if (!res.ok || !res.count) {
                show('Could not save: ' + (res.error || '0 rows changed'), 'error');
                return;
            }
            show('Saved "' + nameIn.value.trim() + '".', 'success');
            await load();
        });
        controls.appendChild(save);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'row-button row-button-secondary';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
            if (!confirm(
                'Delete competition "' + c.name + '" and all its results? Every fixture in this ' +
                'season after ' + c.date + ' will move a week earlier to close the gap. This cannot be undone.'
            )) return;
            del.disabled = true;
            const res = await NADARL.deleteCompetition(c.id);
            if (!res.ok || !res.count) {
                del.disabled = false;
                show('Could not delete: ' + (res.error || '0 rows changed'), 'error');
                return;
            }
            const shiftRes = await NADARL.shiftSeasonFixtures(c.seasonId, c.date, -SHIFT_DAYS);
            del.disabled = false;
            if (!shiftRes.ok) {
                show('Competition deleted, but fixtures could not be shifted: ' + shiftRes.error, 'error');
                await load();
                return;
            }
            show('Deleted "' + c.name + '" and shifted later fixtures a week earlier.', 'success');
            await load();
        });
        controls.appendChild(del);

        tdAction.appendChild(controls);
        tr.appendChild(tdAction);

        return tr;
    }

    function textInput(value, type) {
        const input = document.createElement('input');
        input.type = type || 'text';
        input.className = 'team-input';
        input.value = value || '';
        return input;
    }

    function wire() {
        $('compSeason').addEventListener('change', load);

        $('compAdd').addEventListener('click', async () => {
            const season = selectedSeason();
            if (!season) { show('No season selected.', 'error'); return; }
            const date = $('compNewDate').value;
            const name = $('compNewName').value.trim();
            if (!date || !name) { show('Date and name are required.', 'error'); return; }

            const btn = $('compAdd');
            btn.disabled = true;

            const shiftRes = await NADARL.shiftSeasonFixtures(season.id, date, SHIFT_DAYS);
            if (!shiftRes.ok) {
                btn.disabled = false;
                show('Could not make room in the schedule: ' + shiftRes.error, 'error');
                return;
            }

            const res = await NADARL.addCompetition({
                season_id: season.id,
                event_date: date,
                name,
                venue: $('compNewVenue').value.trim(),
                description: $('compNewDesc').value.trim()
            });
            btn.disabled = false;
            if (!res.ok) { show('Could not add competition: ' + res.error, 'error'); return; }

            $('compNewDate').value = '';
            $('compNewName').value = '';
            $('compNewVenue').value = '';
            $('compNewDesc').value = '';
            show('Added "' + name + '" and shifted later fixtures a week later.', 'success');
            await load();
        });
    }

    function show(text, type) {
        const el = $('compMessage');
        el.textContent = text;
        el.className = 'login-message login-message-' + (type || '');
        el.hidden = false;
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', CompetitionsAdmin.init);
