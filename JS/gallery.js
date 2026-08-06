function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showGalleryMessage(text, type) {
    const box = document.getElementById('galleryMessage');
    box.textContent = text;
    box.className = 'gallery-message gallery-message-' + type;
    box.hidden = false;
}

function hideGalleryMessage() {
    const box = document.getElementById('galleryMessage');
    box.hidden = true;
}

let galleryItems = [];
let isAdmin = false;
let editingItemId = null;
let reorderMode = false;
let reorderWorkingItems = [];
let lightboxImages = [];
let lightboxIndex = 0;
let lightboxDescription = '';

function buildViewHtml(item) {
    return `
        <div class="gallery-description">
            <span class="gallery-description-text">${escapeHtml(item.description || '')}</span>
            ${isAdmin ? `<button type="button" class="gallery-edit-button gallery-item-edit" data-id="${item.id}">Edit</button>` : ''}
        </div>
    `;
}

function buildFilenameRowHtml(filename) {
    return `
        <div class="gallery-filename-row">
            <input type="text" class="gallery-input gallery-filename-input" maxlength="120" placeholder="e.g. champions-2023.jpg" value="${escapeHtml(filename || '')}">
            <button type="button" class="gallery-filename-remove" aria-label="Remove image">&times;</button>
        </div>
    `;
}

function addFilenameRow(list, filename) {
    list.insertAdjacentHTML('beforeend', buildFilenameRowHtml(filename));
}

function getFilenameListValues(list) {
    return Array.from(list.querySelectorAll('.gallery-filename-input'))
        .map(input => input.value.trim())
        .filter(Boolean);
}

function buildEditFormHtml(item) {
    const filenames = item.images && item.images.length ? item.images : [''];
    return `
        <div class="gallery-edit-form">
            <label>Description</label>
            <textarea class="gallery-textarea gallery-edit-description" rows="3" maxlength="300">${escapeHtml(item.description || '')}</textarea>
            <label>Image filenames</label>
            <div class="gallery-filename-list gallery-edit-filenames">
                ${filenames.map(buildFilenameRowHtml).join('')}
            </div>
            <button type="button" class="gallery-button-secondary gallery-add-filename-button gallery-add-filename">+ Add Another Image</button>
            <div class="gallery-edit-menu">
                <button type="button" class="gallery-button gallery-item-save" data-id="${item.id}">Save</button>
                <button type="button" class="gallery-button-secondary gallery-item-cancel" data-id="${item.id}">Cancel</button>
                <button type="button" class="gallery-button-danger gallery-item-delete" data-id="${item.id}">Delete</button>
            </div>
        </div>
    `;
}

function buildReorderControlsHtml(item, index, total) {
    return `
        <div class="gallery-reorder-controls">
            <button type="button" class="gallery-move-button gallery-move-up" data-id="${item.id}" ${index === 0 ? 'disabled' : ''}>&#8593; Up</button>
            <button type="button" class="gallery-move-button gallery-move-down" data-id="${item.id}" ${index === total - 1 ? 'disabled' : ''}>&#8595; Down</button>
        </div>
    `;
}

function renderGallery(items) {
    const grid = document.getElementById('galleryGrid');

    if (!items.length) {
        grid.innerHTML = '<p class="gallery-empty">No photos yet.</p>';
        return;
    }

    grid.innerHTML = items.map((item, index) => {
        const images = item.images || [];
        const countBadge = images.length > 1 ? `<span class="gallery-photo-count">${images.length} photos</span>` : '';
        return `
        <div class="gallery-item${reorderMode ? ' reorder-active' : ''}" data-id="${item.id}">
            <div class="gallery-photo-wrap">
                <img class="gallery-photo" src="../Images/gallery/${escapeHtml(images[0] || '')}" alt="${escapeHtml(item.description || '')}" loading="lazy">
                ${countBadge}
            </div>
            ${reorderMode ? buildReorderControlsHtml(item, index, items.length) : (editingItemId === item.id ? buildEditFormHtml(item) : buildViewHtml(item))}
        </div>
    `;
    }).join('');
}

async function loadGallery() {
    galleryItems = await NADARL.fetchGalleryItems();
    renderGallery(galleryItems);
}

function moveReorderItem(id, direction) {
    const idx = reorderWorkingItems.findIndex(i => i.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= reorderWorkingItems.length) return;
    [reorderWorkingItems[idx], reorderWorkingItems[swapIdx]] = [reorderWorkingItems[swapIdx], reorderWorkingItems[idx]];
    renderGallery(reorderWorkingItems);
}

