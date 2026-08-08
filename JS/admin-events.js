// =====================================================================
//  Admin events panel (admin only): event create/edit/delete. Purely
//  informational entries - no results, unlike competitions.
//  Adding or deleting an event shifts that season's remaining fixtures
//  by a week (forward to make room / backward to close the gap) so the
//  weekly schedule stays contiguous - see shiftSeasonFixtures.
// =====================================================================

const EventsAdmin = (function () {
    const SHIFT_DAYS = 7;

    let seasons = [];
    let events = [];

    function $(id) { return document.getElementById(id); }

    async function init() {
        const me = await NADARL.fetchMyProfile();
        if (!me || me.role !== 'admin') return;
        if (!$('eventsPanel')) return;

        seasons = await NADARL.fetchSeasons();
        populateSeasons();
        await load();
        wire();
    }

    function selectedSeason() {
        const id = $('evSeason').value;
        return seasons.find(s => s.id === id) || seasons[0] || null;
    }

    function populateSeasons() {
        const sel = $('evSeason');
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
        events = season ? await NADARL.fetchEvents(season.id) : [];
        render();
    }

    function render() {
        const body = $('evBody');
        body.innerHTML = '';
        if (!events.length) {
            body.innerHTML = '<tr><td colspan="6" class="fx-hint">No events for this season.</td></tr>';
            return;
        }
        events.forEach(e => body.appendChild(row(e)));
    }

    function row(e) {
        const tr = document.createElement('tr');

        const dateIn = textInput(e.date, 'date');
        const nameIn = textInput(e.name);
        const venueIn = textInput(e.venue || '');
        const attireIn = textInput(e.attire || '');
        const descIn = textInput(e.description || '');

        [dateIn, nameIn, venueIn, attireIn, descIn].forEach(input => {
            const td = document.createElement('td');
            td.appendChild(input);
            tr.appendChild(td);
        });

        const tdAction = document.createElement('td');
        const controls = document.createElement('div');
        controls.className = 'row-controls';

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
            const res = await NADARL.updateEvent(e.id, {
                event_date: dateIn.value,
                name: nameIn.value.trim(),
                venue: venueIn.value.trim(),
                attire: attireIn.value.trim(),
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
                'Delete event "' + e.name + '"? Every fixture in this season after ' + e.date +
                ' will move a week earlier to close the gap. This cannot be undone.'
            )) return;
            del.disabled = true;
            const res = await NADARL.deleteEvent(e.id);
            if (!res.ok || !res.count) {
                del.disabled = false;
                show('Could not delete: ' + (res.error || '0 rows changed'), 'error');
                return;
            }
            const shiftRes = await NADARL.shiftSeasonFixtures(e.seasonId, e.date, -SHIFT_DAYS);
            del.disabled = false;
            if (!shiftRes.ok) {
                show('Event deleted, but fixtures could not be shifted: ' + shiftRes.error, 'error');
                await load();
                return;
            }
            show('Deleted "' + e.name + '" and shifted later fixtures a week earlier.', 'success');
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
        $('evSeason').addEventListener('change', load);

        $('evAdd').addEventListener('click', async () => {
            const season = selectedSeason();
            if (!season) { show('No season selected.', 'error'); return; }
            const date = $('evNewDate').value;
            const name = $('evNewName').value.trim();
            if (!date || !name) { show('Date and name are required.', 'error'); return; }

            const btn = $('evAdd');
            btn.disabled = true;

            const shiftRes = await NADARL.shiftSeasonFixtures(season.id, date, SHIFT_DAYS);
            if (!shiftRes.ok) {
                btn.disabled = false;
                show('Could not make room in the schedule: ' + shiftRes.error, 'error');
                return;
            }

            const res = await NADARL.addEvent({
                season_id: season.id,
                event_date: date,
                name,
                venue: $('evNewVenue').value.trim(),
                attire: $('evNewAttire').value.trim(),
                description: $('evNewDesc').value.trim()
            });
            btn.disabled = false;
            if (!res.ok) { show('Could not add event: ' + res.error, 'error'); return; }

            $('evNewDate').value = '';
            $('evNewName').value = '';
            $('evNewVenue').value = '';
            $('evNewAttire').value = '';
            $('evNewDesc').value = '';
            show('Added "' + name + '" and shifted later fixtures a week later.', 'success');
            await load();
        });
    }

    function show(text, type) {
        const el = $('evMessage');
        el.textContent = text;
        el.className = 'login-message login-message-' + (type || '');
        el.hidden = false;
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', EventsAdmin.init);
