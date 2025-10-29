// Backend configuration. Default is local-only storage.
// To enable Supabase multi-user sharing, replace with your project details:
// window.WAIATA_BACKEND = { type: 'supabase', url: 'https://YOUR-PROJECT.supabase.co', anonKey: 'YOUR_ANON_PUBLIC_KEY', bucket: 'waiata' };
// window.KORERO_BACKEND = { type: 'supabase', url: 'https://YOUR-PROJECT.supabase.co', anonKey: 'YOUR_ANON_PUBLIC_KEY', bucket: 'korero' };

window.WAIATA_BACKEND = { 
  type: 'supabase', 
  url: 'https://qnugrhzytvbfetqpgzlw.supabase.co', 
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFudWdyaHp5dHZiZmV0cXBnemx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3MDk4NTQsImV4cCI6MjA3NzI4NTg1NH0.0lSP_Oms9Rya7nyXwHr7i_-2ku3lLImMKVhFBil2HyY', 
  bucket: 'waiata' 
};
window.KORERO_BACKEND = { 
  type: 'supabase', 
  url: 'https://qnugrhzytvbfetqpgzlw.supabase.co', 
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFudWdyaHp5dHZiZmV0cXBnemx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3MDk4NTQsImV4cCI6MjA3NzI4NTg1NH0.0lSP_Oms9Rya7nyXwHr7i_-2ku3lLImMKVhFBil2HyY' 
};
// Admin config: list admin emails here to grant admin UI access (optional; Supabase table also supported)
window.ADMIN_EMAILS = ['demonystica@gmail.com'];
