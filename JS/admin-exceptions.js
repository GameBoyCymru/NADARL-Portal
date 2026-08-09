// =====================================================================
//  Admin exceptions panel (admin only): no-match Monday CRUD, same
//  row-editable table pattern as Competitions/Events. Adding or deleting
//  an exception shifts that season's remaining fixtures by a week
//  (forward to make room / backward to close the gap) so the weekly
//  schedule stays contiguous - see shiftSeasonFixtures in data.js.
// =====================================================================

const ExceptionsAdmin = (function () {
    const SHIFT_DAYS = 7;

    let seasons = [];
    let exclusions = [];

    function $(id) { return document.getElementById(id); }

    async function init() {
        const me = await NADARL.fetchMyProfile();
        if (!me || me.role !== 'admin') return;
        if (!$('exceptionsPanel')) return;

        seasons = await NADARL.fetchSeasons();
        populateSeasons();
        await load();
        wire();
    }

    function selectedSeason() {
        const id = $('exSeason').value;
        return seasons.find(s => s.id === id) || seasons[0] || null;
    }

    function populateSeasons() {
        const sel = $('exSeason');
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
        const all = await NADARL.fetchExclusions();
        exclusions = season ? all.filter(e => e.season_id === season.id) : [];
        render();
    }

    function render() {
        const body = $('exBody');
        body.innerHTML = '';
        if (!exclusions.length) {
            body.innerHTML = '<tr><td colspan="3" class="fx-hint">No exceptions for this season.</td></tr>';
            return;
        }
        exclusions.forEach(e => body.appendChild(row(e)));
    }

    function row(e) {
        const tr = document.createElement('tr');

        const dateIn = document.createElement('input');
        dateIn.type = 'date';
        dateIn.className = 'team-input';
        dateIn.value = e.date;
        const tdDate = document.createElement('td');
        tdDate.appendChild(dateIn);
        tr.appendChild(tdDate);

        const reasonIn = document.createElement('input');
        reasonIn.type = 'text';
        reasonIn.className = 'team-input';
        reasonIn.value = e.reason || '';
        const tdReason = document.createElement('td');
        tdReason.appendChild(reasonIn);
        tr.appendChild(tdReason);

        const tdAction = document.createElement('td');
        const controls = document.createElement('div');
        controls.className = 'row-controls';

        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'row-button';
        save.textContent = 'Save';
        save.addEventListener('click', async () => {
            if (!dateIn.value) { show('Pick a date.', 'error'); return; }
            const dateChanged = dateIn.value !== e.date;
            save.disabled = true;

            // Moving an exception is a close-the-old-gap + make-room-at-the-new-
            // date pair, same as a delete followed by an add.
            let shifted = 0;
            if (dateChanged) {
                const closeRes = await NADARL.shiftSeasonFixtures(e.season_id, e.date, -SHIFT_DAYS);
                if (!closeRes.ok) {
                    save.disabled = false;
                    show('Could not close the gap at the old date: ' + closeRes.error, 'error');
                    return;
                }
                shifted += closeRes.count;
            }

            const res = await NADARL.updateExclusion(e.id, {
                match_date: dateIn.value,
                reason: reasonIn.value.trim() || 'Bank holiday'
            });
            if (!res.ok || !res.count) {
                save.disabled = false;
                show('Could not save: ' + (res.error || '0 rows changed'), 'error');
                return;
            }

            if (dateChanged) {
                const makeRoomRes = await NADARL.shiftSeasonFixtures(e.season_id, dateIn.value, SHIFT_DAYS);
                if (!makeRoomRes.ok) {
                    save.disabled = false;
                    show('Saved, but could not make room at the new date: ' + makeRoomRes.error, 'error');
                    await load();
                    return;
                }
                shifted += makeRoomRes.count;
            }

            save.disabled = false;
            show('Saved' + shiftSuffix(shifted, 'to match the new date') + '.', 'success');
            await load();
        });
        controls.appendChild(save);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'row-button row-button-secondary';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
            if (!confirm(
                'Remove this exception? If a fixture is scheduled the week after, it (and any run of ' +
                'fixtures right behind it) will move a week earlier to close the gap.'
            )) return;
            del.disabled = true;
            const res = await NADARL.deleteExclusion(e.season_id, e.date);
            if (!res.ok) {
                del.disabled = false;
                show('Could not delete: ' + res.error, 'error');
                return;
            }
            const shiftRes = await NADARL.shiftSeasonFixtures(e.season_id, e.date, -SHIFT_DAYS);
            del.disabled = false;
            if (!shiftRes.ok) {
                show('Exception removed, but fixtures could not be shifted: ' + shiftRes.error, 'error');
                await load();
                return;
            }
            show('Exception removed' + shiftSuffix(shiftRes.count, 'a week earlier') + '.', 'success');
            await load();
        });
        controls.appendChild(del);

        tdAction.appendChild(controls);
        tr.appendChild(tdAction);

        return tr;
    }

    function wire() {
        $('exSeason').addEventListener('change', load);
        $('exDeleteAll').addEventListener('click', deleteAllExceptions);

        $('exAdd').addEventListener('click', async () => {
            const season = selectedSeason();
            if (!season) { show('No season selected.', 'error'); return; }
            const date = $('exNewDate').value;
            const reason = $('exNewReason').value.trim();
            if (!date) { show('Pick a date.', 'error'); return; }

            const btn = $('exAdd');
            btn.disabled = true;

            const shiftRes = await NADARL.shiftSeasonFixtures(season.id, date, SHIFT_DAYS);
            if (!shiftRes.ok) {
                btn.disabled = false;
                show('Could not make room in the schedule: ' + shiftRes.error, 'error');
                return;
            }

            const res = await NADARL.insertExclusions([{
                season_id: season.id,
                match_date: date,
                reason: reason || 'Bank holiday'
            }]);
            btn.disabled = false;
            if (!res.ok) { show('Could not add exception: ' + res.error, 'error'); return; }

            $('exNewDate').value = '';
            $('exNewReason').value = '';
            show('Exception added' + shiftSuffix(shiftRes.count, 'forward a week') + '.', 'success');
            await load();
        });
    }

    // '' if nothing moved, else ' and shifted N fixture(s) <direction>'.
    function shiftSuffix(count, direction) {
        if (!count) return '';
        return ' and shifted ' + count + ' fixture' + (count === 1 ? '' : 's') + ' ' + direction;
    }

    async function deleteAllExceptions() {
        const season = selectedSeason();
        if (!season) { show('No season selected.', 'error'); return; }
        if (!confirm(
            'Permanently delete every exception for season "' + season.name + '"? Fixtures are not ' +
            'shifted back automatically - check the schedule afterwards. This cannot be undone.'
        )) return;

        const btn = $('exDeleteAll');
        btn.disabled = true;
        const res = await NADARL.clearExclusions(season.id);
        btn.disabled = false;
        if (!res.ok) { show('Could not delete exceptions: ' + res.error, 'error'); return; }

        show('Deleted ' + (res.count || 0) + ' exception(s) from "' + season.name + '".', 'success');
        await load();
    }

    function show(text, type) {
        const el = $('exMessage');
        el.textContent = text;
        el.className = 'login-message login-message-' + (type || '');
        el.hidden = false;
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', ExceptionsAdmin.init);
