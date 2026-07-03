function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        home: params.get('home') || '',
        away: params.get('away') || '',
        date: params.get('date') || '',
        venue: params.get('venue') || ''
    };
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

function isToday(dateStr) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return dateStr === `${y}-${m}-${d}`;
}

// Sort shooters by total desc, then derive A-team (top 5) and B-team (pos 5-7).
function calculateTeamScores(shooters) {
    const indexed = shooters.map((s, i) => ({ ...s, originalIndex: i }));
    const sorted = indexed.sort((a, b) => b.total - a.total);
    const aTeam = sorted.slice(0, 5).reduce((sum, s) => sum + s.total, 0);
    const bTeam = sorted.slice(4, 7).reduce((sum, s) => sum + s.total, 0);

    const aTeamShooters = sorted.slice(0, 5).map(s => ({ name: s.name, total: s.total }));
    const bTeamShooters = sorted.slice(4, 7).map(s => ({ name: s.name, total: s.total }));

    return { aTeam, bTeam, aTeamShooters, bTeamShooters };
}

// ---------------------------------------------------------------------
// Read-only rendering (public view)
// ---------------------------------------------------------------------

function renderShooterTable(tbodyId, shooters) {
    const tbody = document.getElementById(tbodyId);
    const totals = shooters.map(s => s.total);
    const maxTotal = totals.length ? Math.max(...totals) : 0;
    const minTotal = totals.length ? Math.min(...totals) : 0;
    let html = '';

    shooters.forEach((shooter) => {
        let totalClass = 'total-cell';
        if (shooters.length && shooter.total === maxTotal) totalClass += ' total-highest';
        else if (shooters.length && shooter.total === minTotal) totalClass += ' total-lowest';
        html += `<tr>`;
        html += `<td class="shooter-cell">${shooter.name}</td>`;
        shooter.scores.forEach(score => {
            html += `<td class="score-cell">${score}</td>`;
        });
        html += `<td class="${totalClass}">${shooter.total}</td>`;
        html += '</tr>';
    });

    tbody.innerHTML = html;
    return calculateTeamScores(shooters);
}

function renderTeamSummary(tbodyId, scores, opponentScores) {
    const tbody = document.getElementById(tbodyId);
    let html = '';

    scores.aTeamShooters.forEach((s, i) => {
        const bScore = (i === 4 && scores.bTeamShooters[0] && scores.bTeamShooters[0].name === s.name) ? s.total : '';
        html += `<tr><td class="summary-shooter">${s.name}</td><td class="score-cell">${s.total}</td><td class="score-cell">${bScore}</td></tr>`;
    });

    scores.bTeamShooters.forEach((s, i) => {
        if (i === 0) return;
        html += `<tr><td class="summary-shooter">${s.name}</td><td class="score-cell"></td><td class="score-cell">${s.total}</td></tr>`;
    });

    const aClass = scores.aTeam > opponentScores.aTeam ? ' score-winner' : '';
    const bClass = scores.bTeam > opponentScores.bTeam ? ' score-winner' : '';
    html += `<tr class="summary-total-row"><td>Total</td><td class="score-cell${aClass}">${scores.aTeam}</td><td class="score-cell${bClass}">${scores.bTeam}</td></tr>`;

    tbody.innerHTML = html;
}

function renderMatchSummary(homeTeam, homeScores, awayTeam, awayScores) {
    document.getElementById('homeSummaryTitle').textContent = homeTeam;
    document.getElementById('awaySummaryTitle').textContent = awayTeam;
    renderTeamSummary('homeSummary', homeScores, awayScores);
    renderTeamSummary('awaySummary', awayScores, homeScores);
}

function renderReadOnly(params, rows) {
    const homeShooters = rows.filter(r => r.team_name === params.home)
        .map(r => ({ name: r.shooter_name, scores: r.shots || [], total: r.total }));
    const awayShooters = rows.filter(r => r.team_name === params.away)
        .map(r => ({ name: r.shooter_name, scores: r.shots || [], total: r.total }));

    if (!homeShooters.length && !awayShooters.length) {
        document.querySelector('.score-tables-wrapper').innerHTML =
            '<div class="no-fixtures">Scores for this match have not been entered yet.</div>';
        return;
    }

    const homeScores = renderShooterTable('homeShooters', homeShooters);
    const awayScores = renderShooterTable('awayShooters', awayShooters);

    updateHeaderScores(homeScores, awayScores);
    renderMatchSummary(params.home, homeScores, params.away, awayScores);
}

