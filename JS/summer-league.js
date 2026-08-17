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
let seasons = [];
let seasonIndex = 0;
let documents = [];
let editingId = null;
let pdfDocPromise = null;

function currentSeason() {
    return seasons[seasonIndex] || null;
}

function summerLeagueDocUrl(filename) {
    return '../Documents/summer-league/' + encodeURIComponent(filename);
}

function formatDocDate(isoString) {
    if (!isoString) return '';
    return new Date(isoString).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
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
                <span class="summer-league-list-date">${formatDocDate(item.created_at)}</span>
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
// every newsletter in this season (see reorderSummerLeagueDocuments) - lets
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
    document.getElementById('summerLeagueDelete').hidden = !item;
    document.getElementById('summerLeagueForm').hidden = false;
    document.getElementById('addSummerLeagueButton').hidden = true;
    hideSummerLeagueMessage();
}

function closeSummerLeagueForm() {
    editingId = null;
    document.getElementById('summerLeagueForm').hidden = true;
    document.getElementById('addSummerLeagueButton').hidden = !isAdmin || !currentSeason();
}

function wireSummerLeagueForm() {
    document.getElementById('addSummerLeagueButton').addEventListener('click', () => openSummerLeagueForm(null));
    document.getElementById('summerLeagueCancel').addEventListener('click', closeSummerLeagueForm);

    document.getElementById('summerLeagueSave').addEventListener('click', async () => {
        const season = currentSeason();
        if (!season) return;

        const title = document.getElementById('summerLeagueTitleInput').value.trim();
        const filename = document.getElementById('summerLeagueFilenameInput').value.trim();
        if (!filename) {
            showSummerLeagueMessage('Please enter the PDF filename.', 'error');
            return;
        }

        const saveButton = document.getElementById('summerLeagueSave');
        saveButton.disabled = true;
        const res = editingId
            ? await NADARL.updateSummerLeagueDocument(editingId, { title, filename })
            : await NADARL.addSummerLeagueDocument(season.id, { title, filename });
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
    const season = currentSeason();
    documents = season ? await NADARL.fetchSummerLeagueDocuments(season.id) : [];
    renderSummerLeagueList(documents);
}

async function loadSeason() {
    const season = currentSeason();
    const label = document.getElementById('seasonLabel');
    const prevButton = document.getElementById('seasonPrev');
    const nextButton = document.getElementById('seasonNext');

    label.textContent = season ? season.name : 'Season';
    prevButton.disabled = seasonIndex <= 0;
    nextButton.disabled = seasonIndex >= seasons.length - 1;

    closeSummerLeagueForm();
    hideSummerLeagueMessage();

    await loadDocuments();
}

function wireSeasonNav() {
    document.getElementById('seasonPrev').addEventListener('click', () => {
        if (seasonIndex > 0) { seasonIndex--; loadSeason(); }
    });
    document.getElementById('seasonNext').addEventListener('click', () => {
        if (seasonIndex < seasons.length - 1) { seasonIndex++; loadSeason(); }
    });
}

async function initSummerLeaguePage() {
    const me = await NADARL.fetchMyProfile();
    isAdmin = !!me && me.role === 'admin';

    wireSummerLeagueForm();
    wireSummerLeagueLightbox();
    wireSummerLeagueListClicks();
    wireSeasonNav();

    seasons = await NADARL.fetchSeasons();
    if (!seasons.length) {
        document.getElementById('seasonLabel').textContent = '';
        document.getElementById('seasonPrev').disabled = true;
        document.getElementById('seasonNext').disabled = true;
        document.getElementById('summerLeagueEmpty').hidden = false;
        return;
    }

    const season = NADARL.pickCurrentSeason(seasons);
    seasonIndex = season ? seasons.indexOf(season) : seasons.length - 1;

    await loadSeason();
}

document.addEventListener('DOMContentLoaded', initSummerLeaguePage);
