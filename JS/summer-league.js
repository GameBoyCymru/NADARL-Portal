pdfjsLib.GlobalWorkerOptions.workerSrc = '../JS/vendor/pdfjs/pdf.worker.min.js';

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showSummerLeagueMessage(text, type) {
    const box = document.getElementById('summerLeagueMessage');
    box.textContent = text;
    box.className = 'gallery-message gallery-message-' + type;
    box.hidden = false;
}

function hideSummerLeagueMessage() {
    document.getElementById('summerLeagueMessage').hidden = true;
}

let isAdmin = false;
let periods = [];
let periodIndex = 0;
let documents = [];
let editingId = null;
let pdfDocPromise = null;

function currentPeriod() {
    return periods[periodIndex] || null;
}

function summerLeagueDocUrl(filename) {
    return '../Documents/summer-league/' + encodeURIComponent(filename);
}

// dateStr is a plain 'YYYY-MM-DD' date (published_at, not a timestamp) -
// parsed as local calendar components rather than via `new Date(dateStr)`,
// which treats a bare date string as UTC midnight and can display a day
// early/late depending on the viewer's timezone.
function formatDocDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function todayDateString() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Renders one PDF page to an offscreen canvas at the given target width
// (in CSS pixels, scaled for device pixel ratio) and returns a plain <img>
// with the rendered page as its source - so it behaves like a photo, not a
// PDF viewer (no toolbar, no scrollbars, no plugin UI).
async function renderPdfPageToImage(page, targetWidth) {
    const unscaledViewport = page.getViewport({ scale: 1 });
    const pixelRatio = window.devicePixelRatio || 1;
    const scale = (targetWidth * pixelRatio) / unscaledViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/png');
    return img;
}

function renderSummerLeagueList(items) {
    const list = document.getElementById('summerLeagueList');
    const empty = document.getElementById('summerLeagueEmpty');

    if (!items.length) {
        list.innerHTML = '';
        empty.hidden = false;
        return;
    }

    empty.hidden = true;
    list.innerHTML = items.map((item, index) => `
        <div class="summer-league-list-item" data-id="${item.id}">
            <div class="summer-league-list-info">
                <span class="summer-league-list-title">${escapeHtml(item.title || item.filename)}</span>
                <span class="summer-league-list-date">${formatDocDate(item.published_at)}</span>
            </div>
            <div class="summer-league-list-actions">
                ${isAdmin ? `
                    <button type="button" class="gallery-move-button summer-league-move-up" data-id="${item.id}" aria-label="Move up" ${index === 0 ? 'disabled' : ''}>&#8593;</button>
                    <button type="button" class="gallery-move-button summer-league-move-down" data-id="${item.id}" aria-label="Move down" ${index === items.length - 1 ? 'disabled' : ''}>&#8595;</button>
                ` : ''}
                <button type="button" class="gallery-button-secondary summer-league-view" data-id="${item.id}">View</button>
                <a class="gallery-button-secondary summer-league-download" href="${summerLeagueDocUrl(item.filename)}" download="${escapeHtml(item.filename)}">Download</a>
                ${isAdmin ? `<button type="button" class="gallery-edit-button summer-league-edit" data-id="${item.id}">Edit</button>` : ''}
            </div>
        </div>
    `).join('');
}

async function openSummerLeagueLightbox(item) {
    const pagesContainer = document.getElementById('summerLeaguePages');
    pagesContainer.innerHTML = '<p class="summer-league-loading">Loading&hellip;</p>';
    document.getElementById('summerLeagueLightbox').hidden = false;
    document.body.style.overflow = 'hidden';

    try {
        pdfDocPromise = pdfjsLib.getDocument(summerLeagueDocUrl(item.filename)).promise;
        const pdf = await pdfDocPromise;
        const targetWidth = Math.min(document.getElementById('summerLeagueLightbox').clientWidth - 40, 900) || 800;

        pagesContainer.innerHTML = '';
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const img = await renderPdfPageToImage(page, targetWidth);
            img.className = 'summer-league-page-image';
            img.alt = (item.title || 'Summer League newsletter') + ' - page ' + pageNum;
            pagesContainer.appendChild(img);
        }
    } catch (err) {
        console.error('openSummerLeagueLightbox', err);
        pagesContainer.innerHTML = '<p class="summer-league-loading">Could not load this PDF.</p>';
    }
}

function closeSummerLeagueLightbox() {
    document.getElementById('summerLeagueLightbox').hidden = true;
    document.body.style.overflow = '';
}

function wireSummerLeagueLightbox() {
    document.getElementById('summerLeagueLightboxClose').addEventListener('click', closeSummerLeagueLightbox);
    document.getElementById('summerLeagueLightboxBackdrop').addEventListener('click', closeSummerLeagueLightbox);
    document.addEventListener('keydown', (e) => {
        if (document.getElementById('summerLeagueLightbox').hidden) return;
        if (e.key === 'Escape') closeSummerLeagueLightbox();
    });
}