function updateHeaderScores(homeScores, awayScores) {
    const homeAEl = document.getElementById('homeATeam');
    const homeBEl = document.getElementById('homeBTeam');
    const awayAEl = document.getElementById('awayATeam');
    const awayBEl = document.getElementById('awayBTeam');

    homeAEl.textContent = homeScores.aTeam;
    homeBEl.textContent = homeScores.bTeam;
    awayAEl.textContent = awayScores.aTeam;
    awayBEl.textContent = awayScores.bTeam;

    homeAEl.classList.toggle('score-winner', homeScores.aTeam > awayScores.aTeam);
    awayAEl.classList.toggle('score-winner', awayScores.aTeam > homeScores.aTeam);
    homeBEl.classList.toggle('score-winner', homeScores.bTeam > awayScores.bTeam);
    awayBEl.classList.toggle('score-winner', awayScores.bTeam > homeScores.bTeam);
}

// ---------------------------------------------------------------------
// Editable rendering (admin / captain / generic)
// ---------------------------------------------------------------------

const SHOT_COUNT = 7;

function createShooterPicker(shooterList, selectedId, teamId) {
    const container = document.createElement('div');
    container.className = 'shooter-picker';

    const selected = selectedId ? shooterList.find(s => s.id === selectedId) : null;
    container.setAttribute('data-shooter-id', selected ? selected.id : '');
    container.setAttribute('data-name', selected ? selected.name : '');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'shooter-picker-trigger';

    const label = document.createElement('span');
    label.className = 'shooter-picker-label';
    label.textContent = selected ? formatShooterLabel(selected) : '— select shooter —';

    const caret = document.createElement('span');
    caret.className = 'shooter-picker-caret';
    caret.textContent = '\u25BC';

    trigger.appendChild(label);
    trigger.appendChild(caret);
    container.appendChild(trigger);

    const panel = document.createElement('div');
    panel.className = 'shooter-picker-panel';
    panel.hidden = true;

    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'shooter-picker-search';
    search.placeholder = 'Search name or number…';
    panel.appendChild(search);

    const list = document.createElement('div');
    list.className = 'shooter-picker-list';
    panel.appendChild(list);
    container.appendChild(panel);

    function selectShooter(shooter) {
        container.setAttribute('data-shooter-id', shooter ? shooter.id : '');
        container.setAttribute('data-name', shooter ? shooter.name : '');
        label.textContent = shooter ? formatShooterLabel(shooter) : '— select shooter —';
        panel.hidden = true;
        container.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function buildOption(shooter) {
        const opt = document.createElement('button');
        opt.type = 'button';
        opt.className = 'shooter-picker-option';
        opt.setAttribute('data-shooter-id', shooter.id);
        const noStr = String(shooter.shooter_no).padStart(4, '0');
        opt.setAttribute('data-search', (shooter.name + ' #' + noStr).toLowerCase());
        const nameSpan = document.createElement('span');
        nameSpan.className = 'shooter-option-name';
        nameSpan.textContent = shooter.name;
        const noSpan = document.createElement('span');
        noSpan.className = 'shooter-option-no';
        noSpan.textContent = '#' + noStr;
        opt.appendChild(nameSpan);
        opt.appendChild(noSpan);
        opt.addEventListener('click', () => selectShooter(shooter));
        return opt;
    }

    function populate() {
        list.innerHTML = '';

        const noneOpt = document.createElement('button');
        noneOpt.type = 'button';
        noneOpt.className = 'shooter-picker-option shooter-picker-none';
        const noneSpan = document.createElement('span');
        noneSpan.className = 'shooter-option-name';
        noneSpan.textContent = '— none —';
        noneOpt.appendChild(noneSpan);
        noneOpt.addEventListener('click', () => {
            const tr = container.closest('tr');
            const nextTr = tr ? tr.nextElementSibling : null;
            if (nextTr) {
                const nextPicker = nextTr.querySelector('.shooter-picker');
                const nextHasShooter = !!(nextPicker && nextPicker.getAttribute('data-shooter-id'));
                const nextHasScores = Array.from(nextTr.querySelectorAll('.shot-input')).some(i => i.value !== '');
                if (nextHasShooter || nextHasScores) {
                    window.alert('Cannot remove this shooter while the next row still has a shooter or scores.');
                    panel.hidden = true;
                    return;
                }
            }
            selectShooter(null);
        });
        list.appendChild(noneOpt);

        shooterList.forEach(s => list.appendChild(buildOption(s)));

        const newOpt = document.createElement('button');
        newOpt.type = 'button';
        newOpt.className = 'shooter-picker-option shooter-picker-new';
        const newSpan = document.createElement('span');
        newSpan.className = 'shooter-option-name';
        newSpan.textContent = '+ New Shooter';
        newOpt.appendChild(newSpan);
        newOpt.addEventListener('click', async () => {
            const name = window.prompt('Enter the new shooter\'s name:');
            if (!name || !name.trim()) { panel.hidden = true; return; }
            newOpt.disabled = true;
            const res = await NADARL.addShooter(teamId, { name: name.trim() });
            newOpt.disabled = false;
            if (!res.ok) {
                window.alert('Could not add shooter: ' + (res.error || 'unknown'));
                return;
            }
            shooterList.push(res.shooter);
            const tbody = container.closest('tbody');
            if (tbody) {
                tbody.querySelectorAll('.shooter-picker').forEach(p => {
                    if (p.populateList) p.populateList();
                });
            }
            selectShooter(res.shooter);
        });
        list.appendChild(newOpt);
    }
    container.populateList = populate;
    populate();

    function applyFilter() {
        const q = search.value.toLowerCase().trim();
        list.querySelectorAll('.shooter-picker-option').forEach(opt => {
            const matchesSearch = q === '' || (opt.getAttribute('data-search') || '').includes(q)
                || opt.classList.contains('shooter-picker-none')
                || opt.classList.contains('shooter-picker-new');
            const used = opt.classList.contains('option-used');
            opt.style.display = (matchesSearch && !used) ? '' : 'none';
        });
    }

    search.addEventListener('input', applyFilter);

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = !panel.hidden;
        closeAllPickerPanels();
        if (!wasOpen) {
            const tbody = container.closest('tbody');
            const usedIds = new Set();
            if (tbody) {
                tbody.querySelectorAll('.shooter-picker').forEach(p => {
                    if (p === container) return;
                    const id = p.getAttribute('data-shooter-id');
                    if (id) usedIds.add(id);
                });
            }
            list.querySelectorAll('.shooter-picker-option').forEach(opt => {
                opt.classList.toggle('option-used', usedIds.has(opt.getAttribute('data-shooter-id')));
            });
            panel.hidden = false;
            search.value = '';
            applyFilter();
            search.focus();
        }
    });

    return container;
}

