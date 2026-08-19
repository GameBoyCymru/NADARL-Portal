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

function setMatchBadge(selector, teamName, slugMap) {
    const el = document.querySelector(selector);
    if (!el) return;
    const slug = slugMap[teamName];
    if (!slug) { el.textContent = '\uD83C\uDFAF'; return; }
    el.innerHTML = `<img src="../Images/teams/${slug}.png" alt="${teamName} logo" onerror="this.parentElement.textContent='\uD83C\uDFAF'">`;
}

// ---------------------------------------------------------------------
// Handicap (second-half / half=2 matches only)
// ---------------------------------------------------------------------

let isHandicapMatch = false;
let handicapMap = {};   // shooter_id -> handicap number

function hcFor(shooterId) {
    return isHandicapMatch && shooterId ? (handicapMap[shooterId] || 0) : 0;
}

// A card is 7 shots at a max of 10 each - handicap can push a score up, but
// never past the maximum a shooter could actually card.
const MAX_SHOOTER_SCORE = 70;

function effectiveScore(total, hc) {
    return Math.min(MAX_SHOOTER_SCORE, (total || 0) + (hc || 0));
}

// Display text for the HC column: "N/A" when the shooter doesn't have
// enough season matches yet for a handicap, otherwise the numeric value
// (which legitimately can be 0).
function hcDisplay(shooterId) {
    if (!isHandicapMatch || !shooterId) return 'N/A';
    const hc = handicapMap[shooterId];
    return hc == null ? 'N/A' : hc;
}