function wireSummerLeagueListClicks() {
    document.getElementById('summerLeagueList').addEventListener('click', (e) => {
        const viewBtn = e.target.closest('.summer-league-view');
        if (viewBtn) {
            const item = documents.find(d => d.id === viewBtn.dataset.id);
            if (item) openSummerLeagueLightbox(item);
            return;
        }

        const editBtn = e.target.closest('.summer-league-edit');
        if (editBtn) {
            const item = documents.find(d => d.id === editBtn.dataset.id);
            if (item) openSummerLeagueForm(item);
            return;
        }

        const upBtn = e.target.closest('.summer-league-move-up');
        if (upBtn) { moveDocument(upBtn.dataset.id, -1); return; }

        const downBtn = e.target.closest('.summer-league-move-down');
        if (downBtn) { moveDocument(downBtn.dataset.id, 1); }
    });
}

// Swaps a newsletter with its neighbour and persists the new order for
// every newsletter in this period (see reorderSummerLeagueDocuments) - lets
// an admin fix one added out of sequence.
async function moveDocument(id, direction) {
    const idx = documents.findIndex(d => d.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= documents.length) return;

    const reordered = documents.slice();
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

    const res = await NADARL.reorderSummerLeagueDocuments(reordered.map(d => d.id));
    if (!res.ok) { showSummerLeagueMessage('Could not reorder newsletters: ' + res.error, 'error'); return; }

    await loadDocuments();
}

function openSummerLeagueForm(item) {
    editingId = item ? item.id : null;
    document.getElementById('summerLeagueTitleInput').value = item ? (item.title || '') : '';
    document.getElementById('summerLeagueFilenameInput').value = item ? item.filename : '';
    document.getElementById('summerLeagueDateInput').value = item ? item.published_at : todayDateString();
    document.getElementById('summerLeagueDelete').hidden = !item;
    document.getElementById('summerLeagueForm').hidden = false;
    document.getElementById('addSummerLeagueButton').hidden = true;
    hideSummerLeagueMessage();
}

function closeSummerLeagueForm() {
    editingId = null;
    document.getElementById('summerLeagueForm').hidden = true;
    document.getElementById('addSummerLeagueButton').hidden = !isAdmin || !currentPeriod();
}

function wireSummerLeagueForm() {
    document.getElementById('addSummerLeagueButton').addEventListener('click', () => openSummerLeagueForm(null));
    document.getElementById('summerLeagueCancel').addEventListener('click', closeSummerLeagueForm);

    document.getElementById('summerLeagueSave').addEventListener('click', async () => {
        const period = currentPeriod();
        if (!period) return;

        const title = document.getElementById('summerLeagueTitleInput').value.trim();
        const filename = document.getElementById('summerLeagueFilenameInput').value.trim();
        const date = document.getElementById('summerLeagueDateInput').value || todayDateString();
        if (!filename) {
            showSummerLeagueMessage('Please enter the PDF filename.', 'error');
            return;
        }

        const saveButton = document.getElementById('summerLeagueSave');
        saveButton.disabled = true;
        const res = editingId
            ? await NADARL.updateSummerLeagueDocument(editingId, { title, filename, date })
            : await NADARL.addSummerLeagueDocument(period.id, { title, filename, date });
        saveButton.disabled = false;

        if (!res.ok) {
            showSummerLeagueMessage('Could not save the newsletter: ' + res.error, 'error');
            return;
        }

        closeSummerLeagueForm();
        await loadDocuments();
    });

    document.getElementById('summerLeagueDelete').addEventListener('click', async () => {
        if (!editingId) return;
        if (!confirm('Delete this newsletter? This cannot be undone.')) return;

        const deleteButton = document.getElementById('summerLeagueDelete');
        deleteButton.disabled = true;
        const res = await NADARL.deleteSummerLeagueDocument(editingId);
        deleteButton.disabled = false;

        if (!res.ok) {
            showSummerLeagueMessage('Could not delete the newsletter: ' + res.error, 'error');
            return;
        }

        closeSummerLeagueForm();
        await loadDocuments();
    });
}

async function loadDocuments() {
    const period = currentPeriod();
    documents = period ? await NADARL.fetchSummerLeagueDocuments(period.id) : [];
    renderSummerLeagueList(documents);
}

function updatePeriodAdminControls() {
    const period = currentPeriod();
    document.getElementById('periodAdminControls').style.display = isAdmin ? '' : 'none';
    document.getElementById('periodMoveUp').disabled = !period || periodIndex <= 0;
    document.getElementById('periodMoveDown').disabled = !period || periodIndex >= periods.length - 1;
    document.getElementById('periodSetCurrent').disabled = !period || period.is_current;
    document.getElementById('periodDelete').disabled = !period;
}

