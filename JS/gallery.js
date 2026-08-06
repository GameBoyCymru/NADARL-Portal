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

function buildViewHtml(item) {
    return `
        <div class="gallery-description">
            <span class="gallery-description-text">${escapeHtml(item.description || '')}</span>
            ${isAdmin ? `<button type="button" class="gallery-edit-button gallery-item-edit" data-id="${item.id}">Edit</button>` : ''}
        </div>
    `;
}

function buildEditFormHtml(item) {
    return `
        <div class="gallery-edit-form">
            <label>Description</label>
            <textarea class="gallery-textarea gallery-edit-description" rows="3" maxlength="300">${escapeHtml(item.description || '')}</textarea>
            <label>Image filename</label>
            <input type="text" class="gallery-input gallery-edit-filename" maxlength="120" value="${escapeHtml(item.filename)}">
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

    grid.innerHTML = items.map((item, index) => `
        <div class="gallery-item${reorderMode ? ' reorder-active' : ''}" data-id="${item.id}">
            <img class="gallery-photo" src="../Images/gallery/${escapeHtml(item.filename)}" alt="${escapeHtml(item.description || '')}" loading="lazy">
            ${reorderMode ? buildReorderControlsHtml(item, index, items.length) : (editingItemId === item.id ? buildEditFormHtml(item) : buildViewHtml(item))}
        </div>
    `).join('');
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

function wireGalleryGrid() {
    document.getElementById('galleryGrid').addEventListener('click', async (e) => {
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
            if (!confirm('Delete this photo? This cannot be undone.')) return;
            deleteBtn.disabled = true;
            const res = await NADARL.deleteGalleryItem(deleteBtn.dataset.id);
            if (!res.ok) {
                showGalleryMessage('Could not delete photo: ' + res.error, 'error');
                deleteBtn.disabled = false;
                return;
            }
            editingItemId = null;
            await loadGallery();
            return;
        }

        const saveBtn = e.target.closest('.gallery-item-save');
        if (saveBtn) {
            const id = saveBtn.dataset.id;
            const card = saveBtn.closest('.gallery-item');
            const description = card.querySelector('.gallery-edit-description').value.trim();
            const filename = card.querySelector('.gallery-edit-filename').value.trim();
            if (!filename) {
                showGalleryMessage('Please enter the image filename.', 'error');
                return;
            }
            saveBtn.disabled = true;
            const res = await NADARL.updateGalleryItem(id, { filename, description });
            saveBtn.disabled = false;
            if (!res.ok) {
                showGalleryMessage('Could not save photo: ' + res.error, 'error');
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
    document.getElementById('galleryFilenameInput').value = '';
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
        const filename = document.getElementById('galleryFilenameInput').value.trim();
        if (!filename) {
            showGalleryMessage('Please enter the image filename.', 'error');
            return;
        }

        const saveButton = document.getElementById('wizardSave');
        saveButton.disabled = true;
        const res = await NADARL.addGalleryItem({ filename, description });
        saveButton.disabled = false;

        if (!res.ok) {
            showGalleryMessage('Could not save photo: ' + res.error, 'error');
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
    await loadGallery();
}

document.addEventListener('DOMContentLoaded', initGalleryPage);