function formatShooterLabel(shooter) {
    return `${shooter.name} #${String(shooter.shooter_no).padStart(4, '0')}`;
}

function closeAllPickerPanels() {
    document.querySelectorAll('.shooter-picker-panel:not([hidden])').forEach(p => {
        p.hidden = true;
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.shooter-picker')) {
        closeAllPickerPanels();
    }
});

function buildEditRow(shooterList, existing, teamId) {
    const tr = document.createElement('tr');
    tr.className = 'score-edit-row';

    const tdShooter = document.createElement('td');
    const picker = createShooterPicker(shooterList, existing ? existing.shooter_id : null, teamId);
    tdShooter.appendChild(picker);
    tr.appendChild(tdShooter);

    const shots = existing ? (existing.shots || []) : [];
    for (let i = 0; i < SHOT_COUNT; i++) {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'number';
        input.inputMode = 'numeric';
        input.min = '0';
        input.max = '10';
        input.className = 'shot-input';
        input.value = shots[i] != null ? shots[i] : '';
        td.appendChild(input);
        tr.appendChild(td);
    }

    const tdTotal = document.createElement('td');
    tdTotal.className = 'total-cell';
    const totalInner = document.createElement('div');
    totalInner.className = 'total-cell-inner';
    const totalSpan = document.createElement('span');
    totalSpan.className = 'row-total';
    totalSpan.textContent = existing ? existing.total : 0;
    totalInner.appendChild(totalSpan);
    tdTotal.appendChild(totalInner);
    tr.appendChild(tdTotal);

    return tr;
}

