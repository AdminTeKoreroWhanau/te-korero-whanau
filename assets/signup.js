// Signup page logic: registration + profile + whānau join in one step
(function(){
  const form = document.getElementById('signup-form');
  if (!form) return; // not on signup page

  const sb = window.sb;
  if (!sb) { console.error('Supabase not configured'); return; }

  const esc = (s) => (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const msgEl = document.getElementById('signup-msg');
  const setMsg = (txt, isError) => {
    if (!msgEl) return;
    msgEl.textContent = txt;
    msgEl.style.color = isError ? 'var(--danger, red)' : '';
  };

  // If already logged in, redirect
  (async function(){
    const { data: sess } = await sb.auth.getSession();
    if (sess.session?.user) { location.href = 'index.html'; }
  })();

  // ─── Whānau list (load anonymously via anon key) ───
  const listEl = document.getElementById('whanau-list');
  const searchEl = document.getElementById('whanau-search');
  const selectedIdEl = document.getElementById('selected-whanau-id');
  const selectedNameEl = document.getElementById('selected-whanau-name');
  const joinSection = document.getElementById('join-section');
  const createSection = document.getElementById('create-section');
  let allWhanau = [];

  // Toggle join vs create
  const radios = form.querySelectorAll('input[name="whanau_choice"]');
  radios.forEach(r => r.addEventListener('change', () => {
    const isJoin = form.querySelector('input[name="whanau_choice"]:checked').value === 'join';
    joinSection.style.display = isJoin ? '' : 'none';
    createSection.style.display = isJoin ? 'none' : '';
  }));

  async function loadWhanauList(){
    if (!listEl) return;
    listEl.innerHTML = '<p class="muted small">Loading…</p>';
    const { data, error } = await sb.from('whanau')
      .select('id, name, description, whanau_members(user_id)')
      .order('created_at', { ascending: false });
    if (error) { listEl.innerHTML = '<p class="muted small">Could not load whānau.</p>'; return; }
    allWhanau = (data || []).map(w => ({
      id: w.id,
      name: w.name,
      description: w.description,
      memberCount: (w.whanau_members || []).length
    }));
    renderList('');
    // Auto-select the first whānau if any
    if (allWhanau.length && selectedIdEl) {
      selectWhanau(allWhanau[0].id, allWhanau[0].name);
    }
  }

  function renderList(q){
    const filtered = allWhanau.filter(w => {
      if (!q) return true;
      return (w.name + ' ' + (w.description || '')).toLowerCase().includes(q);
    });
    if (!filtered.length){
      listEl.innerHTML = '<p class="muted small">Kāore he whānau i kitea. / No whānau found.</p>';
      return;
    }
    listEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const w of filtered){
      const row = document.createElement('div');
      const isSelected = selectedIdEl && selectedIdEl.value === w.id;
      row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:.4rem .25rem; border-bottom:1px solid var(--border); cursor:pointer;' + (isSelected ? 'background:var(--accent-low, rgba(0,196,179,0.1));' : '');
      row.innerHTML = `<div><strong>${esc(w.name)}</strong>${w.description ? ' <span class="small muted">— ' + esc(w.description) + '</span>' : ''}<br><span class="small muted">${w.memberCount} member${w.memberCount !== 1 ? 's' : ''}</span></div>`;
      row.addEventListener('click', () => selectWhanau(w.id, w.name));
      frag.appendChild(row);
    }
    listEl.appendChild(frag);
  }

  function selectWhanau(id, name){
    if (selectedIdEl) selectedIdEl.value = id;
    if (selectedNameEl) selectedNameEl.innerHTML = `Selected: <strong>${esc(name)}</strong>`;
    renderList(searchEl ? searchEl.value.trim().toLowerCase() : '');
  }

  if (searchEl) searchEl.addEventListener('input', () => renderList(searchEl.value.trim().toLowerCase()));

  // Load whānau on page load
  loadWhanauList();

  // ─── Form submission ───
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('Creating your account…');

    const full_name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    if (!full_name || !email || !password) { setMsg('Please fill in all required fields.', true); return; }

    // Gather DOB, marital status, location
    const dob = (document.getElementById('signup-dob')?.value || '').trim();
    const maritalStatus = (document.getElementById('signup-marital')?.value || '').trim();
    const location = (document.getElementById('signup-location')?.value || '').trim();

    // Gather pepeha
    const pepeha = {};
    ['maunga','awa','iwi','hapu','waka','marae'].forEach(k => {
      const v = (document.getElementById('signup-' + k)?.value || '').trim();
      if (v) pepeha[k] = v;
    });

    // Determine whānau choice
    const choice = form.querySelector('input[name="whanau_choice"]:checked').value;
    let joinWhanauId = null;
    let newWhanauName = null;
    let newWhanauDesc = null;

    if (choice === 'join') {
      joinWhanauId = selectedIdEl ? selectedIdEl.value : null;
      if (!joinWhanauId) { setMsg('Please select a whānau to join.', true); return; }
    } else {
      newWhanauName = document.getElementById('new-whanau-name').value.trim();
      if (!newWhanauName) { setMsg('Please enter a name for your new whānau.', true); return; }
      newWhanauDesc = document.getElementById('new-whanau-desc').value.trim() || null;
    }

    // 1. Create the account
    const metadata = { full_name };
    if (dob) metadata.date_of_birth = dob;
    if (maritalStatus) metadata.marital_status = maritalStatus;
    if (location) metadata.location = location;
    if (Object.keys(pepeha).length) metadata.pepeha = pepeha;

    const { data: signUpData, error: signUpErr } = await sb.auth.signUp({
      email,
      password,
      options: { data: metadata }
    });

    if (signUpErr) { setMsg('Hapa rēhita: ' + (signUpErr.message || 'Unknown error'), true); return; }

    // Check if we got a session (no email confirmation required)
    if (!signUpData.session) {
      setMsg('Kua tonoa he īmēra whakapūmau. Tirohia tō pouaka īmēra, kātahi takiuru mai. / Check your email to confirm, then log in.');
      // Store whānau choice for after email confirmation + first login
      try {
        localStorage.setItem('pendingWhanau', JSON.stringify({ choice, joinWhanauId, newWhanauName, newWhanauDesc }));
      } catch(_){}
      return;
    }

    // 2. We have a session — sync profile fields, join or create whānau
    setMsg('Account created! Joining whānau…');
    const user = signUpData.session.user;

    // Sync DOB and marital status to profiles table
    try {
      const profileSync = {};
      if (dob) profileSync.date_of_birth = dob;
      if (maritalStatus) profileSync.marital_status = maritalStatus;
      if (Object.keys(profileSync).length) {
        await sb.from('profiles').update(profileSync).eq('id', user.id);
      }
    } catch(_){}  // non-fatal

    try {
      if (choice === 'join') {
        await sb.from('whanau_members').insert([{
          whanau_id: joinWhanauId,
          user_id: user.id,
          role: 'member'
        }]);
      } else {
        // Create new whānau
        const { data: newW, error: wErr } = await sb.from('whanau').insert([{
          name: newWhanauName,
          description: newWhanauDesc,
          created_by: user.id
        }]).select('id').single();
        if (wErr) throw wErr;
        // Join as admin
        await sb.from('whanau_members').insert([{
          whanau_id: newW.id,
          user_id: user.id,
          role: 'admin'
        }]);
      }
    } catch(err) {
      console.error('Whānau join error:', err);
      // Non-fatal — they can join from whanau-join.html later
    }

    // 3. Redirect to dashboard
    setMsg('Kua oti! Redirecting…');
    location.href = 'index.html';
  });

  // ─── Handle pending whānau choice after email confirmation ───
  // This runs on first login if they had to confirm email during signup
  (async function applyPendingWhanau(){
    try {
      const raw = localStorage.getItem('pendingWhanau');
      if (!raw) return;
      const { data: sess } = await sb.auth.getSession();
      const user = sess.session?.user;
      if (!user) return;

      // Check if they already have a whānau
      const { data: existing } = await sb.from('whanau_members').select('whanau_id').eq('user_id', user.id).limit(1).maybeSingle();
      if (existing) { localStorage.removeItem('pendingWhanau'); return; }

      const pending = JSON.parse(raw);
      if (pending.choice === 'join' && pending.joinWhanauId) {
        await sb.from('whanau_members').insert([{ whanau_id: pending.joinWhanauId, user_id: user.id, role: 'member' }]);
      } else if (pending.choice === 'create' && pending.newWhanauName) {
        const { data: newW } = await sb.from('whanau').insert([{
          name: pending.newWhanauName,
          description: pending.newWhanauDesc,
          created_by: user.id
        }]).select('id').single();
        if (newW) {
          await sb.from('whanau_members').insert([{ whanau_id: newW.id, user_id: user.id, role: 'admin' }]);
        }
      }
      localStorage.removeItem('pendingWhanau');
    } catch(_){}
  })();
})();
