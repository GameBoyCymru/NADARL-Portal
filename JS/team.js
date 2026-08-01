const SHOOTER_ROLES = [
    { value: '', label: 'No role' },
    { value: 'captain', label: 'Captain' },
    { value: 'secretary', label: 'Secretary' },
    { value: 'treasurer', label: 'Treasurer' }
];

function padNo(n) {
    return n == null ? '' : String(n).padStart(4, '0');
}

async function initTeamPage() {
    const params = new URLSearchParams(window.location.search);
    const teamName = params.get('team') || '';

    const team = await NADARL.fetchTeamByName(teamName);

    if (!team) {
        document.querySelector('.container').innerHTML = '<div class="no-team">Team not found. Please go back to <a href="teams.html">Teams</a>.</div>';
        return;
    }

    const stats = await NADARL.fetchTeamShootersStats(team.id);
    const me = await NADARL.fetchMyProfile();
    const canEdit = !!me && (me.role === 'admin' || (me.role === 'captain' && me.team_id === team.id));

    document.title = `${team.name} - Newport & District Air Rifle League`;
    document.getElementById('teamVenue').textContent = `Venue: ${team.venue}`;

    const logoImg = document.getElementById('teamLogo');
    const fallback = document.getElementById('logoFallback');
    logoImg.alt = `${team.name} logo`;
    logoImg.onerror = function () {
        this.hidden = true;
        fallback.style.display = 'flex';
        fallback.textContent = team.name.split(' ').map(w => w[0]).join('');
    };
    logoImg.hidden = false;
    logoImg.src = `../Images/teams/${team.slug}.png`;

    // Captains/admins get a button to toggle the roster editor.
    const editToggle = document.getElementById('editToggleButton');
    if (canEdit) {
        editToggle.hidden = false;
        editToggle.addEventListener('click', () => toggleEdit(team));
    }

    renderShooters(stats, false);
}

function toggleEdit(team) {
    const panel = document.getElementById('addShooterPanel');
    const nowEditing = panel.hidden; // currently read-only -> entering edit mode
    setEditMode(nowEditing, team);
    refreshShooters(team.id);
}

function setEditMode(editing, team) {
    document.getElementById('addShooterPanel').hidden = !editing;
    document.getElementById('thActions').hidden = !editing;
    const notice = document.getElementById('editNotice');
    const toggle = document.getElementById('editToggleButton');
    if (editing) {
        notice.hidden = false;
        notice.textContent =
            `Editing ${team.name}'s roster. Shooter numbers are assigned automatically.`;
        toggle.textContent = 'Done';
        wireAddButton(team);
    } else {
        notice.hidden = true;
        toggle.textContent = 'Edit Roster';
    }
}

function wireAddButton(team) {
    const btn = document.getElementById('addShooterButton');
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', async () => {
        const nameEl = document.getElementById('newShooterName');
        const roleEl = document.getElementById('newShooterRole');
        const name = nameEl.value.trim();
        if (!name) {
            showEditMessage('Please enter a shooter name.', 'error');
            return;
        }
        btn.disabled = true;
        const res = await NADARL.addShooter(team.id, { name, role: roleEl.value });
        btn.disabled = false;
        if (!res.ok) {
            showEditMessage('Could not add shooter: ' + res.error, 'error');
            return;
        }
        nameEl.value = '';
        roleEl.value = '';
        showEditMessage('Added ' + name + '.', 'success');
        await refreshShooters(team.id);
    });
}

