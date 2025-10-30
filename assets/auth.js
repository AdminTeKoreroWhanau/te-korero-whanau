// Supabase auth + modal UI handlers
(function(){
  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
  if (!window.supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) { console.error('Supabase client not configured. Set window.SUPABASE_URL and window.SUPABASE_ANON_KEY.'); return; }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.sb = sb; // expose for other scripts (e.g., profile)

  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));
  function requestSubmit(form){
    try { if (typeof form.requestSubmit === 'function') { form.requestSubmit(); return; } } catch(_){}
    const btn = form.querySelector('button[type=submit], input[type=submit]');
    if (btn) btn.click();
    else form.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true }));
  }

  const modal = qs('#auth-modal');
  const openBtn = qs('#open-auth');
  const closeBtn = qs('#auth-close');
  const loginForm = qs('#login-form');
  const registerForm = qs('#register-form');
  const loginMsg = qs('#login-msg');
  const registerMsg = qs('#register-msg');
  const tabs = qsa('.tab');

  const navLogin = qs('#nav-login-item');
  const navProfile = qs('#nav-profile-item');
  const navSignout = qs('#nav-signout-item');
  const navAdmin = qs('#nav-admin-item');
  const signoutBtn = qs('#signout');

  function showModal(){ if (!modal) return; modal.hidden = false; modal.setAttribute('aria-hidden','false'); }
  function hideModal(){ if (!modal) return; modal.hidden = true; modal.setAttribute('aria-hidden','true'); }

  function switchTab(name){
    if (tabs.length){
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    }
    if (loginForm && registerForm){
      loginForm.hidden = name !== 'login';
      registerForm.hidden = name !== 'register';
    }
  }

  tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  if (openBtn) openBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const state = openBtn.dataset.state || 'out';
    if (state === 'out') { showModal(); }
    else { location.href = 'profile.html'; }
  });
  if (closeBtn) closeBtn.addEventListener('click', hideModal);
  // Disable closing auth modal via ESC or backdrop; require explicit close button
  document.addEventListener('keydown', (e) => { /* ESC close disabled for auth modal */ });
  if (modal) modal.addEventListener('click', (e) => { /* Backdrop click close disabled for auth modal */ });

  async function isAdmin(user){
    try {
      // 1) Check configured emails
      const emails = (window.ADMIN_EMAILS || []).map(e => String(e||'').toLowerCase());
      if (user?.email && emails.includes(String(user.email).toLowerCase())) return true;
      // 2) Check Supabase table membership (admin_users)
      const { data, error } = await sb.from('admin_users').select('user_id').eq('user_id', user?.id || '').maybeSingle();
      if (!error && data && data.user_id) return true;
    } catch {}
    return false;
  }

  async function setNavBySession(){
    const { data } = await sb.auth.getSession();
    const user = data.session?.user || null;

  // Show login link only when signed out
  if (navLogin) {
    const loginLink = navLogin.querySelector('a#open-auth');
    if (user){
      navLogin.style.display = 'none';
      if (loginLink){ loginLink.textContent = 'Login'; loginLink.setAttribute('href', '#'); loginLink.dataset.state = 'out'; }
    } else {
      navLogin.style.display = '';
      if (loginLink){ loginLink.textContent = 'Login'; loginLink.setAttribute('href', '#'); loginLink.dataset.state = 'out'; }
    }
  }

    // Toggle profile and sign-out buttons
    if (navProfile) navProfile.style.display = user ? '' : 'none';
    if (navSignout) navSignout.style.display = user ? '' : 'none';
    if (navAdmin) navAdmin.style.display = (user && await isAdmin(user)) ? '' : 'none';

    // Protect admin page
    const onAdmin = (location.pathname.split('/').pop()||'').toLowerCase() === 'admin.html';
    if (onAdmin){
      const ok = !!user && await isAdmin(user);
      if (!ok) location.href = 'index.html';
    }
  }

  // Initial nav state and on changes
  setNavBySession();
  // Update UI on auth changes and redirect only if the auth modal is open (i.e., an interactive login just occurred)
  sb.auth.onAuthStateChange((_event, session) => {
    setNavBySession();
    try {
      const modal = document.getElementById('auth-modal');
      const modalActive = !!(modal && modal.hidden === false);
      if (session && modalActive) {
        location.href = 'profile.html';
      }
    } catch(_){}
  });

  if (signoutBtn){
    signoutBtn.addEventListener('click', async (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      await sb.auth.signOut();
      // Return to home on signout when on profile page
      if (location.pathname.toLowerCase().endsWith('profile.html')) location.href = 'index.html';
    });
  }

  if (loginForm){
    loginForm.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); requestSubmit(loginForm); }
    });
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginMsg.textContent = '';
      const fd = new FormData(loginForm);
      const email = String(fd.get('email')||'').trim();
      const password = String(fd.get('password')||'');
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error){
        loginMsg.textContent = 'Hapa takiuru: ' + (error.message || 'Tē mōhiotia') + '. Mēnā kāore anō koe kia rēhita, tīpakohia te Rēhita.';
        return;
      }
      hideModal();
      // Go to profile
      location.href = 'profile.html';
    });
  }

  if (registerForm){
    registerForm.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); requestSubmit(registerForm); }
    });
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      registerMsg.textContent = '';
      const fd = new FormData(registerForm);
      const email = String(fd.get('email')||'').trim();
      const password = String(fd.get('password')||'');
      const full_name = String(fd.get('full_name')||'').trim();
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: full_name ? { full_name } : {} }
      });
      if (error){
        registerMsg.textContent = 'Hapa rēhita: ' + (error.message || 'Tē mōhiotia');
        return;
      }
      registerMsg.textContent = data.user?.confirmed_at ? 'Kua oti! Kua takiuru.' : 'Kua tonoa he īmēra whakapūmau. Tirohia tō pouaka īmēra.';
      if (data.session){
        hideModal();
        location.href = 'profile.html';
      }
    });
  }
})();
