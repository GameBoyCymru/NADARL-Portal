function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showSaleMessage(text, type) {
    const box = document.getElementById('saleMessage');
    box.textContent = text;
    box.className = 'sale-message sale-message-' + type;
    box.hidden = false;
}

function hideSaleMessage() {
    const box = document.getElementById('saleMessage');
    box.hidden = true;
}

const SALE_CATEGORIES = [
    { key: 'league', gridId: 'saleGridLeague', reorderButtonId: 'reorderLeagueButton', reorderToolbarId: 'reorderToolbarLeague', reorderCancelId: 'reorderCancelLeague', reorderSaveId: 'reorderSaveLeague' },
    { key: 'private', gridId: 'saleGridPrivate', reorderButtonId: 'reorderPrivateButton', reorderToolbarId: 'reorderToolbarPrivate', reorderCancelId: 'reorderCancelPrivate', reorderSaveId: 'reorderSavePrivate' }
];

let saleItems = [];
let isAdmin = false;
let editingItemId = null;
let reorderCategory = null;
let reorderWorkingItems = [];
let lightboxImages = [];
let lightboxIndex = 0;
let lightboxName = '';
let lightboxPrice = '';
let lightboxDescription = '';

function itemsForCategory(items, category) {
    return items.filter(item => (item.category || 'league') === category);
}

function buildViewHtml(item) {
    return `
        <div class="sale-body">
            <div class="sale-body-text">
                <h3 class="sale-name">${escapeHtml(item.name || '')}</h3>
                ${item.price ? `<span class="sale-price">${escapeHtml(item.price)}</span>` : ''}
                <span class="sale-description-text">${escapeHtml(item.description || '')}</span>
                <a href="join.html?type=sale&amp;item=${encodeURIComponent(item.id)}" class="sale-enquire-button">Enquire</a>
            </div>
            ${isAdmin ? `<button type="button" class="sale-edit-button sale-item-edit" data-id="${item.id}">Edit</button>` : ''}
        </div>
    `;
}

function buildFilenameRowHtml(filename) {
    return `
        <div class="sale-filename-row">
            <input type="text" class="sale-input sale-filename-input" maxlength="120" placeholder="e.g. air-rifle-1.jpg" value="${escapeHtml(filename || '')}">
            <button type="button" class="sale-filename-remove" aria-label="Remove image">&times;</button>
        </div>
    `;
}

function addFilenameRow(list, filename) {
    list.insertAdjacentHTML('beforeend', buildFilenameRowHtml(filename));
}

function getFilenameListValues(list) {
    return Array.from(list.querySelectorAll('.sale-filename-input'))
        .map(input => input.value.trim())
        .filter(Boolean);
}

function buildEditFormHtml(item) {
    const filenames = item.images && item.images.length ? item.images : [''];
    const category = item.category || 'league';
    return `
        <div class="sale-edit-form">
            <label>Item name</label>
            <input type="text" class="sale-input sale-edit-name" maxlength="120" value="${escapeHtml(item.name || '')}">
            <label>Price</label>
            <input type="text" class="sale-input sale-edit-price" maxlength="40" value="${escapeHtml(item.price || '')}">
            <label>Category</label>
            <select class="sale-input sale-edit-category">
                <option value="league" ${category === 'league' ? 'selected' : ''}>League Merchandise</option>
                <option value="private" ${category === 'private' ? 'selected' : ''}>Private Sales</option>
            </select>
            <label>Description</label>
            <textarea class="sale-textarea sale-edit-description" rows="3" maxlength="500">${escapeHtml(item.description || '')}</textarea>
            <label>Image filenames</label>
            <div class="sale-filename-list sale-edit-filenames">
                ${filenames.map(buildFilenameRowHtml).join('')}
            </div>
            <button type="button" class="sale-button-secondary sale-add-filename-button sale-add-filename">+ Add Another Image</button>
            <div class="sale-edit-menu">
                <button type="button" class="sale-button sale-item-save" data-id="${item.id}">Save</button>
                <button type="button" class="sale-button-secondary sale-item-cancel" data-id="${item.id}">Cancel</button>
                <button type="button" class="sale-button-danger sale-item-delete" data-id="${item.id}">Delete</button>
            </div>
        </div>
    `;
}

