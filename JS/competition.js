let competition = null;
let allShooters = [];       // { id, shooter_no, name, team_id }
let teamNameById = {};
let isAdmin = false;
let entries = [];

function $(id) { return document.getElementById(id); }

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
    return new Date(dateStr + 'T00:00:00')
        .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function shooterById(id) {
    return allShooters.find(s => s.id === id) || null;
}

async function loadEntries() {
    entries = await NADARL.fetchCompetitionEntries(competition.id);
    renderLeaderboard();
    if (isAdmin) renderAdminEntries();
}

function renderLeaderboard() {
    const tbody = $('entriesTable');
    if (!entries.length) {
        tbody.innerHTML = '<tr><td colspan="5">No results entered yet.</td></tr>';
        return;
    }
    let html = '';
    entries.forEach((entry, index) => {
        const shooter = shooterById(entry.shooter_id);
        const name = shooter ? shooter.name : 'Unknown shooter';
        const team = shooter ? (teamNameById[shooter.team_id] || '') : '';
        html += `<tr>
            <td>${index + 1}</td>
            <td class="shooter-name">${escapeHtml(name)}</td>
            <td class="team-cell">${escapeHtml(team)}</td>
            <td class="score-cell">${entry.score}</td>
            <td>${escapeHtml(entry.notes || '')}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function populateShooterSelect() {
    const select = $('entryShooter');
    select.innerHTML = '';
    const sorted = allShooters.slice().sort((a, b) => a.name.localeCompare(b.name));
    sorted.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} (${teamNameById[s.team_id] || 'no team'})`;
        select.appendChild(opt);
    });
}

function renderAdminEntries() {
    const body = $('adminEntriesBody');
    body.innerHTML = '';
    if (!entries.length) {
        body.innerHTML = '<tr><td colspan="5" class="fx-hint">No results yet.</td></tr>';
        return;
    }
    entries.forEach(entry => body.appendChild(adminEntryRow(entry)));
}

function adminEntryRow(entry) {
    const shooter = shooterById(entry.shooter_id);
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = shooter ? shooter.name : 'Unknown shooter';
    tr.appendChild(tdName);

    const tdTeam = document.createElement('td');
    tdTeam.textContent = shooter ? (teamNameById[shooter.team_id] || '') : '';
    tr.appendChild(tdTeam);

    const scoreIn = document.createElement('input');
    scoreIn.type = 'number';
    scoreIn.min = '0';
    scoreIn.className = 'team-input';
    scoreIn.value = entry.score;
    const tdScore = document.createElement('td');
    tdScore.appendChild(scoreIn);
    tr.appendChild(tdScore);

    const notesIn = document.createElement('input');
    notesIn.type = 'text';
    notesIn.className = 'team-input';
    notesIn.value = entry.notes || '';
    const tdNotes = document.createElement('td');
    tdNotes.appendChild(notesIn);
    tr.appendChild(tdNotes);

    const tdAction = document.createElement('td');
    const controls = document.createElement('div');
    controls.className = 'row-controls';

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'row-button';
    save.textContent = 'Save';
    save.addEventListener('click', async () => {
        save.disabled = true;
        const res = await NADARL.upsertCompetitionEntry(competition.id, entry.shooter_id, {
            score: scoreIn.value,
            notes: notesIn.value.trim()
        });
        save.disabled = false;
        if (!res.ok) { showEntryMessage('Could not save: ' + res.error, 'error'); return; }
        showEntryMessage('Saved.', 'success');
        await loadEntries();
    });
    controls.appendChild(save);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'row-button row-button-secondary';
    del.textContent = 'Remove';
    del.addEventListener('click', async () => {
        if (!confirm('Remove this result?')) return;
        del.disabled = true;
        const res = await NADARL.deleteCompetitionEntry(entry.id);
        del.disabled = false;
        if (!res.ok) { showEntryMessage('Could not remove: ' + res.error, 'error'); return; }
        showEntryMessage('Result removed.', 'success');
        await loadEntries();
    });
    controls.appendChild(del);

    tdAction.appendChild(controls);
    tr.appendChild(tdAction);

    return tr;
}

function showEntryMessage(text, type) {
    const el = $('entryMessage');
    el.textContent = text;
    el.className = 'login-message login-message-' + (type || '');
    el.hidden = false;
}

async function initCompetitionPage() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || '';

    competition = await NADARL.fetchCompetitionById(id);
    if (!competition) {
        document.querySelector('.container').innerHTML =
            '<section class="section"><p class="login-intro">Competition not found. Please go back to <a href="fixtures.html">Fixtures</a>.</p></section>';
        return;
    }

    document.title = `${competition.name} - Newport & District Air Rifle League`;
    $('compName').textContent = competition.name;
    $('compMeta').textContent = formatDate(competition.date) + (competition.venue ? ' · ' + competition.venue : '');
    $('compDescription').textContent = competition.description || '';

    const [shooters, teams, me] = await Promise.all([
        NADARL.fetchAllShooters(),
        NADARL.fetchTeams(),
        NADARL.fetchMyProfile()
    ]);
    allShooters = shooters;
    teamNameById = {};
    teams.forEach(t => { teamNameById[t.id] = t.name; });

    isAdmin = !!(me && me.role === 'admin');
    if (isAdmin) {
        $('adminEntryPanel').hidden = false;
        populateShooterSelect();
        $('entrySave').addEventListener('click', async () => {
            const shooterId = $('entryShooter').value;
            const score = $('entryScore').value;
            const notes = $('entryNotes').value.trim();
            if (!shooterId) { showEntryMessage('Pick a shooter.', 'error'); return; }
            if (score === '') { showEntryMessage('Enter a score.', 'error'); return; }
            const btn = $('entrySave');
            btn.disabled = true;
            const res = await NADARL.upsertCompetitionEntry(competition.id, shooterId, { score, notes });
            btn.disabled = false;
            if (!res.ok) { showEntryMessage('Could not save: ' + res.error, 'error'); return; }
            $('entryScore').value = '';
            $('entryNotes').value = '';
            showEntryMessage('Result saved.', 'success');
            await loadEntries();
        });
    }

    await loadEntries();

    const channel = NADARL.subscribeCompetitionEntries(competition.id, () => loadEntries());
    window.addEventListener('beforeunload', () => NADARL.unsubscribeChannel(channel));
}

document.addEventListener('DOMContentLoaded', initCompetitionPage);

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
