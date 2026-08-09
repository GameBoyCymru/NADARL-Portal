// =====================================================================
//  Admin competitions panel (admin only): competition create/edit/delete.
//  Results entry (shooters + scores) happens on competition.html itself,
//  not here - this panel only owns the competition's own metadata.
//  Adding, moving or deleting a competition only shifts fixtures that are
//  actually in the way of its date - a week later to make room, or a
//  week earlier to close the gap - see shiftSeasonFixtures in data.js.
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
        let lastDate = null;
        let band = false;
        competitions.forEach(c => {
            if (c.date !== lastDate) { band = !band; lastDate = c.date; }
            body.appendChild(row(c, band));
        });
    }

    function row(c, band) {
        const tr = document.createElement('tr');
        tr.className = band ? 'fx-date-band-b' : 'fx-date-band-a';

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
            const dateChanged = dateIn.value !== c.date;
            save.disabled = true;

            // Moving a competition is a close-the-old-gap + make-room-at-the-
            // new-date pair, same as a delete followed by an add.
            let shifted = 0;
            if (dateChanged) {
                const closeRes = await NADARL.shiftSeasonFixtures(c.seasonId, c.date, -SHIFT_DAYS);
                if (!closeRes.ok) {
                    save.disabled = false;
                    show('Could not close the gap at the old date: ' + closeRes.error, 'error');
                    return;
                }
                shifted += closeRes.count;
            }

            const res = await NADARL.updateCompetition(c.id, {
                event_date: dateIn.value,
                name: nameIn.value.trim(),
                venue: venueIn.value.trim(),
                description: descIn.value.trim()
            });
            if (!res.ok || !res.count) {
                save.disabled = false;
                show('Could not save: ' + (res.error || '0 rows changed'), 'error');
                return;
            }

            if (dateChanged) {
                const makeRoomRes = await NADARL.shiftSeasonFixtures(c.seasonId, dateIn.value, SHIFT_DAYS);
                if (!makeRoomRes.ok) {
                    save.disabled = false;
                    show('Saved, but could not make room at the new date: ' + makeRoomRes.error, 'error');
                    await load();
                    return;
                }
                shifted += makeRoomRes.count;
            }

            save.disabled = false;
            show('Saved "' + nameIn.value.trim() + '"' + shiftSuffix(shifted, 'to match the new date') + '.', 'success');
            await load();
        });
        controls.appendChild(save);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'row-button row-button-secondary';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
            if (!confirm(
                'Delete competition "' + c.name + '" and all its results? If a fixture is scheduled ' +
                'the week after, it (and any run right behind it) will move a week earlier to close ' +
                'the gap. This cannot be undone.'
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
            show('Deleted "' + c.name + '"' + shiftSuffix(shiftRes.count, 'a week earlier') + '.', 'success');
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
        $('compDeleteAll').addEventListener('click', deleteAllCompetitions);

        $('compAdd').addEventListener('click', async () => {
            const season = selectedSeason();
            if (!season) { show('No season selected.', 'error'); return; }
            const date = $('compNewDate').value;
            const name = $('compNewName').value.trim();
            if (!date || !name) { show('Date and name are required.', 'error'); return; }

            const occupants = await NADARL.fetchDateOccupants(season.id, date);
            const conflicts = conflictLabels(occupants, 'competition');
            if (conflicts.length && !confirm(
                date + ' already has ' + conflicts.join(' and ') + ' scheduled. Add this competition anyway?'
            )) return;

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
            show('Added "' + name + '"' + shiftSuffix(shiftRes.count, 'forward a week') + '.', 'success');
            await load();
        });
    }

    // '' if nothing moved, else ' and shifted N fixture(s) <direction>'.
    function shiftSuffix(count, direction) {
        if (!count) return '';
        return ' and shifted ' + count + ' fixture' + (count === 1 ? '' : 's') + ' ' + direction;
    }

    // Which other entry types already occupy the chosen date, for the
    // conflict warning below - same-type occupancy (another competition
    // that day) isn't a conflict, so excludeType is left out of the result.
    function conflictLabels(occupants, excludeType) {
        const labels = { match: 'a Match', exception: 'an Exception', competition: 'a Competition', event: 'an Event' };
        return Object.keys(labels)
            .filter(k => k !== excludeType && occupants[k])
            .map(k => labels[k]);
    }

    async function deleteAllCompetitions() {
        const season = selectedSeason();
        if (!season) { show('No season selected.', 'error'); return; }
        if (!confirm(
            'Permanently delete every competition (and all their results) for season "' + season.name +
            '"? Fixtures are not shifted back automatically - check the schedule afterwards. This cannot be undone.'
        )) return;

        const btn = $('compDeleteAll');
        btn.disabled = true;
        const res = await NADARL.clearCompetitions(season.id);
        btn.disabled = false;
        if (!res.ok) { show('Could not delete competitions: ' + res.error, 'error'); return; }

        show('Deleted ' + (res.count || 0) + ' competition(s) from "' + season.name + '".', 'success');
        await load();
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
