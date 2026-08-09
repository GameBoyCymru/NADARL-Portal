function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showTrophyMessage(text, type) {
    const box = document.getElementById('trophyMessage');
    box.textContent = text;
    box.className = 'trophy-message trophy-message-' + type;
    box.hidden = false;
}

function hideTrophyMessage() {
    const box = document.getElementById('trophyMessage');
    box.hidden = true;
}

let trophyItems = [];
let isAdmin = false;
let editingItemId = null;
let reorderMode = false;
let reorderWorkingItems = [];
let lightboxImages = [];
let lightboxIndex = 0;
let lightboxName = '';
let lightboxDescription = '';

function buildViewHtml(item) {
    return `
        <div class="trophy-body">
            <div class="trophy-body-text">
                <h3 class="trophy-name">${escapeHtml(item.name || '')}</h3>
                <span class="trophy-description-text">${escapeHtml(item.description || '')}</span>
            </div>
            ${isAdmin ? `<button type="button" class="trophy-edit-button trophy-item-edit" data-id="${item.id}">Edit</button>` : ''}
        </div>
    `;
}

function buildFilenameRowHtml(filename) {
    return `
        <div class="trophy-filename-row">
            <input type="text" class="trophy-input trophy-filename-input" maxlength="120" placeholder="e.g. champions-cup-2023.jpg" value="${escapeHtml(filename || '')}">
            <button type="button" class="trophy-filename-remove" aria-label="Remove image">&times;</button>
        </div>
    `;
}

function addFilenameRow(list, filename) {
    list.insertAdjacentHTML('beforeend', buildFilenameRowHtml(filename));
}

function getFilenameListValues(list) {
    return Array.from(list.querySelectorAll('.trophy-filename-input'))
        .map(input => input.value.trim())
        .filter(Boolean);
}

function buildEditFormHtml(item) {
    const filenames = item.images && item.images.length ? item.images : [''];
    return `
        <div class="trophy-edit-form">
            <label>Trophy name</label>
            <input type="text" class="trophy-input trophy-edit-name" maxlength="120" value="${escapeHtml(item.name || '')}">
            <label>Description</label>
            <textarea class="trophy-textarea trophy-edit-description" rows="3" maxlength="500">${escapeHtml(item.description || '')}</textarea>
            <label>Image filenames</label>
            <div class="trophy-filename-list trophy-edit-filenames">
                ${filenames.map(buildFilenameRowHtml).join('')}
            </div>
            <button type="button" class="trophy-button-secondary trophy-add-filename-button trophy-add-filename">+ Add Another Image</button>
            <div class="trophy-edit-menu">
                <button type="button" class="trophy-button trophy-item-save" data-id="${item.id}">Save</button>
                <button type="button" class="trophy-button-secondary trophy-item-cancel" data-id="${item.id}">Cancel</button>
                <button type="button" class="trophy-button-danger trophy-item-delete" data-id="${item.id}">Delete</button>
            </div>
        </div>
    `;
}

function buildReorderControlsHtml(item, index, total) {
    return `
        <div class="trophy-reorder-controls">
            <button type="button" class="trophy-move-button trophy-move-up" data-id="${item.id}" ${index === 0 ? 'disabled' : ''}>&#8593; Up</button>
            <button type="button" class="trophy-move-button trophy-move-down" data-id="${item.id}" ${index === total - 1 ? 'disabled' : ''}>&#8595; Down</button>
        </div>
    `;
}

function renderTrophies(items) {
    const grid = document.getElementById('trophyGrid');

    if (!items.length) {
        grid.innerHTML = '<p class="trophy-empty">No trophies yet.</p>';
        return;
    }

    grid.innerHTML = items.map((item, index) => {
        const images = item.images || [];
        const countBadge = images.length > 1 ? `<span class="trophy-photo-count"><span class="trophy-photo-count-icon" aria-hidden="true">&#128247;</span>${images.length}</span>` : '';
        return `
        <div class="trophy-item${reorderMode ? ' reorder-active' : ''}" data-id="${item.id}">
            <div class="trophy-photo-wrap">
                <img class="trophy-photo" src="../Images/trophies/${escapeHtml(images[0] || '')}" alt="${escapeHtml(item.name || '')}" loading="lazy">
                ${countBadge}
            </div>
            ${reorderMode ? buildReorderControlsHtml(item, index, items.length) : (editingItemId === item.id ? buildEditFormHtml(item) : buildViewHtml(item))}
        </div>
    `;
    }).join('');
}

async function loadTrophies() {
    trophyItems = await NADARL.fetchTrophyItems();
    renderTrophies(trophyItems);
}

function moveReorderItem(id, direction) {
    const idx = reorderWorkingItems.findIndex(i => i.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= reorderWorkingItems.length) return;
    [reorderWorkingItems[idx], reorderWorkingItems[swapIdx]] = [reorderWorkingItems[swapIdx], reorderWorkingItems[idx]];
    renderTrophies(reorderWorkingItems);
}

