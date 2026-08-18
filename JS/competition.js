pdfjsLib.GlobalWorkerOptions.workerSrc = '../JS/vendor/pdfjs/pdf.worker.min.js';

function $(id) { return document.getElementById(id); }

function formatDate(dateStr) {
    return new Date(dateStr + 'T00:00:00')
        .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function competitionPdfUrl(filename) {
    return '../Documents/competitions/' + encodeURIComponent(filename);
}

// Renders one PDF page to an offscreen canvas at the given target width
// (in CSS pixels, scaled for device pixel ratio) and returns a plain <img>
// with the rendered page as its source - same approach as the Summer
// League newsletter viewer, so the result behaves like a photo rather than
// an embedded PDF viewer (no toolbar, no scrollbars, no plugin UI).
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

async function loadResultsPdf(competition) {
    const pagesContainer = $('compPdfPages');
    const empty = $('compPdfEmpty');
    const downloadLink = $('compDownload');

    if (!competition.filename) {
        pagesContainer.innerHTML = '';
        empty.hidden = false;
        downloadLink.hidden = true;
        return;
    }

    empty.hidden = true;
    downloadLink.hidden = false;
    downloadLink.href = competitionPdfUrl(competition.filename);
    downloadLink.setAttribute('download', competition.filename);

    pagesContainer.innerHTML = '<p class="comp-pdf-loading">Loading&hellip;</p>';

    try {
        const pdf = await pdfjsLib.getDocument(competitionPdfUrl(competition.filename)).promise;
        const targetWidth = Math.min(pagesContainer.clientWidth || 800, 900);

        pagesContainer.innerHTML = '';
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const img = await renderPdfPageToImage(page, targetWidth);
            img.className = 'comp-pdf-page-image';
            img.alt = competition.name + ' - page ' + pageNum;
            pagesContainer.appendChild(img);
        }
    } catch (err) {
        console.error('loadResultsPdf', err);
        pagesContainer.innerHTML = '<p class="comp-pdf-loading">Could not load this PDF.</p>';
    }
}

async function initCompetitionPage() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || '';

    const competition = await NADARL.fetchCompetitionById(id);
    if (!competition) {
        document.querySelector('.container').innerHTML =
            '<section class="section"><p class="login-intro">Competition not found. Please go back to <a href="fixtures.html">Fixtures</a>.</p></section>';
        return;
    }

    document.title = `${competition.name} - Newport & District Air Rifle League`;
    $('compName').textContent = competition.name;
    $('compMeta').textContent = formatDate(competition.date) + (competition.venue ? ' · ' + competition.venue : '');
    $('compDescription').textContent = competition.description || '';

    await loadResultsPdf(competition);
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