function showHandicapBanner() {
    const header = document.getElementById('matchHeader');
    if (!header || document.getElementById('handicapBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'handicapBanner';
    banner.className = 'handicap-banner';
    banner.textContent = 'Handicap match — totals include handicap (based on each shooter\'s last 3 matches).';
    header.appendChild(banner);
}

// Append HC + Total columns to the individual score tables (handicap matches
// only), relabelling the existing pre-handicap Total column to Score.
function ensureHandicapHeaders() {
    if (!isHandicapMatch) return;
    ['homeScoreTable', 'awayScoreTable'].forEach(id => {
        const tbl = document.getElementById(id);
        const tr = tbl && tbl.querySelector('thead tr');
        if (!tr || tr.querySelector('.th-hc')) return;

        const totalHeader = tr.querySelector('th:last-child');
        if (totalHeader) totalHeader.textContent = 'Score';

        const hc = document.createElement('th');
        hc.className = 'th-hc';
        hc.textContent = 'HC';
        const adj = document.createElement('th');
        adj.className = 'th-adj';
        adj.textContent = 'Total';
        tr.appendChild(hc);
        tr.appendChild(adj);
    });
}

// Sort shooters by total desc, then derive A-team (top 5) and B-team (pos 5-7).
// In a handicap match, ranking + team totals use the adjusted (total + HC) score.
function calculateTeamScores(shooters) {
    const indexed = shooters.map((s, i) => {
        const hc = hcFor(s.shooter_id);
        return { ...s, originalIndex: i, handicap: hc, effective: effectiveScore(s.total, hc) };
    });
    const sorted = indexed.sort((a, b) => b.effective - a.effective);
    const aTeam = sorted.slice(0, 5).reduce((sum, s) => sum + s.effective, 0);
    const bTeam = sorted.slice(4, 7).reduce((sum, s) => sum + s.effective, 0);

    const aTeamShooters = sorted.slice(0, 5).map(s => ({ name: s.name, shooter_id: s.shooter_id, total: s.effective }));
    const bTeamShooters = sorted.slice(4, 7).map(s => ({ name: s.name, shooter_id: s.shooter_id, total: s.effective }));

    return { aTeam, bTeam, aTeamShooters, bTeamShooters };
}

// ---------------------------------------------------------------------
// Read-only rendering (public view)
// ---------------------------------------------------------------------

function renderShooterTable(tbodyId, shooters) {
    const tbody = document.getElementById(tbodyId);
    // The column that gets the bold total-cell styling + highest/lowest
    // highlight is whichever one is actually labelled "Total": the
    // handicap-adjusted score in a handicap match, otherwise the raw total.
    const rankedTotals = shooters.map(s => isHandicapMatch ? effectiveScore(s.total, hcFor(s.shooter_id)) : s.total);
    const maxTotal = rankedTotals.length ? Math.max(...rankedTotals) : 0;
    const minTotal = rankedTotals.length ? Math.min(...rankedTotals) : 0;
    const hcCols = isHandicapMatch ? 2 : 0;
    let html = '';

    if (!shooters.length) {
        html = `<tr><td colspan="${9 + hcCols}" class="empty-table-msg">No scores entered yet</td></tr>`;
    }

    shooters.forEach((shooter, index) => {
        const rankedTotal = rankedTotals[index];
        let totalClass = 'total-cell';
        if (shooters.length && rankedTotal === maxTotal) totalClass += ' total-highest';
        else if (shooters.length && rankedTotal === minTotal) totalClass += ' total-lowest';
        html += `<tr>`;
        html += shooter.shooter_id
            ? `<td class="shooter-cell"><a class="shooter-link" href="shooter.html?id=${encodeURIComponent(shooter.shooter_id)}">${shooter.name}</a></td>`
            : `<td class="shooter-cell">${shooter.name}</td>`;
        shooter.scores.forEach(score => {
            html += `<td class="score-cell">${score}</td>`;
        });
        if (isHandicapMatch) {
            html += `<td class="score-cell">${shooter.total}</td>`;
            html += `<td class="score-cell hc-cell">${hcDisplay(shooter.shooter_id)}</td>`;
            html += `<td class="${totalClass}">${rankedTotal}</td>`;
        } else {
            html += `<td class="${totalClass}">${shooter.total}</td>`;
        }
        html += '</tr>';
    });

    tbody.innerHTML = html;
    return calculateTeamScores(shooters);
}

function renderTeamSummary(tbodyId, scores, opponentScores) {
    const tbody = document.getElementById(tbodyId);
    let html = '';

    if (!scores.aTeamShooters.length && !scores.bTeamShooters.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-table-msg">No scores entered yet</td></tr>';
        return;
    }

    const nameCell = s => s.shooter_id
        ? `<a class="shooter-link" href="shooter.html?id=${encodeURIComponent(s.shooter_id)}">${s.name}</a>`
        : s.name;

    scores.aTeamShooters.forEach((s, i) => {
        const bScore = (i === 4 && scores.bTeamShooters[0] && scores.bTeamShooters[0].name === s.name) ? s.total : '';
        html += `<tr><td class="summary-shooter">${nameCell(s)}</td><td class="score-cell">${s.total}</td><td class="score-cell">${bScore}</td></tr>`;
    });

    scores.bTeamShooters.forEach((s, i) => {
        if (i === 0) return;
        html += `<tr><td class="summary-shooter">${nameCell(s)}</td><td class="score-cell"></td><td class="score-cell">${s.total}</td></tr>`;
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
        .map(r => ({ name: r.shooter_name, shooter_id: r.shooter_id, scores: r.shots || [], total: r.total }));
    const awayShooters = rows.filter(r => r.team_name === params.away)
        .map(r => ({ name: r.shooter_name, shooter_id: r.shooter_id, scores: r.shots || [], total: r.total }));

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
const SHOT_ADVANCE_DELAY_MS = 5000; // time to let "1" become "10" before auto-advancing

// Per-table edit rights, set in initMatchPage.
//   pick  -> can assign shooters (each team's own captain/generic)
//   score -> can enter shot scores (home team only)
const editRights = {
    homeShooters: { pick: false, score: false },
    awayShooters: { pick: false, score: false }
};

// Confirmation / submission state and context.
let matchStatus = { home_confirmed: false, away_confirmed: false, submitted: false };
let confirmCtx = { matchId: null, canScore: false, homePick: false, awayPick: false };
let matchParams = null;
let lockedToReadOnly = false;

// Once a match is submitted, everyone (including the captains who entered
// it) sees the same plain read-only scorecard a guest would - the shooter
// pickers and shot-entry boxes disappear entirely rather than just locking.
async function lockMatchToReadOnly() {
    if (lockedToReadOnly || !matchParams) return;
    lockedToReadOnly = true;

    const rows = await NADARL.fetchMatchScorecard(matchParams.date, matchParams.home, matchParams.away);
    if (isHandicapMatch) {
        handicapMap = await NADARL.fetchHandicaps(
            rows.map(r => r.shooter_id).filter(Boolean), matchParams.date);
    }

    document.body.classList.remove('edit-mode');
    document.querySelectorAll('.match-confirm').forEach(el => el.remove());
    renderReadOnly(matchParams, rows);
}

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

        shooterList.forEach(s => list.appendChild(buildOption(s)));
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
        // type="text" + inputmode="numeric" instead of type="number": a
        // native number input still accepts "e", "+", "-", "." as valid
        // (partial) input even though they can never be a real shot score.
        // Digits are enforced entirely in JS instead (see the input listener).
        input.type = 'text';
        input.inputMode = 'numeric';
        input.pattern = '[0-9]*';
        input.autocomplete = 'off';
        input.className = 'shot-input';
        input.value = shots[i] != null ? shots[i] : '';
        td.appendChild(input);
        tr.appendChild(td);
    }

    const rawTotal = existing ? existing.total : 0;

    if (isHandicapMatch) {
        const hc = hcFor(existing && existing.shooter_id);

        const tdPreHc = document.createElement('td');
        tdPreHc.className = 'score-cell row-pre-hc';
        tdPreHc.textContent = rawTotal;
        tr.appendChild(tdPreHc);

        const tdHc = document.createElement('td');
        tdHc.className = 'score-cell hc-cell row-hc';
        tdHc.textContent = hcDisplay(existing && existing.shooter_id);
        tr.appendChild(tdHc);

        tr.appendChild(buildTotalCell(effectiveScore(rawTotal, hc)));
    } else {
        tr.appendChild(buildTotalCell(rawTotal));
    }

    return tr;
}

// The bold, highlighted "Total" cell - the raw total normally, or the
// handicap-adjusted total in a handicap match (the pre-HC total then gets
// its own plain column instead).
function buildTotalCell(value) {
    const tdTotal = document.createElement('td');
    tdTotal.className = 'total-cell';
    const totalInner = document.createElement('div');
    totalInner.className = 'total-cell-inner';
    const totalSpan = document.createElement('span');
    totalSpan.className = 'row-total';
    totalSpan.textContent = value;
    totalInner.appendChild(totalSpan);
    tdTotal.appendChild(totalInner);
    return tdTotal;
}

function recalcRowTotal(tr) {
    const inputs = tr.querySelectorAll('.shot-input');
    let total = 0;
    inputs.forEach(i => { total += i.value === '' ? 0 : (parseInt(i.value, 10) || 0); });

    if (isHandicapMatch) {
        const preHcCell = tr.querySelector('.row-pre-hc');
        if (preHcCell) preHcCell.textContent = total;
        const hc = Number((tr.querySelector('.row-hc') || {}).textContent) || 0;
        tr.querySelector('.row-total').textContent = effectiveScore(total, hc);
    } else {
        tr.querySelector('.row-total').textContent = total;
    }
}

// Re-read this row's shooter and refresh its HC + Total cells (handicap matches).
function refreshRowHandicap(tr) {
    if (!isHandicapMatch || !tr) return;
    const picker = tr.querySelector('.shooter-picker');
    const sid = picker ? picker.getAttribute('data-shooter-id') : null;
    const hc = hcFor(sid);
    const hcCell = tr.querySelector('.row-hc');
    if (hcCell) hcCell.textContent = hcDisplay(sid);
    const preHc = Number((tr.querySelector('.row-pre-hc') || {}).textContent) || 0;
    const totalSpan = tr.querySelector('.row-total');
    if (totalSpan) totalSpan.textContent = effectiveScore(preHc, hc);
}

function isRowComplete(tr) {
    const picker = tr.querySelector('.shooter-picker');
    const hasShooter = !!(picker && picker.getAttribute('data-shooter-id'));
    const inputs = tr.querySelectorAll('.shot-input');
    return hasShooter && Array.from(inputs).every(i => i.value !== '');
}

// True if a team's card has a shooter picked but not all 7 shots entered -
// blocks that side from confirming (a picked shooter can't be left blank).
function hasIncompleteRow(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return false;
    return Array.from(tbody.querySelectorAll('tr.score-edit-row')).some(tr => {
        const picker = tr.querySelector('.shooter-picker');
        const hasShooter = !!(picker && picker.getAttribute('data-shooter-id'));
        return hasShooter && !isRowComplete(tr);
    });
}

// Colours the highest/lowest Total in a team's editable scorecard, mirroring
// what renderShooterTable already does for the read-only view. Only rows
// with a shooter picked and every shot entered count, so in-progress rows
// don't skew it.
function updateTotalHighlights(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const allRows = Array.from(tbody.querySelectorAll('tr.score-edit-row'));
    allRows.forEach(tr => {
        const cell = tr.querySelector('.total-cell');
        if (cell) cell.classList.remove('total-highest', 'total-lowest');
    });

    const completeRows = allRows.filter(isRowComplete);
    if (!completeRows.length) return;

    const totals = completeRows.map(tr => Number((tr.querySelector('.row-total') || {}).textContent) || 0);
    const maxTotal = Math.max(...totals);
    const minTotal = Math.min(...totals);

    completeRows.forEach((tr, i) => {
        const cell = tr.querySelector('.total-cell');
        if (!cell) return;
        if (totals[i] === maxTotal) cell.classList.add('total-highest');
        else if (totals[i] === minTotal) cell.classList.add('total-lowest');
    });
}

function updateCurrentShooter(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const rights = editRights[tbodyId] || { pick: false, score: false };
    const locked = matchStatus.submitted;
    const rows = Array.from(tbody.querySelectorAll('tr.score-edit-row'));
    // The current (in-progress) row is the first one not yet fully shot. Only
    // it, plus the one shooter directly before it, can still have scores
    // edited - anything further back is locked, so a mistake more than one
    // shooter ago can't accidentally be changed after the fact.
    const foundIndex = rows.findIndex(tr => !isRowComplete(tr));
    const currentIndex = foundIndex === -1 ? rows.length : foundIndex;
    let prevHasShooter = true;
    rows.forEach((tr, index) => {
        const picker = tr.querySelector('.shooter-picker');
        const hasShooter = !!(picker && picker.getAttribute('data-shooter-id'));
        const trigger = picker ? picker.querySelector('.shooter-picker-trigger') : null;
        const hasScores = Array.from(tr.querySelectorAll('.shot-input')).some(i => i.value !== '');
        if (trigger) trigger.disabled = locked || !rights.pick || !prevHasShooter || (hasShooter && hasScores);

        const isCurrent = index === currentIndex;
        tr.classList.toggle('current-shooter', isCurrent);
        const isRecentlyCompleted = index === currentIndex - 1 && isRowComplete(tr);
        const shotsEditable = !locked && rights.score && hasShooter && (isCurrent || isRecentlyCompleted);
        // Within an editable row, only the next empty shot box (plus every box
        // already filled before it) is enabled - later boxes stay disabled
        // until it's filled, so a shot can't be skipped by mistake. A fully
        // complete row (all 7 filled) leaves every box open for correction.
        const shotInputs = Array.from(tr.querySelectorAll('.shot-input'));
        let firstEmptyIndex = shotInputs.findIndex(i => i.value === '');
        if (firstEmptyIndex === -1) firstEmptyIndex = shotInputs.length;
        shotInputs.forEach((el, idx) => {
            el.disabled = !shotsEditable || idx > firstEmptyIndex;
        });
        tr.classList.toggle('row-locked', !shotsEditable);

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
            // Only the shots actually entered so far are saved - an unfilled
            // box must never be persisted as a scored 0, or a shooter picked
            // ahead of their turn would look like they'd already shot a
            // string of zeros (and the row would wrongly read as complete).
            const shots = [];
            for (const input of tr.querySelectorAll('.shot-input')) {
                if (input.value === '') break;
                shots.push(parseInt(input.value, 10) || 0);
            }
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
    const homeRows = gatherTeamRows(homeTbodyId).map(r => ({ name: r.name, shooter_id: r.shooter_id, total: r.total, scores: r.shots }));
    const awayRows = gatherTeamRows(awayTbodyId).map(r => ({ name: r.name, shooter_id: r.shooter_id, total: r.total, scores: r.shots }));

    const homeScores = calculateTeamScores(homeRows);
    const awayScores = calculateTeamScores(awayRows);
    updateHeaderScores(homeScores, awayScores);
    renderMatchSummary(params.home, homeScores, params.away, awayScores);
    updateTotalHighlights(homeTbodyId);
    updateTotalHighlights(awayTbodyId);
}

// Applies a live scorecard refresh to an editable grid one row at a time,
// rebuilding each row from the fresh data - except a row the user has focus
// in (or has its shooter-picker dropdown open), which is left alone so a
// remote update never yanks their cursor or closes a menu mid-edit. Only
// that one row is stale until they move on; everything else stays live.
// renderEditableGrid's keydown/input/change listeners are delegated on the
// tbody itself, so swapping individual <tr> elements needs no re-binding.
function updateEditableRowsLive(tbodyId, shooterList, existingRows, teamId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const trs = Array.from(tbody.querySelectorAll('tr.score-edit-row'));
    const rowCount = Math.max(trs.length, existingRows.length);
    for (let i = 0; i < rowCount; i++) {
        const tr = trs[i];
        if (tr && (tr.contains(document.activeElement) || tr.querySelector('.shooter-picker-panel:not([hidden])'))) {
            continue;
        }
        const fresh = buildEditRow(shooterList, existingRows[i] || null, teamId);
        if (tr) tr.replaceWith(fresh);
        else tbody.appendChild(fresh);
    }
}

function renderEditableGrid(tbodyId, matchId, teamId, shooterList, existingRows, editable, params, homeTbodyId, awayTbodyId) {
    const tbody = document.getElementById(tbodyId);
    tbody.innerHTML = '';

    if (!editable) {
        const shooters = existingRows.map(r => ({ name: r.shooter_name, shooter_id: r.shooter_id, scores: r.shots || [], total: r.total }));
        const scores = renderShooterTable(tbodyId, shooters);
        return scores;
    }

    existingRows.forEach(r => tbody.appendChild(buildEditRow(shooterList, r, teamId)));
    while (tbody.querySelectorAll('tr.score-edit-row').length < 9) {
        tbody.appendChild(buildEditRow(shooterList, null, teamId));
    }

    // Filling the active box auto-advances focus to the next one, so
    // sequential entry stays quick despite the boxes ahead being locked. It's
    // debounced so a two-digit "10" has time to finish before advancing -
    // typing "1" alone doesn't instantly jump away and strand the "0".
    let advanceTimer = null;
    function scheduleAdvance(tr, input) {
        if (advanceTimer) clearTimeout(advanceTimer);
        advanceTimer = setTimeout(() => {
            advanceTimer = null;
            if (document.activeElement !== input) return;
            const shotInputs = Array.from(tr.querySelectorAll('.shot-input'));
            const nextInput = shotInputs[shotInputs.indexOf(input) + 1];
            if (nextInput && !nextInput.disabled) nextInput.focus();
        }, SHOT_ADVANCE_DELAY_MS);
    }

    tbody.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('shot-input') && e.key === 'Enter' && e.target.value !== '') {
            e.preventDefault();
            scheduleAdvance(e.target.closest('tr'), e.target);
        }
    });

    tbody.addEventListener('input', (e) => {
        if (e.target.classList.contains('shot-input')) {
            const digitsOnly = e.target.value.replace(/[^0-9]/g, '');
            if (digitsOnly !== e.target.value) e.target.value = digitsOnly;
            const v = e.target.value;
            const filledNow = v !== '';
            if (filledNow) {
                let n = parseInt(v, 10);
                if (n > 10) n = 10;
                if (String(n) !== v) e.target.value = n;
            }
            const tr = e.target.closest('tr');
            recalcRowTotal(tr);
            recalcSummary(params, homeTbodyId, awayTbodyId);
            updateCurrentShooters();
            if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
            if (filledNow) {
                // A value of 1 could still become 10, so give it a moment
                // before advancing; anything else (2-9, or a cleared/retyped
                // 10) is unambiguous and advances immediately.
                if (v === '1') {
                    scheduleAdvance(tr, e.target);
                } else {
                    const shotInputs = Array.from(tr.querySelectorAll('.shot-input'));
                    const nextInput = shotInputs[shotInputs.indexOf(e.target) + 1];
                    if (nextInput && !nextInput.disabled) nextInput.focus();
                }
            }
            scheduleSave();
        }
    });
    tbody.addEventListener('change', (e) => {
        if (e.target.classList.contains('shooter-picker')) {
            refreshRowHandicap(e.target.closest('tr'));
            recalcSummary(params, homeTbodyId, awayTbodyId);
            updateCurrentShooters();
            scheduleSave();
        }
    });

    // Status indicator (auto-saves on every change)
    const column = tbody.closest('.score-table-column');
    let statusEl = column && column.querySelector('.score-status');
    if (column && !statusEl) {
        statusEl = document.createElement('div');
        statusEl.className = 'score-status';
        column.appendChild(statusEl);
    }

    let saveTimer = null;
    let saveInFlight = false;
    let dirty = false;
    function scheduleSave() {
        if (statusEl) statusEl.textContent = 'Editing…';
        dirty = true;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flushSave, 700);
    }
    async function flushSave() {
        if (saveInFlight) { saveTimer = setTimeout(flushSave, 300); return; }
        if (!dirty) return;
        dirty = false;
        saveInFlight = true;
        if (statusEl) statusEl.textContent = 'Saving…';
        const rows = gatherTeamRows(tbodyId);
        const res = await NADARL.saveTeamScores(matchId, teamId, rows);
        saveInFlight = false;
        if (statusEl) {
            statusEl.textContent = res.ok
                ? 'Saved ' + rows.length + ' score(s)'
                : 'Save failed: ' + res.error;
        }
        if (res.ok && !matchStatus.submitted) {
            await NADARL.resetMatchConfirm(matchId);
            matchStatus = (await NADARL.fetchMatchStatus(matchId)) || matchStatus;
            refreshConfirmUI();
        }
        if (dirty) flushSave();
    }

    return calculateTeamScores(existingRows.map(r => ({ name: r.shooter_name, total: r.total })));
}

// ---------------------------------------------------------------------
// Confirmation / submission UI
// ---------------------------------------------------------------------

function buildConfirmArea(side) {
    const column = side === 'home'
        ? document.getElementById('homeShooters').closest('.score-table-column')
        : document.getElementById('awayShooters').closest('.score-table-column');
    if (!column || column.querySelector('.match-confirm')) return;

    const wrap = document.createElement('div');
    wrap.className = 'match-confirm';
    wrap.setAttribute('data-side', side);

    const statusEl = document.createElement('div');
    statusEl.className = 'match-confirm-status';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'confirm-btn';
    confirmBtn.textContent = 'Confirm Results';
    const tbodyId = side === 'home' ? 'homeShooters' : 'awayShooters';
    confirmBtn.addEventListener('click', async () => {
        const confirmed = side === 'home' ? matchStatus.home_confirmed : matchStatus.away_confirmed;
        if (!confirmed && hasIncompleteRow(tbodyId)) {
            window.alert('Every shooter picked needs all 7 shots entered before this side can be confirmed.');
            return;
        }
        confirmBtn.disabled = true;
        const res = confirmed
            ? await NADARL.unconfirmMatchSide(confirmCtx.matchId, side)
            : await NADARL.confirmMatchSide(confirmCtx.matchId, side);
        if (res.ok) {
            matchStatus = (await NADARL.fetchMatchStatus(confirmCtx.matchId)) || matchStatus;
        } else {
            window.alert('Could not update confirmation: ' + (res.error || 'not permitted'));
        }
        refreshConfirmUI();
        updateCurrentShooters();
    });

    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'submit-btn';
    submitBtn.textContent = 'Submit to League';
    submitBtn.addEventListener('click', async () => {
        if (!confirm('Submit these results to the league? This cannot be undone.')) return;
        submitBtn.disabled = true;
        const res = await NADARL.submitMatch(confirmCtx.matchId);
        if (res.ok) {
            matchStatus = (await NADARL.fetchMatchStatus(confirmCtx.matchId)) || matchStatus;
        } else {
            window.alert('Could not submit: ' + (res.error || 'not permitted'));
        }
        refreshConfirmUI();
        updateCurrentShooters();
    });

    wrap.appendChild(statusEl);
    wrap.appendChild(confirmBtn);
    wrap.appendChild(submitBtn);
    column.appendChild(wrap);
}

function refreshConfirmUI() {
    const { submitted, home_confirmed, away_confirmed } = matchStatus;
    const both = home_confirmed && away_confirmed;

    if (submitted) {
        lockMatchToReadOnly();
    }

    // Status text under each table
    document.querySelectorAll('.match-confirm').forEach(wrap => {
        const side = wrap.getAttribute('data-side');
        const confirmed = side === 'home' ? home_confirmed : away_confirmed;
        const statusEl = wrap.querySelector('.match-confirm-status');
        const confirmBtn = wrap.querySelector('.confirm-btn');
        const submitBtn = wrap.querySelector('.submit-btn');

        if (submitted) {
            statusEl.textContent = 'Results submitted ✓';
            statusEl.className = 'match-confirm-status submitted';
            confirmBtn.hidden = true;
            submitBtn.hidden = true;
            return;
        }

        const canConfirm = side === 'home' ? confirmCtx.homePick : confirmCtx.awayPick;
        statusEl.textContent = confirmed
            ? (side === 'home' ? 'Home confirmed ✓' : 'Away confirmed ✓')
            : (side === 'home' ? 'Home: awaiting confirmation' : 'Away: awaiting confirmation');
        statusEl.className = 'match-confirm-status' + (confirmed ? ' confirmed' : '');

        confirmBtn.hidden = !canConfirm;
        confirmBtn.disabled = false;
        confirmBtn.textContent = confirmed ? 'Unconfirm' : 'Confirm Results';
        confirmBtn.classList.toggle('unconfirm', confirmed);

        // Submit only on home side, only when both confirmed, only for home team
        if (side === 'home') {
            submitBtn.hidden = !(both && confirmCtx.canScore);
            submitBtn.disabled = false;
        } else {
            submitBtn.hidden = true;
        }
    });

    // Read-only status bar (shown to everyone)
    const bar = document.getElementById('matchStatusBar');
    if (bar) {
        if (submitted) {
            bar.textContent = 'Results submitted ✓';
            bar.className = 'match-status-bar submitted';
        } else {
            const h = home_confirmed ? 'Home ✓' : 'Home ✗';
            const a = away_confirmed ? 'Away ✓' : 'Away ✗';
            bar.textContent = `Confirmation — ${h}  •  ${a}`;
            bar.className = 'match-status-bar';
        }
    }
}

async function setupConfirmFlow(match, canScore, homePick, awayPick, isEdit) {
    if (!match) return;
    confirmCtx = { matchId: match.id, canScore, homePick, awayPick };

    let bar = document.getElementById('matchStatusBar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'matchStatusBar';
        bar.className = 'match-status-bar';
        document.getElementById('matchHeader').appendChild(bar);
    }

    matchStatus = (await NADARL.fetchMatchStatus(match.id)) || matchStatus;

    if (isEdit) {
        buildConfirmArea('home');
        if (match.away_team_id) buildConfirmArea('away');
    }
    refreshConfirmUI();
    updateCurrentShooters();

    const channel = NADARL.subscribeMatch(match.id, async () => {
        matchStatus = (await NADARL.fetchMatchStatus(match.id)) || matchStatus;
        refreshConfirmUI();
        updateCurrentShooters();
    });
    window.addEventListener('beforeunload', () => NADARL.unsubscribeChannel(channel));
}

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------

async function initMatchPage() {
    const params = getQueryParams();

    matchParams = params;

    if (!params.home || !params.away) {
        document.querySelector('.container').innerHTML = '<div class="no-match">No match data found. Please go back to <a href="fixtures.html">Fixtures</a>.</div>';
        return;
    }

    document.title = `${params.home} vs ${params.away} - Newport & District Air Rifle League`;
    document.getElementById('homeTeamName').textContent = params.home;
    document.getElementById('awayTeamName').textContent = params.away;

    const slugMap = await NADARL.fetchTeamSlugMap();
    setMatchBadge('.home-team .team-badge-large', params.home, slugMap);
    setMatchBadge('.away-team .team-badge-large', params.away, slugMap);
    document.getElementById('homeTeamTableTitle').textContent = params.home;
    document.getElementById('awayTeamTableTitle').textContent = params.away;

    const profile = await NADARL.fetchMyProfile();
    const role = profile ? profile.role : null;
    const isAdmin = role === 'admin';
    const isCaptainOrGeneric = role === 'captain' || role === 'generic';

    const match = await NADARL.fetchMatch(params.date, params.home, params.away);
    const rows = await NADARL.fetchMatchScorecard(params.date, params.home, params.away);

    isHandicapMatch = !!(match && match.half === 2);
    if (isHandicapMatch) {
        showHandicapBanner();
        ensureHandicapHeaders();
    }

    // Scores (shots) are entered by the home team only; shooters can be
    // assigned by each team's own captain/generic account. Admins do both.
    // NOTE: today-check disabled for testing.
    const today = !!match;
    const isHome = match && isCaptainOrGeneric && profile.team_id === match.home_team_id;
    const canScore = !!(isAdmin || (today && isHome));
    const homeCanPick = !!(isAdmin || (today && isCaptainOrGeneric && profile.team_id === match.home_team_id));
    const awayCanPick = !!(isAdmin || (today && isCaptainOrGeneric && match && match.away_team_id && profile.team_id === match.away_team_id));

    editRights.homeShooters = { pick: homeCanPick, score: canScore };
    editRights.awayShooters = { pick: awayCanPick, score: canScore };

    const homeEditable = homeCanPick || canScore;
    const awayEditable = !!(match && match.away_team_id) && (awayCanPick || canScore);
    const canEdit = homeEditable || awayEditable;

    if (!canEdit) {
        lockedToReadOnly = true;
        if (isHandicapMatch) {
            handicapMap = await NADARL.fetchHandicaps(
                rows.map(r => r.shooter_id).filter(Boolean), params.date);
        }
        renderReadOnly(params, rows);
        if (match) {
            let refreshTimer = null;
            const channel = NADARL.subscribeMatchScores(match.id, () => {
                clearTimeout(refreshTimer);
                refreshTimer = setTimeout(async () => {
                    const fresh = await NADARL.fetchMatchScorecard(params.date, params.home, params.away);
                    if (isHandicapMatch) {
                        handicapMap = await NADARL.fetchHandicaps(
                            fresh.map(r => r.shooter_id).filter(Boolean), params.date);
                    }
                    renderReadOnly(params, fresh);
                }, 300);
            });
            window.addEventListener('beforeunload', () => NADARL.unsubscribeChannel(channel));
        }
        setupConfirmFlow(match, canScore, homeCanPick, awayCanPick, false);
        return;
    }

    const homeTeamId = match.home_team_id;
    const awayTeamId = match.away_team_id;

    const homeShooters = homeCanPick || canScore ? await NADARL.fetchShootersForTeam(homeTeamId) : [];
    const awayShooters = (awayCanPick || canScore) && awayTeamId ? await NADARL.fetchShootersForTeam(awayTeamId) : [];

    if (isHandicapMatch) {
        const ids = [];
        rows.forEach(r => { if (r.shooter_id) ids.push(r.shooter_id); });
        homeShooters.forEach(s => ids.push(s.id));
        awayShooters.forEach(s => ids.push(s.id));
        handicapMap = await NADARL.fetchHandicaps(ids, params.date);
    }

    const homeExisting = rows.filter(r => r.team_name === params.home);
    const awayExisting = rows.filter(r => r.team_name === params.away);

    document.body.classList.add('edit-mode');

    if (homeEditable) {
        renderEditableGrid('homeShooters', match.id, homeTeamId, homeShooters, homeExisting, true, params, 'homeShooters', 'awayShooters');
    } else {
        renderShooterTable('homeShooters', homeExisting.map(r => ({ name: r.shooter_name, shooter_id: r.shooter_id, scores: r.shots || [], total: r.total })));
    }
    if (match.away_team_id) {
        if (awayEditable) {
            renderEditableGrid('awayShooters', match.id, awayTeamId, awayShooters, awayExisting, true, params, 'homeShooters', 'awayShooters');
        } else {
            renderShooterTable('awayShooters', awayExisting.map(r => ({ name: r.shooter_name, shooter_id: r.shooter_id, scores: r.shots || [], total: r.total })));
        }
    }

    recalcSummary(params, 'homeShooters', 'awayShooters');
    updateCurrentShooters();
    setupConfirmFlow(match, canScore, homeCanPick, awayCanPick, true);

    // Live updates: when the other editor (e.g. the other team's captain)
    // picks a shooter or saves scores, reflect it here too instead of only
    // on the next page load.
    let scoresRefreshTimer = null;
    const scoresChannel = NADARL.subscribeMatchScores(match.id, () => {
        clearTimeout(scoresRefreshTimer);
        scoresRefreshTimer = setTimeout(async () => {
            const fresh = await NADARL.fetchMatchScorecard(params.date, params.home, params.away);
            if (isHandicapMatch) {
                handicapMap = await NADARL.fetchHandicaps(
                    fresh.map(r => r.shooter_id).filter(Boolean), params.date);
            }
            const freshHome = fresh.filter(r => r.team_name === params.home);
            const freshAway = fresh.filter(r => r.team_name === params.away);

            if (homeEditable) {
                updateEditableRowsLive('homeShooters', homeShooters, freshHome, homeTeamId);
            } else {
                renderShooterTable('homeShooters', freshHome.map(r => ({ name: r.shooter_name, shooter_id: r.shooter_id, scores: r.shots || [], total: r.total })));
            }
            if (match.away_team_id) {
                if (awayEditable) {
                    updateEditableRowsLive('awayShooters', awayShooters, freshAway, awayTeamId);
                } else {
                    renderShooterTable('awayShooters', freshAway.map(r => ({ name: r.shooter_name, shooter_id: r.shooter_id, scores: r.shots || [], total: r.total })));
                }
            }
            recalcSummary(params, 'homeShooters', 'awayShooters');
            updateCurrentShooters();
        }, 300);
    });
    window.addEventListener('beforeunload', () => NADARL.unsubscribeChannel(scoresChannel));
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