function recalcRowTotal(tr) {
    const inputs = tr.querySelectorAll('.shot-input');
    let total = 0;
    inputs.forEach(i => { total += i.value === '' ? 0 : (parseInt(i.value, 10) || 0); });
    tr.querySelector('.row-total').textContent = total;
}

function isRowComplete(tr) {
    const inputs = tr.querySelectorAll('.shot-input');
    return Array.from(inputs).every(i => i.value !== '');
}

function updateCurrentShooter(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr.score-edit-row'));
    let currentFound = false;
    let prevHasShooter = true;
    rows.forEach(tr => {
        const picker = tr.querySelector('.shooter-picker');
        const hasShooter = !!(picker && picker.getAttribute('data-shooter-id'));
        const trigger = picker ? picker.querySelector('.shooter-picker-trigger') : null;
        if (trigger) trigger.disabled = !prevHasShooter;

        const isCurrent = !currentFound && !isRowComplete(tr);
        if (isCurrent) {
            tr.classList.add('current-shooter');
            currentFound = true;
        } else {
            tr.classList.remove('current-shooter');
        }
        const editable = isCurrent || isRowComplete(tr);
        tr.querySelectorAll('.shot-input').forEach(el => {
            el.disabled = !editable;
        });
        tr.classList.toggle('row-locked', !editable);

        prevHasShooter = hasShooter;
    });
}

function updateCurrentShooters() {
    updateCurrentShooter('homeShooters');
    updateCurrentShooter('awayShooters');
}

function gatherTeamRows(tbodyId) {
    const rows = [];
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return rows;
    tbody.querySelectorAll('tr').forEach(tr => {
        const picker = tr.querySelector('.shooter-picker');
        if (picker) {
            const shooterId = picker.getAttribute('data-shooter-id');
            if (!shooterId) return;
            const name = picker.getAttribute('data-name');
            const shots = Array.from(tr.querySelectorAll('.shot-input')).map(i =>
                i.value === '' ? 0 : (parseInt(i.value, 10) || 0)
            );
            const total = shots.reduce((a, b) => a + b, 0);
            const tens = shots.filter(s => s === 10).length;
            rows.push({ shooter_id: shooterId, name, shots, total, tens });
        } else {
            const cells = tr.querySelectorAll('td');
            if (cells.length < 2) return;
            const name = cells[0].textContent.trim();
            if (!name) return;
            const total = parseInt(cells[cells.length - 1].textContent, 10) || 0;
            const shots = Array.from(cells).slice(1, 1 + SHOT_COUNT)
                .map(c => parseInt(c.textContent, 10) || 0);
            rows.push({ shooter_id: null, name, total, shots });
        }
    });
    return rows;
}

function recalcSummary(params, homeTbodyId, awayTbodyId) {
    const homeRows = gatherTeamRows(homeTbodyId).map(r => ({ name: r.name, total: r.total, scores: r.shots }));
    const awayRows = gatherTeamRows(awayTbodyId).map(r => ({ name: r.name, total: r.total, scores: r.shots }));

    const homeScores = calculateTeamScores(homeRows);
    const awayScores = calculateTeamScores(awayRows);
    updateHeaderScores(homeScores, awayScores);
    renderMatchSummary(params.home, homeScores, params.away, awayScores);
}