function enterReorderMode() {
    reorderMode = true;
    reorderWorkingItems = galleryItems.slice();
    editingItemId = null;
    document.getElementById('addGalleryButton').hidden = true;
    document.getElementById('reorderGalleryButton').hidden = true;
    document.getElementById('reorderToolbar').hidden = false;
    renderGallery(reorderWorkingItems);
}

function exitReorderMode() {
    reorderMode = false;
    reorderWorkingItems = [];
    document.getElementById('reorderToolbar').hidden = true;
    if (isAdmin) {
        document.getElementById('addGalleryButton').hidden = false;
        document.getElementById('reorderGalleryButton').hidden = false;
    }
    renderGallery(galleryItems);
}

function wireReorderToolbar() {
    document.getElementById('reorderGalleryButton').addEventListener('click', enterReorderMode);
    document.getElementById('reorderCancel').addEventListener('click', exitReorderMode);

    document.getElementById('reorderSave').addEventListener('click', async () => {
        if (!confirm('Save this new photo order?')) return;

        const saveButton = document.getElementById('reorderSave');
        saveButton.disabled = true;
        const res = await NADARL.reorderGalleryItems(reorderWorkingItems.map(item => item.id));
        saveButton.disabled = false;

        if (!res.ok) {
            showGalleryMessage('Could not save photo order: ' + res.error, 'error');
            return;
        }

        exitReorderMode();
        await loadGallery();
    });
}

function openLightbox(item) {
    lightboxImages = item.images || [];
    lightboxIndex = 0;
    lightboxDescription = item.description || '';
    renderLightbox();
    document.getElementById('galleryLightbox').hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    document.getElementById('galleryLightbox').hidden = true;
    document.body.style.overflow = '';
}

function moveLightbox(direction) {
    if (lightboxImages.length < 2) return;
    lightboxIndex = (lightboxIndex + direction + lightboxImages.length) % lightboxImages.length;
    renderLightbox();
}

function renderLightbox() {
    const filename = lightboxImages[lightboxIndex];
    const image = document.getElementById('galleryLightboxImage');
    image.src = '../Images/gallery/' + filename;
    image.alt = lightboxDescription;

    document.getElementById('galleryLightboxDescription').textContent = lightboxDescription;

    const hasMultiple = lightboxImages.length > 1;
    document.getElementById('galleryLightboxPrev').hidden = !hasMultiple;
    document.getElementById('galleryLightboxNext').hidden = !hasMultiple;

    const counter = document.getElementById('galleryLightboxCounter');
    counter.hidden = !hasMultiple;
    counter.textContent = (lightboxIndex + 1) + ' / ' + lightboxImages.length;
}

function wireLightbox() {
    document.getElementById('galleryLightboxClose').addEventListener('click', closeLightbox);
    document.getElementById('galleryLightboxBackdrop').addEventListener('click', closeLightbox);
    document.getElementById('galleryLightboxPrev').addEventListener('click', () => moveLightbox(-1));
    document.getElementById('galleryLightboxNext').addEventListener('click', () => moveLightbox(1));

    document.addEventListener('keydown', (e) => {
        if (document.getElementById('galleryLightbox').hidden) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') moveLightbox(-1);
        if (e.key === 'ArrowRight') moveLightbox(1);
    });
}