function buildReorderControlsHtml(item, index, total) {
    return `
        <div class="sale-reorder-controls">
            <button type="button" class="sale-move-button sale-move-up" data-id="${item.id}" ${index === 0 ? 'disabled' : ''}>&#8593; Up</button>
            <button type="button" class="sale-move-button sale-move-down" data-id="${item.id}" ${index === total - 1 ? 'disabled' : ''}>&#8595; Down</button>
        </div>
    `;
}

function renderSaleItemsInto(gridId, items, isReorderActive) {
    const grid = document.getElementById(gridId);

    if (!items.length) {
        grid.innerHTML = '<p class="sale-empty">Nothing here right now.</p>';
        return;
    }

    grid.innerHTML = items.map((item, index) => {
        const images = item.images || [];
        const countBadge = images.length > 1 ? `<span class="sale-photo-count"><span class="sale-photo-count-icon" aria-hidden="true">&#128247;</span>${images.length}</span>` : '';
        return `
        <div class="sale-item${isReorderActive ? ' reorder-active' : ''}" data-id="${item.id}">
            <div class="sale-photo-wrap">
                <img class="sale-photo" src="../Images/sales/${escapeHtml(images[0] || '')}" alt="${escapeHtml(item.name || '')}" loading="lazy">
                ${countBadge}
            </div>
            ${isReorderActive ? buildReorderControlsHtml(item, index, items.length) : (editingItemId === item.id ? buildEditFormHtml(item) : buildViewHtml(item))}
        </div>
    `;
    }).join('');
}

function renderSaleItems() {
    SALE_CATEGORIES.forEach(cat => {
        const items = reorderCategory === cat.key ? reorderWorkingItems : itemsForCategory(saleItems, cat.key);
        renderSaleItemsInto(cat.gridId, items, reorderCategory === cat.key);
    });
}

async function loadSaleItems() {
    saleItems = await NADARL.fetchSaleItems();
    renderSaleItems();
}

function moveReorderItem(id, direction) {
    const idx = reorderWorkingItems.findIndex(i => i.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= reorderWorkingItems.length) return;
    [reorderWorkingItems[idx], reorderWorkingItems[swapIdx]] = [reorderWorkingItems[swapIdx], reorderWorkingItems[idx]];
    renderSaleItems();
}

function enterReorderMode(category) {
    reorderCategory = category;
    reorderWorkingItems = itemsForCategory(saleItems, category);
    editingItemId = null;
    SALE_CATEGORIES.forEach(cat => {
        document.getElementById(cat.reorderButtonId).hidden = true;
        document.getElementById(cat.reorderToolbarId).hidden = cat.key !== category;
    });
    document.getElementById('addSaleButton').hidden = true;
    renderSaleItems();
}

function exitReorderMode() {
    reorderCategory = null;
    reorderWorkingItems = [];
    SALE_CATEGORIES.forEach(cat => {
        document.getElementById(cat.reorderToolbarId).hidden = true;
        if (isAdmin) document.getElementById(cat.reorderButtonId).hidden = false;
    });
    if (isAdmin) document.getElementById('addSaleButton').hidden = false;
    renderSaleItems();
}

function wireReorderToolbar() {
    SALE_CATEGORIES.forEach(cat => {
        document.getElementById(cat.reorderButtonId).addEventListener('click', () => enterReorderMode(cat.key));
        document.getElementById(cat.reorderCancelId).addEventListener('click', exitReorderMode);

        document.getElementById(cat.reorderSaveId).addEventListener('click', async () => {
            if (!confirm('Save this new item order?')) return;

            const saveButton = document.getElementById(cat.reorderSaveId);
            saveButton.disabled = true;
            const res = await NADARL.reorderSaleItems(reorderWorkingItems.map(item => item.id));
            saveButton.disabled = false;

            if (!res.ok) {
                showSaleMessage('Could not save item order: ' + res.error, 'error');
                return;
            }

            exitReorderMode();
            await loadSaleItems();
        });
    });
}

function openLightbox(item) {
    lightboxImages = item.images || [];
    lightboxIndex = 0;
    lightboxName = item.name || '';
    lightboxPrice = item.price || '';
    lightboxDescription = item.description || '';
    renderLightbox();
    document.getElementById('saleLightbox').hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    document.getElementById('saleLightbox').hidden = true;
    document.body.style.overflow = '';
}

