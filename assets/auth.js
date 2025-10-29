// Supabase auth + modal UI handlers
(function(){
  const SUPABASE_URL = window.SUPABASE_URL || 'https://qnugrhzytvbfetqpgzlw.supabase.co';
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFudWdyaHp5dHZiZmV0cXBnemx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3MDk4NTQsImV4cCI6MjA3NzI4NTg1NH0.0lSP_Oms9Rya7nyXwHr7i_-2ku3lLImMKVhFBil2HyY';
  if (!window.supabase) return;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.sb = sb; // expose for other scripts (e.g., profile)

  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

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
  if (openBtn) openBtn.addEventListener('click', (e) => { e.preventDefault(); showModal(); });
  if (closeBtn) closeBtn.addEventListener('click', hideModal);
  document.addEventListener('keydown', (e) => { if (e.key==='Escape' && modal && !modal.hidden) hideModal(); });
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) hideModal(); });

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
    if (navLogin) navLogin.style.display = user ? 'none' : '';
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
  sb.auth.onAuthStateChange(() => setNavBySession());

  if (signoutBtn){
    signoutBtn.addEventListener('click', async () => {
      await sb.auth.signOut();
      // Return to home on signout when on profile page
      if (location.pathname.toLowerCase().endsWith('profile.html')) location.href = 'index.html';
    });
  }

  if (loginForm){
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginMsg.textContent = '';
      const fd = new FormData(loginForm);
      const email = String(fd.get('email')||'').trim();
      const password = String(fd.get('password')||'');
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error){
        loginMsg.textContent = 'Hapa takiuru. Mēnā kāore anō koe kia rēhita, tīpakohia te Rēhita.';
        // Auto-switch to register with prefill if likely not registered
        if (registerForm){
          const emailInput = registerForm.querySelector('input[name=\"email\"]');
          if (emailInput) emailInput.value = email;
          switchTab('register');
        }
        return;
      }
      hideModal();
      // Go to profile
      location.href = 'profile.html';
    });
  }

  if (registerForm){
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
