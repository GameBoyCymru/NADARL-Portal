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
        defaultStartDate();
        wire();
    }

    function populateSeasons() {
        const sel = $('fxSeason');
        sel.innerHTML = '';
        const current = seasons.find(s => s.is_current) || seasons[0];
        seasons.forEach(s => {
            const o = document.createElement('option');
            o.value = s.id;
            o.textContent = s.name;
            if (current && s.id === current.id) o.selected = true;
            sel.appendChild(o);
        });
    }

    function defaultStartDate() {
        // next Monday
        const d = new Date();
        const day = d.getDay(); // 0 Sun .. 6 Sat
        const diff = (8 - day) % 7 || 7; // days until next Monday
        d.setDate(d.getDate() + diff);
        $('fxStart').value = toISO(d);
    }

    function wire() {
        $('fxAddExclude').addEventListener('click', addExclude);
        $('fxExcludeDate').addEventListener('change', e => {
            if (e.target.value) $('fxAddExclude').focus();
        });
        $('fxGenerate').addEventListener('click', generate);
        $('fxSave').addEventListener('click', save);
        $('fxClear').addEventListener('click', clearAll);
    }

    function addExclude() {
        const inp = $('fxExcludeDate');
        const v = inp.value;
        if (!v) return;
        // snap to Monday if needed
        excluded.add(toISO(ensureMonday(parseDate(v))));
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
    function buildDoubleRoundRobin() {
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

        // second half mirrors first with home/away swapped
        const mirror = rounds.map(rd => rd.map(g => g.bye ? g : { home: g.away, away: g.home }));
        return rounds.concat(mirror);
    }

    function generate() {
        const startInput = $('fxStart').value;
        if (!startInput) { show('Pick a start date.', 'error'); return; }
        const begin = ensureMonday(parseDate(startInput));

        const rounds = buildDoubleRoundRobin();
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
                tr.innerHTML =
                    '<td>' + fmtDate(row.match_date) + '</td>' +
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
            venue: p.venue
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
