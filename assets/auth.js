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

  // Pages that don't require authentication
  const publicPages = ['landing.html', 'korero-public.html', 'whanau-join.html', 'signup.html', ''];
  
  function getCurrentPage() {
    const path = location.pathname.split('/').pop() || '';
    return path.toLowerCase();
  }
  
  function isPublicPage() {
    const page = getCurrentPage();
    return publicPages.includes(page) || page === 'landing.html';
  }

  async function setNavBySession(){
    const { data } = await sb.auth.getSession();
    const user = data.session?.user || null;
    const currentPage = getCurrentPage();

    // Protect pages - redirect to landing if not logged in
    if (!user && !isPublicPage()) {
      location.href = 'landing.html';
      return;
    }

    // Update logo to show greeting when logged in (with whānau name)
    const logo = qs('.logo');
    if (logo) {
      if (user) {
        const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Whānau';
        const firstName = fullName.split(' ')[0];
        logo.textContent = `Kia ora, ${firstName}`;
      } else {
        logo.textContent = 'Te Kōrero Whānau';
      }
    }

    // Show login link only when signed out
    if (navLogin) {
      const loginLink = navLogin.querySelector('a#open-auth');
      if (user){
        navLogin.style.display = 'none';
        if (loginLink){ loginLink.textContent = 'Takiuru / Login'; loginLink.setAttribute('href', '#'); loginLink.dataset.state = 'out'; }
      } else {
        navLogin.style.display = '';
        if (loginLink){ loginLink.textContent = 'Takiuru / Login'; loginLink.setAttribute('href', '#'); loginLink.dataset.state = 'out'; }
      }
    }

    // Toggle profile and sign-out buttons
    if (navProfile) navProfile.style.display = user ? '' : 'none';
    if (navSignout) navSignout.style.display = user ? '' : 'none';
    if (navAdmin) navAdmin.style.display = (user && await isAdmin(user)) ? '' : 'none';
    
  // Show/hide auth-only nav items (for landing page)
    const authOnlyItems = document.querySelectorAll('.nav-auth-only');
    authOnlyItems.forEach(item => {
      item.style.display = user ? '' : 'none';
    });
    
    // Hide signup option when logged in
    const navSignup = document.getElementById('nav-signup-item');
    if (navSignup) navSignup.style.display = user ? 'none' : '';
    
    // Hide CTA signup buttons when logged in
    const ctaSignupBtns = document.querySelectorAll('#cta-signup, #cta-events-signup, #sidebar-signup');
    ctaSignupBtns.forEach(btn => {
      if (btn) btn.style.display = user ? 'none' : '';
    });

    // Protect admin page
    const onAdmin = currentPage === 'admin.html';
    if (onAdmin){
      const ok = !!user && await isAdmin(user);
      if (!ok) location.href = 'index.html';
    }
  }

  // Initial nav state and on changes
  setNavBySession();
  // Update UI on auth changes and redirect to index after login
  sb.auth.onAuthStateChange((_event, session) => {
    setNavBySession();
    try {
      const modal = document.getElementById('auth-modal');
      const modalActive = !!(modal && modal.hidden === false);
      const currentPage = getCurrentPage();
      // Redirect to index after successful login from landing page or modal
      if (session && (modalActive || currentPage === 'landing.html')) {
        // Check whānau membership before redirecting
        (async () => {
          try {
            const { data } = await sb.from('whanau_members').select('whanau_id').eq('user_id', session.user.id).limit(1).maybeSingle();
            location.href = (data && data.whanau_id) ? 'index.html' : 'whanau-join.html';
          } catch(_){ location.href = 'index.html'; }
        })();
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
      // Check if user has a whānau; if not, go to join page
      await redirectAfterAuth();
    });
  }

  // Helper: redirect to index or whanau-join based on membership
  async function redirectAfterAuth(){
    try {
      const { data: sess } = await sb.auth.getSession();
      const user = sess.session?.user;
      if (!user) { location.href = 'landing.html'; return; }
      const { data } = await sb.from('whanau_members').select('whanau_id').eq('user_id', user.id).limit(1).maybeSingle();
      if (data && data.whanau_id) { location.href = 'index.html'; }
      else { location.href = 'whanau-join.html'; }
    } catch(_){ location.href = 'index.html'; }
  }

  // Register form — redirect to dedicated signup page instead of inline registration
  if (registerForm){
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      location.href = 'signup.html';
    });
  }
})();