function enterReorderMode() {
    reorderMode = true;
    reorderWorkingItems = trophyItems.slice();
    editingItemId = null;
    document.getElementById('addTrophyButton').hidden = true;
    document.getElementById('reorderTrophyButton').hidden = true;
    document.getElementById('reorderToolbar').hidden = false;
    renderTrophies(reorderWorkingItems);
}

function exitReorderMode() {
    reorderMode = false;
    reorderWorkingItems = [];
    document.getElementById('reorderToolbar').hidden = true;
    if (isAdmin) {
        document.getElementById('addTrophyButton').hidden = false;
        document.getElementById('reorderTrophyButton').hidden = false;
    }
    renderTrophies(trophyItems);
}

function wireReorderToolbar() {
    document.getElementById('reorderTrophyButton').addEventListener('click', enterReorderMode);
    document.getElementById('reorderCancel').addEventListener('click', exitReorderMode);

    document.getElementById('reorderSave').addEventListener('click', async () => {
        if (!confirm('Save this new trophy order?')) return;

        const saveButton = document.getElementById('reorderSave');
        saveButton.disabled = true;
        const res = await NADARL.reorderTrophyItems(reorderWorkingItems.map(item => item.id));
        saveButton.disabled = false;

        if (!res.ok) {
            showTrophyMessage('Could not save trophy order: ' + res.error, 'error');
            return;
        }

        exitReorderMode();
        await loadTrophies();
    });
}

function openLightbox(item) {
    lightboxImages = item.images || [];
    lightboxIndex = 0;
    lightboxName = item.name || '';
    lightboxDescription = item.description || '';
    renderLightbox();
    document.getElementById('trophyLightbox').hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    document.getElementById('trophyLightbox').hidden = true;
    document.body.style.overflow = '';
}

function moveLightbox(direction) {
    if (lightboxImages.length < 2) return;
    lightboxIndex = (lightboxIndex + direction + lightboxImages.length) % lightboxImages.length;
    renderLightbox();
}

function renderLightbox() {
    const filename = lightboxImages[lightboxIndex];
    const image = document.getElementById('trophyLightboxImage');
    image.src = '../Images/trophies/' + filename;
    image.alt = lightboxName;

    document.getElementById('trophyLightboxName').textContent = lightboxName;
    document.getElementById('trophyLightboxDescription').textContent = lightboxDescription;

    const hasMultiple = lightboxImages.length > 1;
    document.getElementById('trophyLightboxPrev').hidden = !hasMultiple;
    document.getElementById('trophyLightboxNext').hidden = !hasMultiple;

    const counter = document.getElementById('trophyLightboxCounter');
    counter.hidden = !hasMultiple;
    counter.textContent = (lightboxIndex + 1) + ' / ' + lightboxImages.length;
}

function wireLightbox() {
    document.getElementById('trophyLightboxClose').addEventListener('click', closeLightbox);
    document.getElementById('trophyLightboxBackdrop').addEventListener('click', closeLightbox);
    document.getElementById('trophyLightboxPrev').addEventListener('click', () => moveLightbox(-1));
    document.getElementById('trophyLightboxNext').addEventListener('click', () => moveLightbox(1));

    document.addEventListener('keydown', (e) => {
        if (document.getElementById('trophyLightbox').hidden) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') moveLightbox(-1);
        if (e.key === 'ArrowRight') moveLightbox(1);
    });
}

