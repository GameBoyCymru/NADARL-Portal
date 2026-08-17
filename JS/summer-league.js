pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js';

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
let currentFilename = null;
let pdfDocPromise = null;

function currentSeason() {
    return seasons[seasonIndex] || null;
}

function summerLeagueDocUrl(filename) {
    return '../Documents/summer-league/' + encodeURIComponent(filename);
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

function loadPdfDocument(filename) {
    pdfDocPromise = pdfjsLib.getDocument(summerLeagueDocUrl(filename)).promise;
    return pdfDocPromise;
}

async function renderThumbnail(filename) {
    const wrap = document.getElementById('summerLeagueThumbWrap');
    const thumbImg = document.getElementById('summerLeagueThumbImage');
    try {
        const pdf = await loadPdfDocument(filename);
        const page = await pdf.getPage(1);
        const rendered = await renderPdfPageToImage(page, wrap.clientWidth || 400);
        thumbImg.src = rendered.src;
    } catch (err) {
        console.error('renderThumbnail', err);
        showSummerLeagueMessage('Could not load the results PDF.', 'error');
    }
}

function renderSummerLeagueDocument(filename) {
    currentFilename = filename || null;
    pdfDocPromise = null;

    const empty = document.getElementById('summerLeagueEmpty');
    const grid = document.getElementById('summerLeagueGrid');

    if (!currentFilename) {
        empty.hidden = false;
        grid.style.display = 'none';
        return;
    }

    empty.hidden = true;
    grid.style.display = '';
    renderThumbnail(currentFilename);
}

async function openSummerLeagueLightbox() {
    if (!currentFilename) return;

    const pagesContainer = document.getElementById('summerLeaguePages');
    pagesContainer.innerHTML = '<p class="summer-league-loading">Loading results&hellip;</p>';
    document.getElementById('summerLeagueLightbox').hidden = false;
    document.body.style.overflow = 'hidden';

    try {
        const pdf = await (pdfDocPromise || loadPdfDocument(currentFilename));
        const targetWidth = Math.min(document.getElementById('summerLeagueLightbox').clientWidth - 40, 900) || 800;

        pagesContainer.innerHTML = '';
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const img = await renderPdfPageToImage(page, targetWidth);
            img.className = 'summer-league-page-image';
            img.alt = 'Summer League Results - page ' + pageNum;
            pagesContainer.appendChild(img);
        }
    } catch (err) {
        console.error('openSummerLeagueLightbox', err);
        pagesContainer.innerHTML = '<p class="summer-league-loading">Could not load the results PDF.</p>';
    }
}

function closeSummerLeagueLightbox() {
    document.getElementById('summerLeagueLightbox').hidden = true;
    document.body.style.overflow = '';
}

function wireSummerLeagueLightbox() {
    document.getElementById('summerLeagueThumbWrap').addEventListener('click', openSummerLeagueLightbox);
    document.getElementById('summerLeagueLightboxClose').addEventListener('click', closeSummerLeagueLightbox);
    document.getElementById('summerLeagueLightboxBackdrop').addEventListener('click', closeSummerLeagueLightbox);
    document.addEventListener('keydown', (e) => {
        if (document.getElementById('summerLeagueLightbox').hidden) return;
        if (e.key === 'Escape') closeSummerLeagueLightbox();
    });
}

function openSummerLeagueForm() {
    document.getElementById('summerLeagueFilenameInput').value = currentFilename || '';
    document.getElementById('summerLeagueForm').hidden = false;
    document.getElementById('editSummerLeagueButton').hidden = true;
    document.getElementById('summerLeagueDelete').hidden = !currentFilename;
    hideSummerLeagueMessage();
}

function closeSummerLeagueForm() {
    document.getElementById('summerLeagueForm').hidden = true;
    document.getElementById('editSummerLeagueButton').hidden = false;
}

function wireSummerLeagueForm() {
    document.getElementById('editSummerLeagueButton').addEventListener('click', openSummerLeagueForm);
    document.getElementById('summerLeagueCancel').addEventListener('click', closeSummerLeagueForm);

    document.getElementById('summerLeagueSave').addEventListener('click', async () => {
        const season = currentSeason();
        if (!season) return;

        const filename = document.getElementById('summerLeagueFilenameInput').value.trim();

        const saveButton = document.getElementById('summerLeagueSave');
        saveButton.disabled = true;
        const res = await NADARL.updateSummerLeagueDocument(season.id, filename || null);
        saveButton.disabled = false;

        if (!res.ok) {
            showSummerLeagueMessage('Could not save the results PDF: ' + res.error, 'error');
            return;
        }

        closeSummerLeagueForm();
        renderSummerLeagueDocument(res.document.filename);
    });

    document.getElementById('summerLeagueDelete').addEventListener('click', async () => {
        const season = currentSeason();
        if (!season) return;
        if (!confirm('Delete the results PDF for this season? This cannot be undone.')) return;

        const deleteButton = document.getElementById('summerLeagueDelete');
        deleteButton.disabled = true;
        const res = await NADARL.updateSummerLeagueDocument(season.id, null);
        deleteButton.disabled = false;

        if (!res.ok) {
            showSummerLeagueMessage('Could not delete the results PDF: ' + res.error, 'error');
            return;
        }

        closeSummerLeagueForm();
        renderSummerLeagueDocument(null);
    });
}

async function loadSeason() {
    const season = currentSeason();
    const label = document.getElementById('seasonLabel');
    const prevButton = document.getElementById('seasonPrev');
    const nextButton = document.getElementById('seasonNext');

    label.textContent = season ? season.name : 'Season';
    prevButton.disabled = seasonIndex <= 0;
    nextButton.disabled = seasonIndex >= seasons.length - 1;

    document.getElementById('editSummerLeagueButton').hidden = !isAdmin || !season;
    closeSummerLeagueForm();
    hideSummerLeagueMessage();

    const doc = season ? await NADARL.fetchSummerLeagueDocument(season.id) : { filename: null };
    renderSummerLeagueDocument(doc.filename);
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
