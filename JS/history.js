function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showHistoryMessage(text, type) {
    const box = document.getElementById('historyMessage');
    box.textContent = text;
    box.className = 'history-message history-message-' + type;
    box.hidden = false;
}

function hideHistoryMessage() {
    document.getElementById('historyMessage').hidden = true;
}

let historyItems = [];
let isAdmin = false;
let editingItemId = null;
let reorderMode = false;
let reorderWorkingItems = [];

function buildViewHtml(item) {
    return `
        ${isAdmin ? `<button type="button" class="timeline-edit-button timeline-item-edit" data-id="${item.id}">Edit</button>` : ''}
        ${item.filename ? `
        <div class="timeline-image-wrapper">
            <img src="../Images/history/${escapeHtml(item.filename)}" alt="${escapeHtml(item.heading || '')}" class="timeline-image" loading="lazy">
        </div>` : ''}
        ${item.year ? `<span class="timeline-year">${escapeHtml(item.year)}</span>` : ''}
        <h3 class="timeline-heading">${escapeHtml(item.heading || '')}</h3>
        <p class="timeline-text">${escapeHtml(item.body || '')}</p>
    `;
}

function buildEditFormHtml(item) {
    return `
        <div class="timeline-edit-form">
            <label>Year / era</label>
            <input type="text" class="history-input timeline-edit-year" maxlength="40" value="${escapeHtml(item.year || '')}">
            <label>Heading</label>
            <input type="text" class="history-input timeline-edit-heading" maxlength="120" value="${escapeHtml(item.heading || '')}">
            <label>Image filename</label>
            <input type="text" class="history-input timeline-edit-filename" maxlength="120" value="${escapeHtml(item.filename || '')}" placeholder="e.g. founding-1907.jpg">
            <label>Text</label>
            <textarea class="history-textarea timeline-edit-body" rows="4" maxlength="1000">${escapeHtml(item.body || '')}</textarea>
            <div class="timeline-edit-menu">
                <button type="button" class="history-button timeline-item-save" data-id="${item.id}">Save</button>
                <button type="button" class="history-button-secondary timeline-item-cancel" data-id="${item.id}">Cancel</button>
                <button type="button" class="history-button-danger timeline-item-delete" data-id="${item.id}">Delete</button>
            </div>
        </div>
    `;
}

function buildReorderControlsHtml(item, index, total) {
    return `
        <div class="timeline-reorder-summary">
            ${item.year ? `<span class="timeline-year">${escapeHtml(item.year)}</span>` : ''}
            <h3 class="timeline-heading">${escapeHtml(item.heading || '')}</h3>
        </div>
        <div class="timeline-reorder-controls">
            <button type="button" class="timeline-move-button timeline-move-up" data-id="${item.id}" ${index === 0 ? 'disabled' : ''}>&#8593; Up</button>
            <button type="button" class="timeline-move-button timeline-move-down" data-id="${item.id}" ${index === total - 1 ? 'disabled' : ''}>&#8595; Down</button>
        </div>
    `;
}

function renderHistoryItems(items) {
    const timeline = document.getElementById('historyTimeline');

    if (!items.length) {
        timeline.innerHTML = '<p class="history-empty">No history entries yet.</p>';
        return;
    }

    timeline.innerHTML = items.map((item, index) => `
        <div class="timeline-item" data-id="${item.id}">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
                ${reorderMode ? buildReorderControlsHtml(item, index, items.length) : (editingItemId === item.id ? buildEditFormHtml(item) : buildViewHtml(item))}
            </div>
        </div>
    `).join('');
}

async function loadHistoryItems() {
    historyItems = await NADARL.fetchHistoryItems();
    renderHistoryItems(historyItems);
}

function moveReorderItem(id, direction) {
    const idx = reorderWorkingItems.findIndex(i => i.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= reorderWorkingItems.length) return;
    [reorderWorkingItems[idx], reorderWorkingItems[swapIdx]] = [reorderWorkingItems[swapIdx], reorderWorkingItems[idx]];
    renderHistoryItems(reorderWorkingItems);
}

function enterReorderMode() {
    reorderMode = true;
    reorderWorkingItems = historyItems.slice();
    editingItemId = null;
    document.getElementById('addHistoryButton').hidden = true;
    document.getElementById('reorderHistoryButton').hidden = true;
    document.getElementById('historyReorderToolbar').hidden = false;
    renderHistoryItems(reorderWorkingItems);
}

function exitReorderMode() {
    reorderMode = false;
    reorderWorkingItems = [];
    document.getElementById('historyReorderToolbar').hidden = true;
    if (isAdmin) {
        document.getElementById('addHistoryButton').hidden = false;
        document.getElementById('reorderHistoryButton').hidden = false;
    }
    renderHistoryItems(historyItems);
}