function wireTrophyGrid() {
    document.getElementById('trophyGrid').addEventListener('click', async (e) => {
        const photo = e.target.closest('.trophy-photo-wrap');
        if (photo && !reorderMode) {
            const id = photo.closest('.trophy-item').dataset.id;
            const item = trophyItems.find(i => i.id === id);
            if (item) openLightbox(item);
            return;
        }

        const upBtn = e.target.closest('.trophy-move-up');
        if (upBtn) { moveReorderItem(upBtn.dataset.id, -1); return; }

        const downBtn = e.target.closest('.trophy-move-down');
        if (downBtn) { moveReorderItem(downBtn.dataset.id, 1); return; }

        const editBtn = e.target.closest('.trophy-item-edit');
        if (editBtn) {
            editingItemId = editBtn.dataset.id;
            renderTrophies(trophyItems);
            return;
        }

        const cancelBtn = e.target.closest('.trophy-item-cancel');
        if (cancelBtn) {
            editingItemId = null;
            renderTrophies(trophyItems);
            return;
        }

        const deleteBtn = e.target.closest('.trophy-item-delete');
        if (deleteBtn) {
            if (!confirm('Delete this trophy? This cannot be undone.')) return;
            deleteBtn.disabled = true;
            const res = await NADARL.deleteTrophyItem(deleteBtn.dataset.id);
            if (!res.ok) {
                showTrophyMessage('Could not delete trophy: ' + res.error, 'error');
                deleteBtn.disabled = false;
                return;
            }
            editingItemId = null;
            await loadTrophies();
            return;
        }

        const addFilenameBtn = e.target.closest('.trophy-add-filename');
        if (addFilenameBtn) {
            const list = addFilenameBtn.closest('.trophy-edit-form').querySelector('.trophy-filename-list');
            addFilenameRow(list);
            return;
        }

        const removeFilenameBtn = e.target.closest('.trophy-filename-remove');
        if (removeFilenameBtn) {
            const row = removeFilenameBtn.closest('.trophy-filename-row');
            const list = row.parentElement;
            if (list.children.length > 1) {
                row.remove();
            } else {
                row.querySelector('.trophy-filename-input').value = '';
            }
            return;
        }

        const saveBtn = e.target.closest('.trophy-item-save');
        if (saveBtn) {
            const id = saveBtn.dataset.id;
            const card = saveBtn.closest('.trophy-item');
            const name = card.querySelector('.trophy-edit-name').value.trim();
            const description = card.querySelector('.trophy-edit-description').value.trim();
            const filenames = getFilenameListValues(card.querySelector('.trophy-edit-filenames'));
            if (!name) {
                showTrophyMessage('Please enter a trophy name.', 'error');
                return;
            }
            if (!filenames.length) {
                showTrophyMessage('Please enter at least one image filename.', 'error');
                return;
            }
            saveBtn.disabled = true;
            const res = await NADARL.updateTrophyItem(id, { name, filenames, description });
            saveBtn.disabled = false;
            if (!res.ok) {
                showTrophyMessage('Could not save trophy: ' + res.error, 'error');
                return;
            }
            editingItemId = null;
            await loadTrophies();
        }
    });
}

function goToWizardStep(step) {
    document.getElementById('wizardStep1').hidden = step !== 1;
    document.getElementById('wizardStep2').hidden = step !== 2;
    hideTrophyMessage();
}

function openWizard() {
    document.getElementById('trophyWizard').hidden = false;
    document.getElementById('addTrophyButton').hidden = true;
    document.getElementById('trophyNameInput').value = '';
    document.getElementById('trophyDescriptionInput').value = '';
    const filenameList = document.getElementById('wizardFilenameList');
    filenameList.innerHTML = '';
    addFilenameRow(filenameList);
    goToWizardStep(1);
}

function closeWizard() {
    document.getElementById('trophyWizard').hidden = true;
    document.getElementById('addTrophyButton').hidden = false;
}

function wireWizard() {
    document.getElementById('addTrophyButton').addEventListener('click', openWizard);
    document.getElementById('wizardCancel1').addEventListener('click', closeWizard);
    document.getElementById('wizardBack').addEventListener('click', () => goToWizardStep(1));

    document.getElementById('wizardAddFilename').addEventListener('click', () => {
        addFilenameRow(document.getElementById('wizardFilenameList'));
    });

    document.getElementById('wizardFilenameList').addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.trophy-filename-remove');
        if (!removeBtn) return;
        const row = removeBtn.closest('.trophy-filename-row');
        const list = row.parentElement;
        if (list.children.length > 1) {
            row.remove();
        } else {
            row.querySelector('.trophy-filename-input').value = '';
        }
    });

    document.getElementById('wizardNext').addEventListener('click', () => {
        const name = document.getElementById('trophyNameInput').value.trim();
        if (!name) {
            showTrophyMessage('Please enter a trophy name.', 'error');
            return;
        }
        goToWizardStep(2);
    });

    document.getElementById('wizardSave').addEventListener('click', async () => {
        const name = document.getElementById('trophyNameInput').value.trim();
        const description = document.getElementById('trophyDescriptionInput').value.trim();
        const filenames = getFilenameListValues(document.getElementById('wizardFilenameList'));
        if (!filenames.length) {
            showTrophyMessage('Please enter at least one image filename.', 'error');
            return;
        }

        const saveButton = document.getElementById('wizardSave');
        saveButton.disabled = true;
        const res = await NADARL.addTrophyItem({ name, filenames, description });
        saveButton.disabled = false;

        if (!res.ok) {
            showTrophyMessage('Could not save trophy: ' + res.error, 'error');
            return;
        }

        closeWizard();
        await loadTrophies();
    });
}

async function initTrophiesPage() {
    const me = await NADARL.fetchMyProfile();
    isAdmin = !!me && me.role === 'admin';
    if (isAdmin) {
        document.getElementById('addTrophyButton').hidden = false;
        document.getElementById('reorderTrophyButton').hidden = false;
    }
    wireWizard();
    wireReorderToolbar();
    wireTrophyGrid();
    wireLightbox();
    await loadTrophies();
}

document.addEventListener('DOMContentLoaded', initTrophiesPage);
