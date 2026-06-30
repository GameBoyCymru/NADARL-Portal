// =====================================================================
//  Admin fixtures generator (admin only).
//  Builds a double round-robin (every team home & away vs every other)
//  with one match day per Monday, auto-byes for odd team counts, and
//  support for excluding specific Mondays (shifted to the next Monday).
// =====================================================================

const FixturesAdmin = (function () {
    let teams = [];
    let seasons = [];
    let excluded = new Set();
    let preview = []; // generated match rows ready to insert

    function $(id) { return document.getElementById(id); }

    async function init() {
        const me = await NADARL.fetchMyProfile();
        if (!me || me.role !== 'admin') return;       // section lives in hidden admin panel
        if (!$('fixturesPanel')) return;

        teams = await NADARL.fetchTeams();
        seasons = await NADARL.fetchSeasons();
        if (!teams.length) { show('No teams found. Add teams first.'); return; }

        populateSeasons();
        applySeasonToMondays();
        wire();
    }

    // Mondays only exist during the league window: Sep + Oct of the season's
    // start year (parsed from the season name, e.g. "2026-27" -> 2026).
    function seasonStartYear(season) {
        if (season && season.name) {
            const m = String(season.name).match(/\d{4}/);
            if (m) return parseInt(m[0], 10);
        }
        return new Date().getFullYear();
    }

    function selectedSeason() {
        const id = $('fxSeason').value;
        return seasons.find(s => s.id === id) || seasons[0] || null;
    }

    // Repopulate the Monday dropdowns for the selected season.
    function applySeasonToMondays() {
        const season = selectedSeason();
        if (!season) {
            $('fxStart').innerHTML = '';
            $('fxExcludeDate').innerHTML = '';
            return;
        }
        const year = seasonStartYear(season);
        populateStartSelect(year);     // league kicks off Sep-Oct
        populateExcludeSelect(year);   // exclusions can fall anywhere mid-season
        excluded.clear();              // exclusions are season-specific
        renderExcluded();
    }

    // First Monday dropdown: only Sep-Oct of the start year (the league start window).
    function populateStartSelect(year) {
        const sel = $('fxStart');
        sel.innerHTML = '';
        const d = ensureMonday(new Date(year, 8, 1));   // first Monday on/after 1 Sep
        const end = new Date(year, 9, 31);              // 31 Oct
        let first = true;
        while (d <= end) {
            const iso = toISO(d);
            const o = document.createElement('option');
            o.value = iso; o.textContent = fmtDate(iso);
            if (first) { o.selected = true; first = false; }
            sel.appendChild(o);
            d.setDate(d.getDate() + 7);
        }
    }

    // Exclude dropdown: every Monday across the full season span
    // (Sep of start year -> Apr of the following year), for mid-league removals.
    function populateExcludeSelect(year) {
        const sel = $('fxExcludeDate');
        sel.innerHTML = '<option value="" disabled selected>Pick a Monday…</option>';
        const d = ensureMonday(new Date(year, 8, 1));   // first Monday on/after 1 Sep
        const end = new Date(year + 1, 3, 30);          // 30 Apr next year
        while (d <= end) {
            const iso = toISO(d);
            const o = document.createElement('option');
            o.value = iso; o.textContent = fmtDate(iso);
            sel.appendChild(o);
            d.setDate(d.getDate() + 7);
        }
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
        applySeasonToMondays();
    }

    function wire() {
        $('fxAddExclude').addEventListener('click', addExclude);
        $('fxGenerate').addEventListener('click', generate);
        $('fxSave').addEventListener('click', save);
        $('fxClear').addEventListener('click', clearAll);
        $('fxAddSeason').addEventListener('click', createSeason);
        $('fxSeason').addEventListener('change', applySeasonToMondays);
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

    function addExclude() {
        const inp = $('fxExcludeDate');
        const v = inp.value;
        if (!v) { show('Pick a Monday to exclude.', 'error'); return; }
        excluded.add(v);
        inp.value = '';
        renderExcluded();
    }

    function removeExclude(iso) {
        excluded.delete(iso);
        renderExcluded();
    }

    function renderExcluded() {
        const list = $('fxExcludedList');
        list.innerHTML = '';
        Array.from(excluded).sort().forEach(iso => {
            const chip = document.createElement('span');
            chip.className = 'fx-chip';
            chip.textContent = fmtDate(iso) + '  ✕';
            chip.title = 'Click to remove';
            chip.addEventListener('click', () => removeExclude(iso));
            list.appendChild(chip);
        });
    }

    // ---- round robin -------------------------------------------------
    // Single round-robin: each team plays once per round. With an odd number
    // of teams one team gets a BYE each round (dummy opponent).
    function singleRoundRobin() {
        const n = teams.length;
        if (n < 2) return [];
        const hasBye = n % 2 !== 0;
        const work = hasBye ? teams.concat([null]) : teams.slice();
        const m = work.length;
        const fixed = work[0];
        let rest = work.slice(1);
        const rounds = [];

        for (let r = 0; r < m - 1; r++) {
            const line = [fixed, ...rest];
            const round = [];
            for (let i = 0; i < m / 2; i++) {
                const a = line[i];
                const b = line[m - 1 - i];
                if (a === null || b === null) {
                    round.push({ home: a || b, away: null, bye: true });
                } else if ((r + i) % 2 === 0) {
                    round.push({ home: a, away: b });
                } else {
                    round.push({ home: b, away: a });
                }
            }
            rounds.push(round);
            // rotate rest: last element moves to front
            rest = [rest[rest.length - 1], ...rest.slice(0, -1)];
        }
        return rounds;
    }

    // Double round-robin: single + its mirror (home/away swapped), so every
    // pair meets twice (home and away).
    function doubleRoundRobin() {
        const single = singleRoundRobin();
        const mirror = single.map(rd => rd.map(g =>
            g.bye
                ? { home: g.home, away: null, bye: true }
                : { home: g.away, away: g.home }
        ));
        return single.concat(mirror);
    }

    // Full season = two double round-robins:
    //   half 1 = normal (each pair home & away)
    //   half 2 = handicap (the whole thing repeated, home & away again)
    function buildFullSeason() {
        const tag = (rounds, half) => rounds.map(rd => rd.map(g => ({ ...g, half })));
        return tag(doubleRoundRobin(), 1).concat(tag(doubleRoundRobin(), 2));
    }

    function generate() {
        const startInput = $('fxStart').value;
        if (!startInput) { show('Pick a start date.', 'error'); return; }
        const begin = ensureMonday(parseDate(startInput));

        const rounds = buildFullSeason();
        if (!rounds.length) { show('Need at least two teams.', 'error'); return; }

        // one Monday per round, skipping excluded Mondays
        const dates = [];
        let d = new Date(begin);
        while (dates.length < rounds.length) {
            const iso = toISO(d);
            if (!excluded.has(iso)) dates.push(iso);
            d.setDate(d.getDate() + 7);
        }

        preview = [];
        rounds.forEach((rd, ri) => {
            const iso = dates[ri];
            rd.forEach(g => {
                preview.push({
                    match_date: iso,
                    home_team_id: g.home.id,
                    away_team_id: g.away ? g.away.id : null,
                    venue: g.home.venue,
                    half: g.half,
                    _home: g.home.name,
                    _away: g.away ? g.away.name : null,
                    _bye: g.bye
                });
            });
        });

        renderPreview(dates);
        $('fxSave').disabled = false;
        show('Preview ready. ' + dates.length + ' match days, ' +
            preview.filter(p => !p._bye).length + ' matches. Review then Save.', 'success');
    }

    function renderPreview(dates) {
        const body = $('fxPreviewBody');
        body.innerHTML = '';
        // sort preview by date then home team
        preview.slice().sort((a, b) => a.match_date.localeCompare(b.match_date) || a._home.localeCompare(b._home))
            .forEach(row => {
                const tr = document.createElement('tr');
                if (row._bye) tr.className = 'fx-bye-row';
                const halfLabel = row.half === 2
                    ? '<span class="fx-half-badge" title="Second half (handicaps)">Handicap</span>'
                    : '<span class="fx-half-first">1st</span>';
                tr.innerHTML =
                    '<td>' + fmtDate(row.match_date) + '</td>' +
                    '<td>' + halfLabel + '</td>' +
                    '<td>' + row._home + '</td>' +
                    '<td>' + (row._bye ? '<span class="bye-badge">BYE</span>' : row._away) + '</td>' +
                    '<td>' + (row._bye ? '—' : row.venue) + '</td>';
                body.appendChild(tr);
            });
        $('fxPreviewWrap').hidden = false;
    }

    async function save() {
        if (!preview.length) { show('Generate a preview first.', 'error'); return; }
        const seasonId = $('fxSeason').value;
        if (!seasonId) { show('Pick a season.', 'error'); return; }
        if (!confirm('This REPLACES all existing fixtures (and their scores). Continue?')) return;

        $('fxSave').disabled = true;
        const cleared = await NADARL.clearMatches();
        if (!cleared.ok) {
            $('fxSave').disabled = false;
            show('Could not clear existing fixtures: ' + cleared.error, 'error');
            return;
        }
        const rows = preview.map(p => ({
            season_id: seasonId,
            match_date: p.match_date,
            home_team_id: p.home_team_id,
            away_team_id: p.away_team_id,
            venue: p.venue,
            half: p.half
        }));
        const res = await NADARL.insertMatches(rows);
        $('fxSave').disabled = false;
        if (!res.ok) { show('Could not save fixtures: ' + res.error, 'error'); return; }
        show('Fixtures saved. ' + rows.length + ' matches across ' +
            new Set(rows.map(r => r.match_date)).size + ' Mondays.', 'success');
    }

    async function clearAll() {
        if (!confirm('Delete ALL fixtures and their scores?')) return;
        const res = await NADARL.clearMatches();
        if (!res.ok) { show('Could not clear fixtures: ' + res.error, 'error'); return; }
        preview = [];
        $('fxPreviewWrap').hidden = true;
        $('fxSave').disabled = true;
        show('All fixtures cleared.', 'success');
    }

    // ---- date helpers ------------------------------------------------
    function parseDate(iso) {
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    function toISO(d) {
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }
    function ensureMonday(d) {
        const day = d.getDay();            // 0 Sun .. 6 Sat
        const diff = (1 - day + 7) % 7;    // days forward to Monday
        const r = new Date(d);
        r.setDate(r.getDate() + diff);
        return r;
    }
    function fmtDate(iso) {
        const d = parseDate(iso);
        return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
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
