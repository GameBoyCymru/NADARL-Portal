document.addEventListener('DOMContentLoaded', () => {
    const accessPanel = document.getElementById('accessPanel');
    const adminPanel = document.getElementById('adminPanel');
    const profilesBody = document.getElementById('profilesBody');
    const message = document.getElementById('adminMessage');

    if (!window.db) {
        showMessage('Unable to connect to the league database.', 'error');
        return;
    }

    let teams = [];
    let profiles = [];

    init();

    async function init() {
        const me = await NADARL.fetchMyProfile();
        if (!me || me.role !== 'admin') {
            accessPanel.hidden = false;
            adminPanel.hidden = true;
            return;
        }
        accessPanel.hidden = true;
        adminPanel.hidden = false;
        setupAuthButton();
        await load();
    }

    function setupAuthButton() {
        const authButton = document.getElementById('authButton');
        if (!authButton) return;
        authButton.hidden = false;
        authButton.onclick = async () => {
            authButton.disabled = true;
            await window.db.auth.signOut();
            window.location.href = 'fixtures.html';
        };
    }

    async function load() {
        teams = await NADARL.fetchTeams();
        profiles = await NADARL.fetchProfiles();
        render();
    }

    function render() {
        profilesBody.innerHTML = '';

        // Pending requests first, then by email.
        profiles
            .sort((a, b) => {
                const pa = a.role === 'pending' ? 0 : 1;
                const pb = b.role === 'pending' ? 0 : 1;
                if (pa !== pb) return pa - pb;
                return String(a.email).localeCompare(String(b.email));
            })
            .forEach(p => profilesBody.appendChild(row(p)));
    }

    function row(p) {
        const tr = document.createElement('tr');
        if (p.role === 'pending') tr.className = 'row-pending';

        // Email
        const tdEmail = document.createElement('td');
        tdEmail.textContent = p.email || '—';
        tr.appendChild(tdEmail);

        // Team select
        const tdTeam = document.createElement('td');
        const teamSel = document.createElement('select');
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = '(no team)';
        teamSel.appendChild(blank);
        teams.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            if (t.id === p.team_id) opt.selected = true;
            teamSel.appendChild(opt);
        });
        tdTeam.appendChild(teamSel);
        tr.appendChild(tdTeam);

        // Role select
        const tdRole = document.createElement('td');
        const roleSel = document.createElement('select');
        const roles = ['pending', 'generic', 'captain', 'admin'];
        roles.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r;
            opt.textContent = r;
            if (r === p.role) opt.selected = true;
            roleSel.appendChild(opt);
        });
        tdRole.appendChild(roleSel);
        tr.appendChild(tdRole);

        // Save
        const tdAction = document.createElement('td');
        const controls = document.createElement('div');
        controls.className = 'row-controls';
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'row-button';
        save.textContent = 'Save';
        save.addEventListener('click', async () => {
            save.disabled = true;
            const res = await NADARL.updateProfile(p.id, {
                role: roleSel.value,
                team_id: teamSel.value || null
            });
            save.disabled = false;
            if (res.ok && res.count > 0) {
                p.role = roleSel.value;
                p.team_id = teamSel.value || null;
                showMessage('Updated ' + (p.email || 'account') + '.', 'success');
                render();
            } else {
                showMessage(
                    'Update did not take effect (' + (res.count === 0 ? '0 rows changed' : (res.error || 'unknown')) +
                    '). This usually means Row-Level-Security is blocking it — confirm the ' +
                    'permission migration ran and that your own account is role "admin".',
                    'error'
                );
            }
        });
        controls.appendChild(save);
        tdAction.appendChild(controls);
        tr.appendChild(tdAction);

        return tr;
    }

    function showMessage(text, type) {
        message.textContent = text;
        message.className = 'login-message login-message-' + type;
        message.hidden = false;
    }
});