function renderEditableGrid(tbodyId, matchId, teamId, shooterList, existingRows, editable, params, homeTbodyId, awayTbodyId) {
    const tbody = document.getElementById(tbodyId);
    tbody.innerHTML = '';

    if (!editable) {
        const shooters = existingRows.map(r => ({ name: r.shooter_name, scores: r.shots || [], total: r.total }));
        const scores = renderShooterTable(tbodyId, shooters);
        return scores;
    }

    existingRows.forEach(r => tbody.appendChild(buildEditRow(shooterList, r, teamId)));
    while (tbody.querySelectorAll('tr.score-edit-row').length < 9) {
        tbody.appendChild(buildEditRow(shooterList, null, teamId));
    }

    tbody.addEventListener('input', (e) => {
        if (e.target.classList.contains('shot-input')) {
            const v = e.target.value;
            if (v !== '') {
                let n = parseInt(v, 10);
                if (isNaN(n)) n = 0;
                if (n < 0) n = 0;
                if (n > 10) n = 10;
                if (String(n) !== v) e.target.value = n;
            }
            recalcRowTotal(e.target.closest('tr'));
            recalcSummary(params, homeTbodyId, awayTbodyId);
            updateCurrentShooters();
        }
    });
    tbody.addEventListener('change', (e) => {
        if (e.target.classList.contains('shooter-picker')) {
            recalcSummary(params, homeTbodyId, awayTbodyId);
            updateCurrentShooters();
        }
    });

    // Save button: appended after the table inside its column
    const column = tbody.closest('.score-table-column');
    if (column && !column.querySelector('.score-controls')) {
        const controls = document.createElement('div');
        controls.className = 'score-controls';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'score-save-btn';
        saveBtn.textContent = 'Save Scores';

        const status = document.createElement('div');
        status.className = 'score-status';

        saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            status.textContent = 'Saving…';
            const rows = gatherTeamRows(tbodyId);
            const res = await NADARL.saveTeamScores(matchId, teamId, rows);
            saveBtn.disabled = false;
            status.textContent = res.ok
                ? 'Saved ' + rows.length + ' score(s).'
                : 'Save failed: ' + res.error;
        });

        controls.appendChild(saveBtn);
        column.appendChild(controls);
        column.appendChild(status);
    }

    return calculateTeamScores(existingRows.map(r => ({ name: r.shooter_name, total: r.total })));
}

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------

async function initMatchPage() {
    const params = getQueryParams();

    if (!params.home || !params.away) {
        document.querySelector('.container').innerHTML = '<div class="no-match">No match data found. Please go back to <a href="fixtures.html">Fixtures</a>.</div>';
        return;
    }

    document.title = `${params.home} vs ${params.away} - Newport & District Air Rifle League`;
    document.getElementById('matchDate').textContent = formatDate(params.date);
    document.getElementById('homeTeamName').textContent = params.home;
    document.getElementById('awayTeamName').textContent = params.away;
    document.getElementById('matchVenue').textContent = `Venue: ${params.venue}`;
    document.getElementById('homeTeamTableTitle').textContent = params.home;
    document.getElementById('awayTeamTableTitle').textContent = params.away;

    const profile = await NADARL.fetchMyProfile();
    const role = profile ? profile.role : null;
    const isAdmin = role === 'admin';
    const isCaptainOrGeneric = role === 'captain' || role === 'generic';

    const match = await NADARL.fetchMatch(params.date, params.home, params.away);
    const rows = await NADARL.fetchMatchScorecard(params.date, params.home, params.away);

    const canEditHome = !!(match && (isAdmin || (isCaptainOrGeneric && profile.team_id === match.home_team_id && isToday(params.date))));
    const canEditAway = !!(match && isAdmin && match.away_team_id);
    const canEdit = canEditHome || canEditAway;

    if (!canEdit) {
        renderReadOnly(params, rows);
        return;
    }

    const homeTeamId = match.home_team_id;
    const awayTeamId = match.away_team_id;

    const homeShooters = await NADARL.fetchShootersForTeam(homeTeamId);
    const awayShooters = awayTeamId ? await NADARL.fetchShootersForTeam(awayTeamId) : [];

    const homeExisting = rows.filter(r => r.team_name === params.home);
    const awayExisting = rows.filter(r => r.team_name === params.away);

    document.body.classList.add('edit-mode');

    renderEditableGrid('homeShooters', match.id, homeTeamId, homeShooters, homeExisting, canEditHome, params, 'homeShooters', 'awayShooters');
    if (awayTeamId) {
        renderEditableGrid('awayShooters', match.id, awayTeamId, awayShooters, awayExisting, canEditAway, params, 'homeShooters', 'awayShooters');
    }

    recalcSummary(params, 'homeShooters', 'awayShooters');
    updateCurrentShooters();
}

document.addEventListener('DOMContentLoaded', initMatchPage);

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
