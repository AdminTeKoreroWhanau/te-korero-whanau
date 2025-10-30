// Backend configuration. Default is local-only storage.
// To enable Supabase multi-user sharing, set window.SUPABASE_URL and window.SUPABASE_ANON_KEY (see assets/config.js).
// Example:
// window.SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
// window.SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';

(function(){
  const url = window.SUPABASE_URL;
  const anon = window.SUPABASE_ANON_KEY;
  if (url && anon){
    window.WAIATA_BACKEND = { type: 'supabase', url, anonKey: anon, bucket: 'waiata' };
    window.KORERO_BACKEND = { type: 'supabase', url, anonKey: anon };
  } else {
    // Fallback to local-only backend if not configured
    window.WAIATA_BACKEND = { type: 'local' };
    window.KORERO_BACKEND = { type: 'local' };
  }
})();

// Admin config: list admin emails here to grant admin UI access (optional; Supabase table also supported)
window.ADMIN_EMAILS = ['demonystica@gmail.com'];
