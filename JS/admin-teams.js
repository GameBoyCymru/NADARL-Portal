document.addEventListener('DOMContentLoaded', () => {
    const adminPanel = document.getElementById('adminPanel');
    const teamsBody = document.getElementById('teamsBody');
    const message = document.getElementById('teamsMessage');
    const addBtn = document.getElementById('teamsAdd');
    const nameInput = document.getElementById('teamNewName');
    const venueInput = document.getElementById('teamNewVenue');
    const slugInput = document.getElementById('teamNewSlug');

    if (!window.db || !teamsBody) return;

    let teams = [];

    init();

    async function init() {
        const me = await NADARL.fetchMyProfile();
        if (!me || me.role !== 'admin') return;
        if (typeof NADARL.addTeam !== 'function' ||
            typeof NADARL.updateTeam !== 'function' ||
            typeof NADARL.deleteTeam !== 'function') {
            showMessage(
                'Team tools failed to load — your browser is using a cached ' +
                'copy of data.js. Please hard-refresh (Ctrl/Cmd+Shift+R).',
                'error'
            );
            return;
        }
        await load();
    }

    async function load() {
        teams = await NADARL.fetchTeams();
        render();
    }

    function render() {
        teamsBody.innerHTML = '';
        teams.forEach(t => teamsBody.appendChild(row(t)));
    }

    function row(t) {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        const nameIn = document.createElement('input');
        nameIn.type = 'text';
        nameIn.className = 'team-input';
        nameIn.value = t.name || '';
        nameIn.maxLength = 100;
        tdName.appendChild(nameIn);
        tr.appendChild(tdName);

        const tdVenue = document.createElement('td');
        const venueIn = document.createElement('input');
        venueIn.type = 'text';
        venueIn.className = 'team-input';
        venueIn.value = t.venue || '';
        venueIn.maxLength = 100;
        tdVenue.appendChild(venueIn);
        tr.appendChild(tdVenue);

        const tdSlug = document.createElement('td');
        const slugIn = document.createElement('input');
        slugIn.type = 'text';
        slugIn.className = 'team-input';
        slugIn.value = t.slug || '';
        slugIn.maxLength = 100;
        tdSlug.appendChild(slugIn);
        tr.appendChild(tdSlug);

        const tdAction = document.createElement('td');
        const controls = document.createElement('div');
        controls.className = 'row-controls';

        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'row-button';
        save.textContent = 'Save';
        save.addEventListener('click', async () => {
            if (!nameIn.value.trim() || !venueIn.value.trim() || !slugIn.value.trim()) {
                showMessage('Name, venue and slug are all required.', 'error');
                return;
            }
            save.disabled = true;
            const res = await NADARL.updateTeam(t.id, {
                name: nameIn.value,
                venue: venueIn.value,
                slug: slugIn.value
            });
            save.disabled = false;
            if (res.ok && res.count > 0) {
                t.name = nameIn.value.trim();
                t.venue = venueIn.value.trim();
                t.slug = slugIn.value.trim();
                showMessage('Updated ' + t.name + '.', 'success');
                await load();
            } else {
                showMessage(
                    'Update failed (' + (res.count === 0 ? '0 rows changed' : (res.error || 'unknown')) + ').',
                    'error'
                );
            }
        });
        controls.appendChild(save);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'row-button row-button-secondary';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
            if (!confirm('Delete team "' + t.name + '"? This cannot be undone.')) return;
            del.disabled = true;
            const res = await NADARL.deleteTeam(t.id);
            del.disabled = false;
            if (res.ok && res.count > 0) {
                showMessage('Deleted ' + t.name + '.', 'success');
                await load();
            } else {
                showMessage(
                    'Delete failed (' + (res.count === 0 ? '0 rows changed' : (res.error || 'unknown')) +
                    '). The team may still have shooters or matches assigned.',
                    'error'
                );
            }
        });
        controls.appendChild(del);

        tdAction.appendChild(controls);
        tr.appendChild(tdAction);

        return tr;
    }

    addBtn.addEventListener('click', async () => {
        if (!nameInput.value.trim() || !venueInput.value.trim() || !slugInput.value.trim()) {
            showMessage('Name, venue and slug are all required.', 'error');
            return;
        }
        addBtn.disabled = true;
        const res = await NADARL.addTeam({
            name: nameInput.value,
            venue: venueInput.value,
            slug: slugInput.value
        });
        addBtn.disabled = false;
        if (res.ok) {
            nameInput.value = '';
            venueInput.value = '';
            slugInput.value = '';
            showMessage('Added team "' + res.team.name + '".', 'success');
            await load();
        } else {
            showMessage('Add failed: ' + (res.error || 'unknown') + '.', 'error');
        }
    });

    function showMessage(text, type) {
        message.textContent = text;
        message.className = 'login-message login-message-' + type;
        message.hidden = false;
    }
});