function moveLightbox(direction) {
    if (lightboxImages.length < 2) return;
    lightboxIndex = (lightboxIndex + direction + lightboxImages.length) % lightboxImages.length;
    renderLightbox();
}

function renderLightbox() {
    const filename = lightboxImages[lightboxIndex];
    const image = document.getElementById('saleLightboxImage');
    image.src = '../Images/sales/' + filename;
    image.alt = lightboxName;

    document.getElementById('saleLightboxName').textContent = lightboxName;
    document.getElementById('saleLightboxPrice').textContent = lightboxPrice;
    document.getElementById('saleLightboxDescription').textContent = lightboxDescription;

    const hasMultiple = lightboxImages.length > 1;
    document.getElementById('saleLightboxPrev').hidden = !hasMultiple;
    document.getElementById('saleLightboxNext').hidden = !hasMultiple;

    const counter = document.getElementById('saleLightboxCounter');
    counter.hidden = !hasMultiple;
    counter.textContent = (lightboxIndex + 1) + ' / ' + lightboxImages.length;
}

function wireLightbox() {
    document.getElementById('saleLightboxClose').addEventListener('click', closeLightbox);
    document.getElementById('saleLightboxBackdrop').addEventListener('click', closeLightbox);
    document.getElementById('saleLightboxPrev').addEventListener('click', () => moveLightbox(-1));
    document.getElementById('saleLightboxNext').addEventListener('click', () => moveLightbox(1));

    document.addEventListener('keydown', (e) => {
        if (document.getElementById('saleLightbox').hidden) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') moveLightbox(-1);
        if (e.key === 'ArrowRight') moveLightbox(1);
    });
}

function wireSaleGrid() {
    const onGridClick = async (e) => {
        const photo = e.target.closest('.sale-photo-wrap');
        if (photo && reorderCategory === null) {
            const id = photo.closest('.sale-item').dataset.id;
            const item = saleItems.find(i => i.id === id);
            if (item) openLightbox(item);
            return;
        }

        const upBtn = e.target.closest('.sale-move-up');
        if (upBtn) { moveReorderItem(upBtn.dataset.id, -1); return; }

        const downBtn = e.target.closest('.sale-move-down');
        if (downBtn) { moveReorderItem(downBtn.dataset.id, 1); return; }

        const editBtn = e.target.closest('.sale-item-edit');
        if (editBtn) {
            editingItemId = editBtn.dataset.id;
            renderSaleItems();
            return;
        }

        const cancelBtn = e.target.closest('.sale-item-cancel');
        if (cancelBtn) {
            editingItemId = null;
            renderSaleItems();
            return;
        }

        const deleteBtn = e.target.closest('.sale-item-delete');
        if (deleteBtn) {
            if (!confirm('Delete this item? This cannot be undone.')) return;
            deleteBtn.disabled = true;
            const res = await NADARL.deleteSaleItem(deleteBtn.dataset.id);
            if (!res.ok) {
                showSaleMessage('Could not delete item: ' + res.error, 'error');
                deleteBtn.disabled = false;
                return;
            }
            editingItemId = null;
            await loadSaleItems();
            return;
        }

        const addFilenameBtn = e.target.closest('.sale-add-filename');
        if (addFilenameBtn) {
            const list = addFilenameBtn.closest('.sale-edit-form').querySelector('.sale-filename-list');
            addFilenameRow(list);
            return;
        }

        const removeFilenameBtn = e.target.closest('.sale-filename-remove');
        if (removeFilenameBtn) {
            const row = removeFilenameBtn.closest('.sale-filename-row');
            const list = row.parentElement;
            if (list.children.length > 1) {
                row.remove();
            } else {
                row.querySelector('.sale-filename-input').value = '';
            }
            return;
        }

        const saveBtn = e.target.closest('.sale-item-save');
        if (saveBtn) {
            const id = saveBtn.dataset.id;
            const card = saveBtn.closest('.sale-item');
            const name = card.querySelector('.sale-edit-name').value.trim();
            const price = card.querySelector('.sale-edit-price').value.trim();
            const category = card.querySelector('.sale-edit-category').value;
            const description = card.querySelector('.sale-edit-description').value.trim();
            const filenames = getFilenameListValues(card.querySelector('.sale-edit-filenames'));
            if (!name) {
                showSaleMessage('Please enter an item name.', 'error');
                return;
            }
            if (!filenames.length) {
                showSaleMessage('Please enter at least one image filename.', 'error');
                return;
            }
            saveBtn.disabled = true;
            const res = await NADARL.updateSaleItem(id, { name, price, filenames, description, category });
            saveBtn.disabled = false;
            if (!res.ok) {
                showSaleMessage('Could not save item: ' + res.error, 'error');
                return;
            }
            editingItemId = null;
            await loadSaleItems();
        }
    };

    SALE_CATEGORIES.forEach(cat => {
        document.getElementById(cat.gridId).addEventListener('click', onGridClick);
    });
}

