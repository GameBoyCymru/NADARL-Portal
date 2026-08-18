pdfjsLib.GlobalWorkerOptions.workerSrc = '../JS/vendor/pdfjs/pdf.worker.min.js';

function $(id) { return document.getElementById(id); }

function rulesPdfUrl(filename) {
    return '../Documents/rules/' + encodeURIComponent(filename);
}

// Renders one PDF page to an offscreen canvas at the given target width (in
// CSS pixels, scaled for device pixel ratio) and returns a plain <img> with
// the rendered page as its source - same approach as the Summer League and
// Competition PDF viewers, so the result behaves like a photo rather than an
// embedded PDF viewer (no toolbar, no scrollbars, no plugin UI).
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

async function initRulesPage() {
    const pagesContainer = $('rulesPdfPages');
    const empty = $('rulesPdfEmpty');
    const downloadLink = $('rulesDownload');

    const doc = await NADARL.fetchRulesDocument();
    if (!doc.filename) {
        empty.hidden = false;
        downloadLink.hidden = true;
        return;
    }

    empty.hidden = true;
    downloadLink.hidden = false;
    downloadLink.href = rulesPdfUrl(doc.filename);
    downloadLink.setAttribute('download', doc.filename);

    pagesContainer.innerHTML = '<p class="rules-pdf-loading">Loading&hellip;</p>';

    try {
        const pdf = await pdfjsLib.getDocument(rulesPdfUrl(doc.filename)).promise;
        const targetWidth = Math.min(pagesContainer.clientWidth || 800, 900);

        pagesContainer.innerHTML = '';
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const img = await renderPdfPageToImage(page, targetWidth);
            img.className = 'rules-pdf-page-image';
            img.alt = 'Rules - page ' + pageNum;
            pagesContainer.appendChild(img);
        }
    } catch (err) {
        console.error('initRulesPage', err);
        pagesContainer.innerHTML = '<p class="rules-pdf-loading">Could not load the rules PDF.</p>';
    }
}

document.addEventListener('DOMContentLoaded', initRulesPage);
