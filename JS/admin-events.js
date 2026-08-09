// =====================================================================
//  Admin events panel (admin only): event create/edit/delete. Purely
//  informational entries - no results, unlike competitions.
//  Adding, moving or deleting an event only shifts fixtures that are
//  actually in the way of its date - a week later to make room, or a
//  week earlier to close the gap - see shiftSeasonFixtures in data.js.
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
        let lastDate = null;
        let band = false;
        events.forEach(e => {
            if (e.date !== lastDate) { band = !band; lastDate = e.date; }
            body.appendChild(row(e, band));
        });
    }

    function row(e, band) {
        const tr = document.createElement('tr');
        tr.className = band ? 'fx-date-band-b' : 'fx-date-band-a';

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
            const dateChanged = dateIn.value !== e.date;
            save.disabled = true;

            // Moving an event is a close-the-old-gap + make-room-at-the-new-
            // date pair, same as a delete followed by an add.
            let shifted = 0;
            if (dateChanged) {
                const closeRes = await NADARL.shiftSeasonFixtures(e.seasonId, e.date, -SHIFT_DAYS);
                if (!closeRes.ok) {
                    save.disabled = false;
                    show('Could not close the gap at the old date: ' + closeRes.error, 'error');
                    return;
                }
                shifted += closeRes.count;
            }

            const res = await NADARL.updateEvent(e.id, {
                event_date: dateIn.value,
                name: nameIn.value.trim(),
                venue: venueIn.value.trim(),
                attire: attireIn.value.trim(),
                description: descIn.value.trim()
            });
            if (!res.ok || !res.count) {
                save.disabled = false;
                show('Could not save: ' + (res.error || '0 rows changed'), 'error');
                return;
            }

            if (dateChanged) {
                const makeRoomRes = await NADARL.shiftSeasonFixtures(e.seasonId, dateIn.value, SHIFT_DAYS);
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
                'Delete event "' + e.name + '"? If a fixture is scheduled the week after, it (and any ' +
                'run right behind it) will move a week earlier to close the gap. This cannot be undone.'
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
            show('Deleted "' + e.name + '"' + shiftSuffix(shiftRes.count, 'a week earlier') + '.', 'success');
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
        $('evDeleteAll').addEventListener('click', deleteAllEvents);

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
            show('Added "' + name + '"' + shiftSuffix(shiftRes.count, 'forward a week') + '.', 'success');
            await load();
        });
    }

    // '' if nothing moved, else ' and shifted N fixture(s) <direction>'.
    function shiftSuffix(count, direction) {
        if (!count) return '';
        return ' and shifted ' + count + ' fixture' + (count === 1 ? '' : 's') + ' ' + direction;
    }

    async function deleteAllEvents() {
        const season = selectedSeason();
        if (!season) { show('No season selected.', 'error'); return; }
        if (!confirm(
            'Permanently delete every event for season "' + season.name + '"? Fixtures are not shifted ' +
            'back automatically - check the schedule afterwards. This cannot be undone.'
        )) return;

        const btn = $('evDeleteAll');
        btn.disabled = true;
        const res = await NADARL.clearEvents(season.id);
        btn.disabled = false;
        if (!res.ok) { show('Could not delete events: ' + res.error, 'error'); return; }

        show('Deleted ' + (res.count || 0) + ' event(s) from "' + season.name + '".', 'success');
        await load();
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
