// =====================================================================
//  Admin fixture editor (admin only): manually create matches, and
//  correct an existing match's date or venue (postponements, venue
//  corrections). Editing venue sets a permanent per-match override (see
//  fixture_list) - it stops following the home team's registered venue
//  for that fixture from then on.
// =====================================================================

const FixtureEditorAdmin = (function () {
    let seasons = [];
    let teams = [];
    let fixturesList = [];
    let pairingRows = [];

    function $(id) { return document.getElementById(id); }

    async function init() {
        const me = await NADARL.fetchMyProfile();
        if (!me || me.role !== 'admin') return;
        if (!$('fixtureEditorPanel')) return;

        seasons = await NADARL.fetchSeasons();
        teams = await NADARL.fetchTeams();
        populateSeasons();
        addPairingRow();
        await load();
        wire();
    }

    function selectedSeason() {
        const id = $('fxeSeason').value;
        return seasons.find(s => s.id === id) || seasons[0] || null;
    }

    function populateSeasons() {
        const sel = $('fxeSeason');
        sel.innerHTML = '';
        if (!seasons.length) {
            const o = document.createElement('option');
            o.value = '';
            o.textContent = 'Create a season first…';
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

    const BYE_VALUE = '__bye__';

    // includeBye adds a BYE option (away team only) - kept distinct from the
    // blank placeholder so an unmade choice can't be mistaken for one.
    function teamSelect(placeholder, includeBye) {
        const sel = document.createElement('select');
        sel.className = 'fx-text-input';

        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = placeholder;
        sel.appendChild(blank);

        if (includeBye) {
            const bye = document.createElement('option');
            bye.value = BYE_VALUE;
            bye.textContent = 'BYE (no match)';
            sel.appendChild(bye);
        }

        teams.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            sel.appendChild(opt);
        });
        return sel;
    }

    // One "<home> vs <away>" row in the match-day builder. Several of these
    // share the single date field above them so an admin can lay out a
    // whole match day's fixtures in one go instead of re-picking the date
    // for each match.
    function addPairingRow() {
        const container = $('fxePairings');
        const isFirst = pairingRows.length === 0;

        const wrap = document.createElement('div');
        wrap.className = 'fx-pairing-row';

        const home = teamSelect('Select home team…', false);
        const vs = document.createElement('span');
        vs.className = 'fx-hint';
        vs.textContent = 'vs';
        const away = teamSelect('Select opponent…', true);

        const half = document.createElement('select');
        half.className = 'fx-text-input';
        const league = document.createElement('option');
        league.value = '1';
        league.textContent = 'League';
        const handicap = document.createElement('option');
        handicap.value = '2';
        handicap.textContent = 'Handicap';
        half.appendChild(league);
        half.appendChild(handicap);

        const venue = document.createElement('input');
        venue.type = 'text';
        venue.className = 'fx-text-input';
        venue.placeholder = "Venue (optional - defaults to home team's)";

        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'row-button row-button-secondary fx-pairing-add';
        add.textContent = '+';
        add.title = 'Add another match';
        add.addEventListener('click', () => addPairingRow());

        wrap.appendChild(home);
        wrap.appendChild(vs);
        wrap.appendChild(away);
        wrap.appendChild(half);
        wrap.appendChild(venue);
        wrap.appendChild(add);

        if (!isFirst) {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'row-button row-button-secondary fx-pairing-remove';
            remove.textContent = '✕';
            remove.title = 'Remove this match';
            remove.addEventListener('click', () => {
                wrap.remove();
                pairingRows = pairingRows.filter(p => p.wrap !== wrap);
            });
            wrap.appendChild(remove);
        }

        container.appendChild(wrap);

        pairingRows.push({ wrap, home, away, half, venue });
    }

    async function load() {
        const season = selectedSeason();
        fixturesList = season ? await NADARL.fetchFixtures(season.id) : [];
        fixturesList.sort((a, b) => a.date.localeCompare(b.date));
        render();
    }

    // The "Match Days Allocated" stats above live in the Seasons section,
    // owned by admin-fixtures.js - poke it whenever a match is added,
    // moved or deleted so those numbers don't go stale. Passes this panel's
    // own selected season explicitly (rather than letting FixturesAdmin
    // read its own, independent fxSeason dropdown) so the refresh always
    // reflects the season actually just changed, even if the two season
    // pickers on this page aren't set to the same season.
    function refreshAllocatedStats() {
        // FixturesAdmin is declared with `const` at the top level of
        // admin-fixtures.js, so it's a lexical global shared between
        // classic <script> tags on this page - not a window property.
        if (typeof FixturesAdmin !== 'undefined' && FixturesAdmin.refreshAllocatedMatchDays) {
            FixturesAdmin.refreshAllocatedMatchDays(selectedSeason());
        }
    }

    function render() {
        const body = $('fxeBody');
        body.innerHTML = '';
        if (!fixturesList.length) {
            body.innerHTML = '<tr><td colspan="6" class="fx-hint">No fixtures for this season.</td></tr>';
            return;
        }
        let lastDate = null;
        let band = false;
        fixturesList.forEach(f => {
            if (f.date !== lastDate) { band = !band; lastDate = f.date; }
            body.appendChild(row(f, band));
        });
    }

    function row(f, band) {
        const tr = document.createElement('tr');
        tr.className = band ? 'fx-date-band-b' : 'fx-date-band-a';

        const tdHome = document.createElement('td');
        tdHome.textContent = f.homeTeam;
        tr.appendChild(tdHome);

        const tdAway = document.createElement('td');
        tdAway.textContent = f.isBye ? 'BYE' : f.awayTeam;
        tr.appendChild(tdAway);

        const dateIn = document.createElement('input');
        dateIn.type = 'date';
        dateIn.className = 'team-input';
        dateIn.value = f.date;
        const tdDate = document.createElement('td');
        tdDate.appendChild(dateIn);
        tr.appendChild(tdDate);

        const venueIn = document.createElement('input');
        venueIn.type = 'text';
        venueIn.className = 'team-input';
        venueIn.placeholder = f.venue || '';
        venueIn.value = f.venue || '';
        const tdVenue = document.createElement('td');
        tdVenue.appendChild(venueIn);
        tr.appendChild(tdVenue);

        const tdHalf = document.createElement('td');
        const half = document.createElement('span');
        half.className = 'fx-half-badge ' + (f.half === 2 ? 'fx-hc' : 'fx-wohc');
        half.textContent = f.half === 2 ? 'HC' : 'League';
        tdHalf.appendChild(half);
        tr.appendChild(tdHalf);

        const tdAction = document.createElement('td');
        const controls = document.createElement('div');
        controls.className = 'row-controls';

        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'row-button';
        save.textContent = 'Save';
        save.addEventListener('click', async () => {
            if (!dateIn.value) { show('Pick a date.', 'error'); return; }
            save.disabled = true;
            const res = await NADARL.updateMatchFixture(f.id, {
                match_date: dateIn.value,
                venue: venueIn.value.trim()
            });
            save.disabled = false;
            if (!res.ok || !res.count) {
                show('Could not save: ' + (res.error || '0 rows changed'), 'error');
                return;
            }
            show(`Saved ${f.homeTeam} vs ${f.isBye ? 'BYE' : f.awayTeam}.`, 'success');
            await load();
            refreshAllocatedStats();
        });
        controls.appendChild(save);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'row-button row-button-secondary';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
            if (!confirm(
                `Delete the fixture ${f.homeTeam} vs ${f.isBye ? 'BYE' : f.awayTeam} on ${f.date}? ` +
                'This also deletes any scores entered for it. This cannot be undone.'
            )) return;
            del.disabled = true;
            const res = await NADARL.deleteMatch(f.id);
            del.disabled = false;
            if (!res.ok || !res.count) {
                show('Could not delete: ' + (res.error || '0 rows changed'), 'error');
                return;
            }
            show(`Deleted ${f.homeTeam} vs ${f.isBye ? 'BYE' : f.awayTeam}.`, 'success');
            await load();
            refreshAllocatedStats();
        });
        controls.appendChild(del);

        tdAction.appendChild(controls);
        tr.appendChild(tdAction);

        return tr;
    }

    function wire() {
        $('fxeSeason').addEventListener('change', load);
        $('fxeDeleteAll').addEventListener('click', deleteAllFixtures);
        $('fxeAdd').addEventListener('click', createMatches);
    }

    // Which other entry types already occupy the chosen date, for the
    // conflict warning below - same-type occupancy (several matches on one
    // day is normal) isn't a conflict, so excludeType is left out.
    function conflictLabels(occupants, excludeType) {
        const labels = { match: 'a Match', exception: 'an Exception', competition: 'a Competition', event: 'an Event' };
        return Object.keys(labels)
            .filter(k => k !== excludeType && occupants[k])
            .map(k => labels[k]);
    }

    // Checks one candidate match against a list of already-scheduled
    // fixtures for the same day (either the loaded season fixtures, or the
    // other rows already accepted earlier in this same batch) and returns
    // a clash description, or null if there's none. Shared here since both
    // the existing-fixture check and the within-batch check need it.
    function findClash(homeName, awayName, effectiveVenue, sameDay) {
        for (const f of sameDay) {
            const opponent = f.isBye ? 'BYE' : f.awayTeam;
            if (f.homeTeam === homeName || f.awayTeam === homeName) {
                return { type: 'team', team: homeName, opponent: f.homeTeam === homeName ? opponent : f.homeTeam };
            }
            if (awayName && (f.homeTeam === awayName || f.awayTeam === awayName)) {
                return { type: 'team', team: awayName, opponent: f.homeTeam === awayName ? opponent : f.homeTeam };
            }
        }
        const venueClash = sameDay.find(f => !f.isBye && f.venue && effectiveVenue && f.venue === effectiveVenue);
        if (venueClash) return { type: 'venue', venue: effectiveVenue, home: venueClash.homeTeam, away: venueClash.awayTeam };
        return null;
    }

    // Creates every match laid out in the builder for the one chosen date.
    // Since teams can share a physical venue (so whichever of them is
    // "home" that day is the only one that can use it) and a team
    // obviously can't play twice in one day, each row is checked against
    // both the season's already-loaded fixtures and the rows already
    // accepted earlier in this same batch - a team clash is a hard stop, a
    // venue clash is a single confirm()-gated warning covering the whole
    // batch, since a shared venue might genuinely have separate time slots.
    async function createMatches() {
        const season = selectedSeason();
        if (!season) { show('No season selected.', 'error'); return; }

        const date = $('fxeNewDate').value;
        if (!date) { show('Pick a date.', 'error'); return; }

        const occupants = await NADARL.fetchDateOccupants(season.id, date);
        const conflicts = conflictLabels(occupants, 'match');
        if (conflicts.length && !confirm(
            date + ' already has ' + conflicts.join(' and ') + ' scheduled. Add these matches anyway?'
        )) return;

        const sameDay = fixturesList.filter(f => f.date === date);
        const candidates = [];
        let venueWarning = false;

        for (const p of pairingRows) {
            const homeId = p.home.value;
            const awayId = p.away.value;
            if (!homeId) { show('Every match needs a home team.', 'error'); return; }
            if (!awayId) { show('Every match needs an opponent (or BYE).', 'error'); return; }
            if (homeId === awayId) { show('Home and away can\'t be the same team.', 'error'); return; }

            const isBye = awayId === BYE_VALUE;
            const homeTeam = teams.find(t => t.id === homeId);
            const awayTeam = isBye ? null : teams.find(t => t.id === awayId);
            const venue = p.venue.value.trim();
            const effectiveVenue = venue || homeTeam.venue;

            const clash = findClash(homeTeam.name, awayTeam ? awayTeam.name : null, effectiveVenue, sameDay.concat(candidates.map(c => c.asFixture)));
            if (clash && clash.type === 'team') {
                show(
                    clash.team + ' is already scheduled to play on ' + date + ' (vs ' + clash.opponent +
                    '). A team can\'t play twice on the same day.',
                    'error'
                );
                return;
            }
            if (clash && clash.type === 'venue') venueWarning = true;

            candidates.push({
                home_team_id: homeId,
                away_team_id: isBye ? null : awayId,
                venue,
                half: Number(p.half.value),
                label: homeTeam.name + ' vs ' + (awayTeam ? awayTeam.name : 'BYE'),
                asFixture: {
                    homeTeam: homeTeam.name,
                    awayTeam: awayTeam ? awayTeam.name : null,
                    isBye,
                    venue: effectiveVenue
                }
            });
        }

        if (!candidates.length) { show('Add at least one match.', 'error'); return; }

        if (venueWarning) {
            const proceed = confirm(
                'One or more of these matches shares a venue already in use on ' + date +
                ' (either an existing fixture or another match in this batch). Create them anyway?'
            );
            if (!proceed) return;
        }

        const btn = $('fxeAdd');
        btn.disabled = true;
        let created = 0;
        const failures = [];
        for (const c of candidates) {
            const res = await NADARL.addMatch({
                season_id: season.id,
                match_date: date,
                home_team_id: c.home_team_id,
                away_team_id: c.away_team_id,
                venue: c.venue,
                half: c.half
            });
            if (res.ok) created++;
            else failures.push(c.label + ': ' + (res.error || 'unknown'));
        }
        btn.disabled = false;

        if (failures.length) {
            show(
                'Created ' + created + ' of ' + candidates.length + ' match(es). Failed: ' + failures.join('; '),
                'error'
            );
        } else {
            $('fxeNewDate').value = '';
            $('fxePairings').innerHTML = '';
            pairingRows = [];
            addPairingRow();
            show('Created ' + created + ' match(es) on ' + date + '.', 'success');
        }
        await load();
        refreshAllocatedStats();
    }

    async function deleteAllFixtures() {
        const season = selectedSeason();
        if (!season) { show('No season selected.', 'error'); return; }
        if (!confirm(
            'Permanently delete every fixture (and any scores) for season "' + season.name + '"? ' +
            'This cannot be undone.'
        )) return;

        const btn = $('fxeDeleteAll');
        btn.disabled = true;
        const res = await NADARL.clearMatches(season.id);
        btn.disabled = false;
        if (!res.ok) { show('Could not delete fixtures: ' + res.error, 'error'); return; }

        show('Deleted ' + (res.count || 0) + ' fixture(s) from "' + season.name + '".', 'success');
        await load();
        refreshAllocatedStats();
    }

    function show(text, type) {
        const el = $('fxeMessage');
        el.textContent = text;
        el.className = 'login-message login-message-' + (type || '');
        el.hidden = false;
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', FixtureEditorAdmin.init);