function wireReorderToolbar() {
    document.getElementById('reorderHistoryButton').addEventListener('click', enterReorderMode);
    document.getElementById('historyReorderCancel').addEventListener('click', exitReorderMode);

    document.getElementById('historyReorderSave').addEventListener('click', async () => {
        if (!confirm('Save this new entry order?')) return;

        const saveButton = document.getElementById('historyReorderSave');
        saveButton.disabled = true;
        const res = await NADARL.reorderHistoryItems(reorderWorkingItems.map(item => item.id));
        saveButton.disabled = false;

        if (!res.ok) {
            showHistoryMessage('Could not save entry order: ' + res.error, 'error');
            return;
        }

        exitReorderMode();
        await loadHistoryItems();
    });
}

function wireTimeline() {
    document.getElementById('historyTimeline').addEventListener('click', async (e) => {
        const upBtn = e.target.closest('.timeline-move-up');
        if (upBtn) { moveReorderItem(upBtn.dataset.id, -1); return; }

        const downBtn = e.target.closest('.timeline-move-down');
        if (downBtn) { moveReorderItem(downBtn.dataset.id, 1); return; }

        const editBtn = e.target.closest('.timeline-item-edit');
        if (editBtn) {
            editingItemId = editBtn.dataset.id;
            renderHistoryItems(historyItems);
            return;
        }

        const cancelBtn = e.target.closest('.timeline-item-cancel');
        if (cancelBtn) {
            editingItemId = null;
            renderHistoryItems(historyItems);
            return;
        }

        const deleteBtn = e.target.closest('.timeline-item-delete');
        if (deleteBtn) {
            if (!confirm('Delete this history entry? This cannot be undone.')) return;
            deleteBtn.disabled = true;
            const res = await NADARL.deleteHistoryItem(deleteBtn.dataset.id);
            if (!res.ok) {
                showHistoryMessage('Could not delete entry: ' + res.error, 'error');
                deleteBtn.disabled = false;
                return;
            }
            editingItemId = null;
            await loadHistoryItems();
            return;
        }

        const saveBtn = e.target.closest('.timeline-item-save');
        if (saveBtn) {
            const id = saveBtn.dataset.id;
            const card = saveBtn.closest('.timeline-item');
            const year = card.querySelector('.timeline-edit-year').value.trim();
            const heading = card.querySelector('.timeline-edit-heading').value.trim();
            const filename = card.querySelector('.timeline-edit-filename').value.trim();
            const body = card.querySelector('.timeline-edit-body').value.trim();
            if (!heading) {
                showHistoryMessage('Please enter a heading.', 'error');
                return;
            }
            saveBtn.disabled = true;
            const res = await NADARL.updateHistoryItem(id, { year, heading, body, filename });
            saveBtn.disabled = false;
            if (!res.ok) {
                showHistoryMessage('Could not save entry: ' + res.error, 'error');
                return;
            }
            editingItemId = null;
            await loadHistoryItems();
        }
    });
}

function openWizard() {
    document.getElementById('historyWizard').hidden = false;
    document.getElementById('addHistoryButton').hidden = true;
    document.getElementById('historyYearInput').value = '';
    document.getElementById('historyHeadingInput').value = '';
    document.getElementById('historyFilenameInput').value = '';
    document.getElementById('historyBodyInput').value = '';
    hideHistoryMessage();
}

function closeWizard() {
    document.getElementById('historyWizard').hidden = true;
    document.getElementById('addHistoryButton').hidden = false;
}

function wireWizard() {
    document.getElementById('addHistoryButton').addEventListener('click', openWizard);
    document.getElementById('historyWizardCancel').addEventListener('click', closeWizard);

    document.getElementById('historyWizardSave').addEventListener('click', async () => {
        const year = document.getElementById('historyYearInput').value.trim();
        const heading = document.getElementById('historyHeadingInput').value.trim();
        const filename = document.getElementById('historyFilenameInput').value.trim();
        const body = document.getElementById('historyBodyInput').value.trim();
        if (!heading) {
            showHistoryMessage('Please enter a heading.', 'error');
            return;
        }

        const saveButton = document.getElementById('historyWizardSave');
        saveButton.disabled = true;
        const res = await NADARL.addHistoryItem({ year, heading, body, filename });
        saveButton.disabled = false;

        if (!res.ok) {
            showHistoryMessage('Could not save entry: ' + res.error, 'error');
            return;
        }

        closeWizard();
        await loadHistoryItems();
    });
}

async function initHistoryPage() {
    const me = await NADARL.fetchMyProfile();
    isAdmin = !!me && me.role === 'admin';
    if (isAdmin) {
        document.getElementById('addHistoryButton').hidden = false;
        document.getElementById('reorderHistoryButton').hidden = false;
    }
    wireWizard();
    wireReorderToolbar();
    wireTimeline();
    await loadHistoryItems();
}

document.addEventListener('DOMContentLoaded', initHistoryPage);