async function loadPeriod() {
    const period = currentPeriod();
    const label = document.getElementById('periodLabel');
    const prevButton = document.getElementById('periodPrev');
    const nextButton = document.getElementById('periodNext');

    label.textContent = period ? (period.name + (isAdmin && period.is_current ? '  (current)' : '')) : 'Summer League';
    prevButton.disabled = periodIndex <= 0;
    nextButton.disabled = periodIndex >= periods.length - 1;
    updatePeriodAdminControls();

    document.getElementById('addSummerLeagueButton').hidden = !isAdmin || !period;
    closeSummerLeagueForm();
    hideSummerLeagueMessage();

    await loadDocuments();
}

function wirePeriodNav() {
    document.getElementById('periodPrev').addEventListener('click', () => {
        if (periodIndex > 0) { periodIndex--; loadPeriod(); }
    });
    document.getElementById('periodNext').addEventListener('click', () => {
        if (periodIndex < periods.length - 1) { periodIndex++; loadPeriod(); }
    });
}

// Swaps the current period with its neighbour and persists the new order
// for every period (see reorderSummerLeaguePeriods) - lets an admin backfill
// an older year before others, or fix one added out of sequence.
async function movePeriod(direction) {
    const period = currentPeriod();
    if (!period) return;
    const idx = periods.findIndex(p => p.id === period.id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= periods.length) return;

    const reordered = periods.slice();
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

    const res = await NADARL.reorderSummerLeaguePeriods(reordered.map(p => p.id));
    if (!res.ok) { showSummerLeagueMessage('Could not reorder years: ' + res.error, 'error'); return; }

    periods = await NADARL.fetchSummerLeaguePeriods();
    periodIndex = periods.findIndex(p => p.id === period.id);
    if (periodIndex === -1) periodIndex = periods.length - 1;
    await loadPeriod();
}

function wirePeriodAdminControls() {
    document.getElementById('periodMoveUp').addEventListener('click', () => movePeriod(-1));
    document.getElementById('periodMoveDown').addEventListener('click', () => movePeriod(1));

    document.getElementById('periodSetCurrent').addEventListener('click', async () => {
        const period = currentPeriod();
        if (!period || period.is_current) return;

        const res = await NADARL.setCurrentSummerLeaguePeriod(period.id);
        if (!res.ok) { showSummerLeagueMessage('Could not set current year: ' + res.error, 'error'); return; }

        periods = await NADARL.fetchSummerLeaguePeriods();
        periodIndex = periods.findIndex(p => p.id === period.id);
        if (periodIndex === -1) periodIndex = periods.length - 1;
        await loadPeriod();
    });

    document.getElementById('periodDelete').addEventListener('click', async () => {
        const period = currentPeriod();
        if (!period) return;
        if (!confirm('Delete Summer League "' + period.name + '" and all of its newsletters? This cannot be undone.')) return;

        const res = await NADARL.deleteSummerLeaguePeriod(period.id);
        if (!res.ok) { showSummerLeagueMessage('Could not delete year: ' + res.error, 'error'); return; }

        periods = await NADARL.fetchSummerLeaguePeriods();
        periodIndex = periods.length - 1;
        await loadPeriod();
    });

    document.getElementById('periodAdd').addEventListener('click', async () => {
        const nameInput = document.getElementById('periodNewName');
        const name = nameInput.value.trim();
        if (!name) { showSummerLeagueMessage('Please enter a year (e.g. 2027).', 'error'); return; }

        const res = await NADARL.addSummerLeaguePeriod(name);
        if (!res.ok) { showSummerLeagueMessage('Could not add year: ' + res.error, 'error'); return; }

        nameInput.value = '';
        periods = await NADARL.fetchSummerLeaguePeriods();
        periodIndex = periods.length - 1;
        await loadPeriod();
    });
}

async function initSummerLeaguePage() {
    const me = await NADARL.fetchMyProfile();
    isAdmin = !!me && me.role === 'admin';

    wireSummerLeagueForm();
    wireSummerLeagueLightbox();
    wireSummerLeagueListClicks();
    wirePeriodNav();
    wirePeriodAdminControls();

    periods = await NADARL.fetchSummerLeaguePeriods();
    if (!periods.length) {
        document.getElementById('periodLabel').textContent = 'Summer League';
        document.getElementById('periodPrev').disabled = true;
        document.getElementById('periodNext').disabled = true;
        document.getElementById('summerLeagueEmpty').hidden = false;
        updatePeriodAdminControls();
        return;
    }

    const flaggedCurrent = periods.findIndex(p => p.is_current);
    periodIndex = flaggedCurrent !== -1 ? flaggedCurrent : periods.length - 1;

    await loadPeriod();
}

document.addEventListener('DOMContentLoaded', initSummerLeaguePage);
