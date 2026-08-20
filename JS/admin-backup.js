// =====================================================================
//  Admin data backup / restore (admin only).
//  Exports every base table as one downloadable JSON snapshot, and can
//  restore that snapshot into a freshly-schema'd, empty database.
// =====================================================================

document.addEventListener('DOMContentLoaded', () => {
    const exportBtn = document.getElementById('backupExport');
    const importBtn = document.getElementById('backupImport');
    const fileInput = document.getElementById('backupImportFile');
    const message = document.getElementById('backupMessage');

    if (!window.db || !exportBtn) return;

    init();

    async function init() {
        const me = await NADARL.fetchMyProfile();
        if (!me || me.role !== 'admin') return;
        if (typeof NADARL.exportAllData !== 'function' || typeof NADARL.importAllData !== 'function') {
            showMessage(
                'Backup tools failed to load — your browser is using a cached ' +
                'copy of data.js. Please hard-refresh (Ctrl/Cmd+Shift+R).',
                'error'
            );
            return;
        }
    }

    exportBtn.addEventListener('click', async () => {
        exportBtn.disabled = true;
        showMessage('Exporting…');
        const res = await NADARL.exportAllData();
        exportBtn.disabled = false;
        if (!res.ok) { showMessage('Export failed: ' + res.error, 'error'); return; }

        const counts = Object.entries(res.payload.tables)
            .map(([table, rows]) => table + ': ' + rows.length)
            .join(', ');

        const json = JSON.stringify(res.payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'nadarl-backup-' + res.payload.exported_at.slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showMessage('Exported (' + counts + ').', 'success');
    });

    fileInput.addEventListener('change', () => {
        importBtn.disabled = !fileInput.files.length;
    });

    const MAX_IMPORT_BYTES = 50 * 1024 * 1024; // 50MB - generous headroom over a real export, guards against picking the wrong file

    importBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        if (file.size > MAX_IMPORT_BYTES) {
            showMessage('File is too large to be a valid backup (' + Math.round(file.size / 1024 / 1024) + 'MB).', 'error');
            return;
        }
        if (!confirm(
            'Import data from "' + file.name + '"? This inserts every row from the file into ' +
            'the current database. Only run this against a freshly-created, empty database ' +
            '(schema already applied, no data yet) - running it against a database that already ' +
            'has data will fail or create duplicates.'
        )) return;

        importBtn.disabled = true;
        showMessage('Reading file…');

        let payload;
        try {
            payload = JSON.parse(await file.text());
        } catch (e) {
            importBtn.disabled = false;
            showMessage('Could not parse file: not valid JSON.', 'error');
            return;
        }

        const res = await NADARL.importAllData(payload, (table, count) => {
            showMessage('Imported ' + table + ' (' + count + ' rows)…');
        });
        importBtn.disabled = false;
        if (!res.ok) { showMessage('Import failed: ' + res.error, 'error'); return; }

        fileInput.value = '';
        importBtn.disabled = true;
        showMessage(
            'Import complete. User accounts were not restored — re-invite admins/captains ' +
            'and reassign their role/team on the Team Manager page.',
            'success'
        );
    });

    function showMessage(text, type) {
        message.textContent = text;
        message.className = 'login-message' + (type ? ' login-message-' + type : '');
        message.hidden = false;
    }
});
