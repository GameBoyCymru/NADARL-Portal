// =====================================================================
//  Admin fixtures panel (admin only): season create/delete and score
//  resets.
//
//  The automatic round-robin generator and the excluded-Mondays manager
//  that used to live here have both been removed - they're being rebuilt
//  from scratch as a combined Events/Exclusions wizard, so competitions
//  can become real fixtures instead of just blocking a date.
// =====================================================================

const FixturesAdmin = (function () {
    let seasons = [];

    function $(id) { return document.getElementById(id); }

    async function init() {
        const me = await NADARL.fetchMyProfile();
        if (!me || me.role !== 'admin') return;       // section lives in hidden admin panel
        if (!$('fixturesPanel')) return;

        seasons = await NADARL.fetchSeasons();
        populateSeasons();
        wire();
    }

    function selectedSeason() {
        const id = $('fxSeason').value;
        return seasons.find(s => s.id === id) || seasons[0] || null;
    }

    function populateSeasons() {
        const sel = $('fxSeason');
        sel.innerHTML = '';
        if (!seasons.length) {
            const o = document.createElement('option');
            o.value = '';
            o.textContent = 'Create a season below first…';
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

    async function refreshSeasons() {
        seasons = await NADARL.fetchSeasons();
        populateSeasons();
    }

    function wire() {
        $('fxAddSeason').addEventListener('click', createSeason);
        $('fxResetScores').addEventListener('click', resetScores);
        $('fxDeleteSeason').addEventListener('click', deleteSeason);
    }

    // Clears every entered score for the selected season and resets each of
    // its matches back to unconfirmed/unsubmitted. The fixture schedule
    // (dates, teams, venues) and excluded Mondays are left exactly as they
    // are - this only wipes shooter/team stats, not the season's structure.
    async function resetScores() {
        const season = selectedSeason();
        if (!season) { show('No season selected.', 'error'); return; }
        if (!confirm(
            'Clear all entered scores for season "' + season.name + '"? ' +
            'Fixtures and excluded dates are kept - this only resets scores and stats for this season. ' +
            'This cannot be undone.'
        )) return;

        const btn = $('fxResetScores');
        btn.disabled = true;
        const res = await NADARL.resetSeasonScores(season.id);
        btn.disabled = false;
        if (!res.ok) { show('Could not reset scores: ' + res.error, 'error'); return; }

        show('Scores for "' + season.name + '" have been reset.', 'success');
    }

    async function deleteSeason() {
        const season = selectedSeason();
        if (!season) { show('No season selected.', 'error'); return; }
        if (!confirm(
            'Permanently delete season "' + season.name + '" and all of its fixtures and scores? ' +
            'This cannot be undone.'
        )) return;

        const btn = $('fxDeleteSeason');
        btn.disabled = true;
        const res = await NADARL.deleteSeason(season.id);
        btn.disabled = false;
        if (!res.ok) { show('Could not delete season: ' + res.error, 'error'); return; }

        await refreshSeasons();
        show('Season "' + season.name + '" deleted.', 'success');
    }

    async function createSeason() {
        const nameEl = $('fxNewSeasonName');
        const name = nameEl.value.trim();
        if (!name) { show('Enter a season name (e.g. 2026-27).', 'error'); return; }
        const btn = $('fxAddSeason');
        btn.disabled = true;
        const res = await NADARL.addSeason({
            name,
            is_current: $('fxNewSeasonCurrent').checked
        });
        btn.disabled = false;
        if (!res.ok) { show('Could not create season: ' + res.error, 'error'); return; }
        nameEl.value = '';
        await refreshSeasons();
        show('Season "' + name + '" created.', 'success');
    }

    function show(text, type) {
        const el = $('fxMessage');
        el.textContent = text;
        el.className = 'login-message login-message-' + (type || '');
        el.hidden = false;
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', FixturesAdmin.init);
