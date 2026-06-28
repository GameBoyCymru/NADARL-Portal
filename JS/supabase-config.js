// =====================================================================
//  Supabase client bootstrap
//  Loaded after the CDN (window.supabase) and supabase-keys.js.
//  Exposes a single shared client as window.db.
// =====================================================================
(function () {
    const url = window.NADARL_SUPABASE_URL;
    const anonKey = window.NADARL_SUPABASE_ANON_KEY;

    if (!url || !anonKey || url.indexOf('YOUR-PROJECT') !== -1) {
        console.error(
            '[NADARL] Supabase keys are not configured. ' +
            'Copy JS/supabase-keys.example.js to JS/supabase-keys.js and fill in your values.'
        );
        window.db = null;
        return;
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        console.error('[NADARL] Supabase JS library failed to load (CDN).');
        window.db = null;
        return;
    }

    window.db = window.supabase.createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true }
    });
})();
