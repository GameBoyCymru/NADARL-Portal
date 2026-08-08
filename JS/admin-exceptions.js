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
            save.disabled = true;
            const res = await NADARL.updateExclusion(e.id, {
                match_date: dateIn.value,
                reason: reasonIn.value.trim() || 'Bank holiday'
            });
            save.disabled = false;
            if (!res.ok || !res.count) {
                show('Could not save: ' + (res.error || '0 rows changed'), 'error');
                return;
            }
            show('Saved.', 'success');
            await load();
        });
        controls.appendChild(save);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'row-button row-button-secondary';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
            if (!confirm(
                'Remove this exception? Every fixture in this season after ' + formatDate(e.date) +
                ' will move a week earlier to close the gap.'
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
            show('Exception removed and later fixtures shifted a week earlier.', 'success');
            await load();
        });
        controls.appendChild(del);

        tdAction.appendChild(controls);
        tr.appendChild(tdAction);

        return tr;
    }

    function wire() {
        $('exSeason').addEventListener('change', load);

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
            show('Exception added and later fixtures shifted a week later.', 'success');
            await load();
        });
    }

    function formatDate(dateStr) {
        return new Date(dateStr + 'T00:00:00')
            .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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