function wireGalleryGrid() {
    document.getElementById('galleryGrid').addEventListener('click', async (e) => {
        const photo = e.target.closest('.gallery-photo-wrap');
        if (photo && !reorderMode) {
            const id = photo.closest('.gallery-item').dataset.id;
            const item = galleryItems.find(i => i.id === id);
            if (item) openLightbox(item);
            return;
        }

        const upBtn = e.target.closest('.gallery-move-up');
        if (upBtn) { moveReorderItem(upBtn.dataset.id, -1); return; }

        const downBtn = e.target.closest('.gallery-move-down');
        if (downBtn) { moveReorderItem(downBtn.dataset.id, 1); return; }

        const editBtn = e.target.closest('.gallery-item-edit');
        if (editBtn) {
            editingItemId = editBtn.dataset.id;
            renderGallery(galleryItems);
            return;
        }

        const cancelBtn = e.target.closest('.gallery-item-cancel');
        if (cancelBtn) {
            editingItemId = null;
            renderGallery(galleryItems);
            return;
        }

        const deleteBtn = e.target.closest('.gallery-item-delete');
        if (deleteBtn) {
            if (!confirm('Delete this gallery item? This cannot be undone.')) return;
            deleteBtn.disabled = true;
            const res = await NADARL.deleteGalleryItem(deleteBtn.dataset.id);
            if (!res.ok) {
                showGalleryMessage('Could not delete item: ' + res.error, 'error');
                deleteBtn.disabled = false;
                return;
            }
            editingItemId = null;
            await loadGallery();
            return;
        }

        const addFilenameBtn = e.target.closest('.gallery-add-filename');
        if (addFilenameBtn) {
            const list = addFilenameBtn.closest('.gallery-edit-form').querySelector('.gallery-filename-list');
            addFilenameRow(list);
            return;
        }

        const removeFilenameBtn = e.target.closest('.gallery-filename-remove');
        if (removeFilenameBtn) {
            const row = removeFilenameBtn.closest('.gallery-filename-row');
            const list = row.parentElement;
            if (list.children.length > 1) {
                row.remove();
            } else {
                row.querySelector('.gallery-filename-input').value = '';
            }
            return;
        }

        const saveBtn = e.target.closest('.gallery-item-save');
        if (saveBtn) {
            const id = saveBtn.dataset.id;
            const card = saveBtn.closest('.gallery-item');
            const description = card.querySelector('.gallery-edit-description').value.trim();
            const filenames = getFilenameListValues(card.querySelector('.gallery-edit-filenames'));
            if (!filenames.length) {
                showGalleryMessage('Please enter at least one image filename.', 'error');
                return;
            }
            saveBtn.disabled = true;
            const res = await NADARL.updateGalleryItem(id, { filenames, description });
            saveBtn.disabled = false;
            if (!res.ok) {
                showGalleryMessage('Could not save item: ' + res.error, 'error');
                return;
            }
            editingItemId = null;
            await loadGallery();
        }
    });
}

function goToWizardStep(step) {
    document.getElementById('wizardStep1').hidden = step !== 1;
    document.getElementById('wizardStep2').hidden = step !== 2;
    hideGalleryMessage();
}

function openWizard() {
    document.getElementById('galleryWizard').hidden = false;
    document.getElementById('addGalleryButton').hidden = true;
    document.getElementById('galleryDescriptionInput').value = '';
    const filenameList = document.getElementById('wizardFilenameList');
    filenameList.innerHTML = '';
    addFilenameRow(filenameList);
    goToWizardStep(1);
}

function closeWizard() {
    document.getElementById('galleryWizard').hidden = true;
    document.getElementById('addGalleryButton').hidden = false;
}

function wireWizard() {
    document.getElementById('addGalleryButton').addEventListener('click', openWizard);
    document.getElementById('wizardCancel1').addEventListener('click', closeWizard);
    document.getElementById('wizardBack').addEventListener('click', () => goToWizardStep(1));

    document.getElementById('wizardAddFilename').addEventListener('click', () => {
        addFilenameRow(document.getElementById('wizardFilenameList'));
    });

    document.getElementById('wizardFilenameList').addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.gallery-filename-remove');
        if (!removeBtn) return;
        const row = removeBtn.closest('.gallery-filename-row');
        const list = row.parentElement;
        if (list.children.length > 1) {
            row.remove();
        } else {
            row.querySelector('.gallery-filename-input').value = '';
        }
    });

    document.getElementById('wizardNext').addEventListener('click', () => {
        const description = document.getElementById('galleryDescriptionInput').value.trim();
        if (!description) {
            showGalleryMessage('Please enter a description for the photo.', 'error');
            return;
        }
        goToWizardStep(2);
    });

    document.getElementById('wizardSave').addEventListener('click', async () => {
        const description = document.getElementById('galleryDescriptionInput').value.trim();
        const filenames = getFilenameListValues(document.getElementById('wizardFilenameList'));
        if (!filenames.length) {
            showGalleryMessage('Please enter at least one image filename.', 'error');
            return;
        }

        const saveButton = document.getElementById('wizardSave');
        saveButton.disabled = true;
        const res = await NADARL.addGalleryItem({ filenames, description });
        saveButton.disabled = false;

        if (!res.ok) {
            showGalleryMessage('Could not save item: ' + res.error, 'error');
            return;
        }

        closeWizard();
        await loadGallery();
    });
}

async function initGalleryPage() {
    const me = await NADARL.fetchMyProfile();
    isAdmin = !!me && me.role === 'admin';
    if (isAdmin) {
        document.getElementById('addGalleryButton').hidden = false;
        document.getElementById('reorderGalleryButton').hidden = false;
    }
    wireWizard();
    wireReorderToolbar();
    wireGalleryGrid();
    wireLightbox();
    await loadGallery();
}

document.addEventListener('DOMContentLoaded', initGalleryPage);