function renderShooters(stats, canEdit) {
    const tbody = document.getElementById('shootersTable');
    tbody.innerHTML = '';

    if (!stats.length) {
        const colspan = canEdit ? 10 : 9;
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="empty-row">No shooters yet${canEdit ? ' — add one below.' : '.'}</td></tr>`;
        return;
    }

    stats.forEach(shooter => {
        tbody.appendChild(buildRow(shooter, canEdit));
    });
}

function buildRow(shooter, canEdit) {
    const tr = document.createElement('tr');

    // Number
    const tdNo = document.createElement('td');
    tdNo.className = 'col-no shooter-no-cell';
    tdNo.textContent = padNo(shooter.shooter_no);
    tr.appendChild(tdNo);

    // Shooter (name + role)
    const tdName = document.createElement('td');
    tdName.className = 'shooter-name-cell';
    if (canEdit) {
        const wrap = document.createElement('div');
        wrap.className = 'shooter-edit-wrap';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'shooter-input';
        nameInput.value = shooter.name;
        nameInput.maxLength = 60;
        const roleSelect = document.createElement('select');
        roleSelect.className = 'shooter-select';
        SHOOTER_ROLES.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.value;
            opt.textContent = r.label;
            if ((r.value || null) === (shooter.role || null)) opt.selected = true;
            roleSelect.appendChild(opt);
        });
        wrap.appendChild(nameInput);
        wrap.appendChild(roleSelect);
        tdName.appendChild(wrap);
    } else {
        const nameDiv = document.createElement('div');
        nameDiv.className = 'shooter-name';
        nameDiv.textContent = shooter.name;
        if (shooter.role) {
            const roleSpan = document.createElement('span');
            roleSpan.className = 'shooter-role';
            roleSpan.textContent = shooter.role.charAt(0).toUpperCase() + shooter.role.slice(1);
            nameDiv.appendChild(roleSpan);
        }
        tdName.appendChild(nameDiv);
    }
    tr.appendChild(tdName);

    // Stats columns (read-only)
    tdAppendStat(tr, shooter.matches_played);        // Season Matches Shot (current season)
    tdAppendStat(tr, shooter.total_matches_played);  // Total Matches Shot (all-time)
    tdAppendStat(tr, shooter.best);          // Personal Best (all-time)
    tdAppendStat(tr, shooter.season_best);   // Season Best (current season)
    tdAppendStat(tr, shooter.tens);
    tdAppendStat(tr, Number(shooter.average).toFixed(1));
    tdAppendStat(tr, shooter.handicap);

    // Actions (only when editing)
    if (canEdit) {
        const tdActions = document.createElement('td');
        tdActions.className = 'col-actions';
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'shooter-button';
        save.textContent = 'Save';
        save.addEventListener('click', async () => {
            const nameInput = tr.querySelector('.shooter-input');
            const roleSelect = tr.querySelector('.shooter-select');
            const name = nameInput.value.trim();
            if (!name) { showEditMessage('Shooter name cannot be empty.', 'error'); return; }
            save.disabled = true;
            const res = await NADARL.updateShooter(shooter.shooter_id, { name, role: roleSelect.value });
            save.disabled = false;
            if (!res.ok) {
                showEditMessage('Could not save: ' + res.error, 'error');
                return;
            }
            showEditMessage('Saved ' + name + '.', 'success');
            await refreshShooters(shooter.team_id);
        });
        tdActions.appendChild(save);
        tr.appendChild(tdActions);
    }

    return tr;
}

function tdAppendStat(tr, value) {
    const td = document.createElement('td');
    td.className = 'score-cell';
    td.textContent = value;
    tr.appendChild(td);
}

async function refreshShooters(teamId) {
    const stats = await NADARL.fetchTeamShootersStats(teamId);
    const canEdit = !document.getElementById('addShooterPanel').hidden;
    renderShooters(stats, canEdit);
}

function showEditMessage(text, type) {
    const el = document.getElementById('editMessage');
    el.textContent = text;
    el.className = 'login-message login-message-' + type;
    el.hidden = false;
}

document.addEventListener('DOMContentLoaded', initTeamPage);

function checkViewportWidth() {
    const overlay = document.getElementById('rotateOverlay');
    if (!overlay) return;
    if (window.innerWidth < 768) {
        overlay.classList.add('visible');
        document.body.style.overflow = 'hidden';
    }
}

function dismissRotateOverlay() {
    const overlay = document.getElementById('rotateOverlay');
    overlay.classList.remove('visible');
    document.body.style.overflow = '';
}

document.addEventListener('DOMContentLoaded', function () {
    checkViewportWidth();
    document.getElementById('rotateDismiss').addEventListener('click', dismissRotateOverlay);
});