function goToWizardStep(step) {
    document.getElementById('wizardStep1').hidden = step !== 1;
    document.getElementById('wizardStep2').hidden = step !== 2;
    hideSaleMessage();
}

function openWizard() {
    document.getElementById('saleWizard').hidden = false;
    document.getElementById('addSaleButton').hidden = true;
    document.getElementById('saleNameInput').value = '';
    document.getElementById('salePriceInput').value = '';
    document.getElementById('saleCategoryInput').value = 'league';
    document.getElementById('saleDescriptionInput').value = '';
    const filenameList = document.getElementById('wizardFilenameList');
    filenameList.innerHTML = '';
    addFilenameRow(filenameList);
    goToWizardStep(1);
}

function closeWizard() {
    document.getElementById('saleWizard').hidden = true;
    document.getElementById('addSaleButton').hidden = false;
}

function wireWizard() {
    document.getElementById('addSaleButton').addEventListener('click', openWizard);
    document.getElementById('wizardCancel1').addEventListener('click', closeWizard);
    document.getElementById('wizardBack').addEventListener('click', () => goToWizardStep(1));

    document.getElementById('wizardAddFilename').addEventListener('click', () => {
        addFilenameRow(document.getElementById('wizardFilenameList'));
    });

    document.getElementById('wizardFilenameList').addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.sale-filename-remove');
        if (!removeBtn) return;
        const row = removeBtn.closest('.sale-filename-row');
        const list = row.parentElement;
        if (list.children.length > 1) {
            row.remove();
        } else {
            row.querySelector('.sale-filename-input').value = '';
        }
    });

    document.getElementById('wizardNext').addEventListener('click', () => {
        const name = document.getElementById('saleNameInput').value.trim();
        if (!name) {
            showSaleMessage('Please enter an item name.', 'error');
            return;
        }
        goToWizardStep(2);
    });

    document.getElementById('wizardSave').addEventListener('click', async () => {
        const name = document.getElementById('saleNameInput').value.trim();
        const price = document.getElementById('salePriceInput').value.trim();
        const category = document.getElementById('saleCategoryInput').value;
        const description = document.getElementById('saleDescriptionInput').value.trim();
        const filenames = getFilenameListValues(document.getElementById('wizardFilenameList'));
        if (!filenames.length) {
            showSaleMessage('Please enter at least one image filename.', 'error');
            return;
        }

        const saveButton = document.getElementById('wizardSave');
        saveButton.disabled = true;
        const res = await NADARL.addSaleItem({ name, price, filenames, description, category });
        saveButton.disabled = false;

        if (!res.ok) {
            showSaleMessage('Could not save item: ' + res.error, 'error');
            return;
        }

        closeWizard();
        await loadSaleItems();
    });
}

async function initSalesPage() {
    const me = await NADARL.fetchMyProfile();
    isAdmin = !!me && me.role === 'admin';
    if (isAdmin) {
        document.getElementById('addSaleButton').hidden = false;
        SALE_CATEGORIES.forEach(cat => {
            document.getElementById(cat.reorderButtonId).hidden = false;
        });
    }
    wireWizard();
    wireReorderToolbar();
    wireSaleGrid();
    wireLightbox();
    await loadSaleItems();
}

document.addEventListener('DOMContentLoaded', initSalesPage);
