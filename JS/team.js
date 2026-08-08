const SHOOTER_ROLES = [
    { value: '', label: 'No role' },
    { value: 'captain', label: 'Captain' },
    { value: 'secretary', label: 'Secretary' },
    { value: 'treasurer', label: 'Treasurer' }
];

function padNo(n) {
    return n == null ? '' : String(n).padStart(4, '0');
}

let currentTeam = null;
let seasons = [];
let seasonIndex = 0;
let seasonId = null;
let isAdmin = false;

let currentStats = [];
let sortKey = null;
let sortDir = 1;

// Same comparator convention as the league table page: strings compare
// case-insensitively, numbers numerically, nulls sort last.
function compareValues(aVal, bVal) {
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    if (typeof aVal === 'string' || typeof bVal === 'string') {
        return String(aVal).localeCompare(String(bVal));
    }
    return Number(aVal) - Number(bVal);
}

function sortedStats() {
    if (!sortKey) return currentStats;
    return currentStats.slice().sort((a, b) => compareValues(a[sortKey], b[sortKey]) * sortDir);
}

function updateSortIndicators() {
    document.querySelectorAll('#shootersTableHead th[data-sort]').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === sortKey) {
            th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
        }
    });
}

async function loadSeasonStats() {
    const season = seasons[seasonIndex];
    const label = document.getElementById('seasonLabel');
    const prevButton = document.getElementById('seasonPrev');
    const nextButton = document.getElementById('seasonNext');

    label.textContent = (season ? season.name : 'Season') + ' Team Statistics';
    prevButton.disabled = seasonIndex <= 0;
    nextButton.disabled = seasonIndex >= seasons.length - 1;

    seasonId = season ? season.id : null;
    currentStats = season ? await NADARL.fetchTeamShootersStatsForSeason(currentTeam.id, season.id) : [];
    const canEdit = !document.getElementById('addShooterPanel').hidden;
    renderShooters(sortedStats(), canEdit);
}

async function initTeamPage() {
    const params = new URLSearchParams(window.location.search);
    const teamName = params.get('team') || '';

    const team = await NADARL.fetchTeamByName(teamName);

    if (!team) {
        document.querySelector('.container').innerHTML = '<div class="no-team">Team not found. Please go back to <a href="teams.html">Teams</a>.</div>';
        return;
    }

    currentTeam = team;
    seasons = await NADARL.fetchSeasons();
    const currentSeason = NADARL.pickCurrentSeason(seasons);
    seasonIndex = currentSeason ? seasons.indexOf(currentSeason) : seasons.length - 1;

    const me = await NADARL.fetchMyProfile();
    isAdmin = !!me && me.role === 'admin';
    const canEdit = isAdmin || !!(me && me.role === 'captain' && me.team_id === team.id);

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

    document.getElementById('seasonPrev').addEventListener('click', () => {
        if (seasonIndex > 0) { seasonIndex--; loadSeasonStats(); }
    });
    document.getElementById('seasonNext').addEventListener('click', () => {
        if (seasonIndex < seasons.length - 1) { seasonIndex++; loadSeasonStats(); }
    });

    document.getElementById('shootersTableHead').addEventListener('click', function (e) {
        const th = e.target.closest('th[data-sort]');
        if (!th) return;
        const key = th.dataset.sort;
        if (sortKey === key) {
            sortDir *= -1;
        } else {
            sortKey = key;
            sortDir = key === 'name' ? 1 : -1;
        }
        updateSortIndicators();
        const canEdit = !document.getElementById('addShooterPanel').hidden;
        renderShooters(sortedStats(), canEdit);
    });

    await loadSeasonStats();
}

function toggleEdit(team) {
    const panel = document.getElementById('addShooterPanel');
    const nowEditing = panel.hidden; // currently read-only -> entering edit mode
    setEditMode(nowEditing, team);
    refreshShooters();
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
        await refreshShooters();
    });
}

function renderShooters(stats, canEdit) {
    const tbody = document.getElementById('shootersTable');
    tbody.innerHTML = '';

    if (!stats.length) {
        const colspan = canEdit ? 9 : 8;
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
        const nameLink = document.createElement('a');
        nameLink.className = 'shooter-link';
        nameLink.href = `shooter.html?id=${encodeURIComponent(shooter.shooter_id)}`;
        nameLink.textContent = shooter.name;
        nameDiv.appendChild(nameLink);
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

    // Personal Best (all-time) is always read-only here: it's just the
    // highest Season Best across every season (see Season Best below), not
    // its own value to edit.
    tdAppendStat(tr, shooter.best);

    // Season Best (current season) - admins editing the roster get an
    // editable input, scoped to whichever season is currently selected.
    // A one-off seed/correction, not a standing override: once set, a real
    // submitted match that beats it updates it automatically from then on.
    // Cleared if this season's scores are ever reset (see resetSeason),
    // which also drops its contribution to this shooter's all-time best.
    if (canEdit && isAdmin) {
        const tdSeasonBest = document.createElement('td');
        tdSeasonBest.className = 'score-cell';
        const sbInput = document.createElement('input');
        sbInput.type = 'number';
        sbInput.min = '0';
        sbInput.max = '70';
        sbInput.className = 'shooter-input season-best-override-input';
        sbInput.title = 'Set this shooter\'s Season Best for the currently selected season (admin only). Future matches that beat it update it automatically. Cleared if this season\'s scores are reset. Leave blank to use the site-recorded best.';
        sbInput.placeholder = String(shooter.season_best);
        sbInput.value = shooter.season_best_override != null ? shooter.season_best_override : '';
        tdSeasonBest.appendChild(sbInput);
        tr.appendChild(tdSeasonBest);
    } else {
        tdAppendStat(tr, shooter.season_best);
    }

    tdAppendStat(tr, shooter.tens);
    tdAppendStat(tr, Number(shooter.average).toFixed(1));
    tdAppendStat(tr, shooter.handicap == null ? 'N/A' : shooter.handicap);

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
            const sbInput = tr.querySelector('.season-best-override-input');
            const name = nameInput.value.trim();
            if (!name) { showEditMessage('Shooter name cannot be empty.', 'error'); return; }
            const patch = { name, role: roleSelect.value };
            save.disabled = true;
            const res = await NADARL.updateShooter(shooter.shooter_id, patch);
            if (!res.ok) {
                save.disabled = false;
                showEditMessage('Could not save: ' + res.error, 'error');
                return;
            }
            if (isAdmin && sbInput && seasonId) {
                const sbRes = await NADARL.updateShooterSeasonBest(
                    shooter.shooter_id, seasonId, sbInput.value === '' ? null : sbInput.value
                );
                if (!sbRes.ok) {
                    save.disabled = false;
                    showEditMessage('Could not save season best: ' + sbRes.error, 'error');
                    return;
                }
            }
            save.disabled = false;
            showEditMessage('Saved ' + name + '.', 'success');
            await refreshShooters();
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

async function refreshShooters() {
    await loadSeasonStats();
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
