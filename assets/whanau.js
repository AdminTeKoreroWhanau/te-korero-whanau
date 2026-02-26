// Whānau group helpers + join-page logic
(function(){
  const sb = window.sb;
  if (!sb) return;

  const esc = (s) => (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));

  // ─── Shared helper: get current user's whānau id (cached per session) ───
  let _cachedWhanauId = undefined; // undefined = not fetched, null = no whānau
  let _cachedWhanauName = undefined;

  async function fetchMyWhanau(){
    if (_cachedWhanauId !== undefined) return { id: _cachedWhanauId, name: _cachedWhanauName };
    const { data: sess } = await sb.auth.getSession();
    const user = sess.session?.user;
    if (!user) { _cachedWhanauId = null; _cachedWhanauName = null; return { id: null, name: null }; }
    const { data, error } = await sb.from('whanau_members')
      .select('whanau_id, whanau:whanau_id(name)')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (error || !data) { _cachedWhanauId = null; _cachedWhanauName = null; return { id: null, name: null }; }
    _cachedWhanauId = data.whanau_id;
    _cachedWhanauName = data.whanau?.name || null;
    return { id: _cachedWhanauId, name: _cachedWhanauName };
  }

  // Exposed globally so other scripts can use it
  window.getMyWhanauId = async function(){
    const w = await fetchMyWhanau();
    return w.id;
  };
  window.getMyWhanauName = async function(){
    const w = await fetchMyWhanau();
    return w.name;
  };
  // Reset cache (called after joining/creating)
  function resetCache(){ _cachedWhanauId = undefined; _cachedWhanauName = undefined; }

  // ─── Join page logic (only runs on whanau-join.html) ───
  const listEl = document.getElementById('whanau-list');
  const createForm = document.getElementById('create-whanau-form');
  if (!listEl && !createForm) return; // not on join page

  // If user already has a whānau, redirect to dashboard
  (async function checkExisting(){
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session?.user) return; // not logged in, auth.js will handle
    const wid = await window.getMyWhanauId();
    if (wid) { location.href = 'index.html'; return; }
    loadWhanauList();
  })();

  let allWhanau = [];

  async function loadWhanauList(){
    listEl.innerHTML = '<p class="muted small">Loading…</p>';
    // Fetch whānau with member counts
    const { data, error } = await sb.from('whanau')
      .select('id, name, description, created_at, whanau_members(user_id)')
      .order('created_at', { ascending: false });
    if (error) { listEl.innerHTML = '<p class="muted small">Hapa: Could not load whānau.</p>'; console.error(error); return; }
    allWhanau = (data || []).map(w => ({
      id: w.id,
      name: w.name,
      description: w.description,
      memberCount: (w.whanau_members || []).length
    }));
    renderList('');
  }

  function renderList(q){
    const filtered = allWhanau.filter(w => {
      if (!q) return true;
      return (w.name + ' ' + (w.description || '')).toLowerCase().includes(q);
    });
    if (!filtered.length){
      listEl.innerHTML = '<p class="muted small">Kāore he whānau i kitea. Waihangahia tētahi hou! / No whānau found. Create one above!</p>';
      return;
    }
    listEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const w of filtered){
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:.5rem 0; border-bottom:1px solid var(--border);';
      const info = document.createElement('div');
      info.innerHTML = `<strong>${esc(w.name)}</strong>${w.description ? '<br><span class="small muted">' + esc(w.description) + '</span>' : ''}<br><span class="small muted">${w.memberCount} member${w.memberCount !== 1 ? 's' : ''}</span>`;
      const btn = document.createElement('button');
      btn.className = 'btn outline';
      btn.textContent = 'Hono / Join';
      btn.style.cssText = 'white-space:nowrap; margin-left:.5rem;';
      btn.addEventListener('click', () => joinWhanau(w.id, w.name));
      row.appendChild(info);
      row.appendChild(btn);
      frag.appendChild(row);
    }
    listEl.appendChild(frag);
  }

  const searchEl = document.getElementById('whanau-search');
  if (searchEl) searchEl.addEventListener('input', () => renderList(searchEl.value.trim().toLowerCase()));

  async function joinWhanau(whanauId, whanauName){
    const joinMsg = document.getElementById('join-msg');
    const { data: sess } = await sb.auth.getSession();
    const user = sess.session?.user;
    if (!user) { if (joinMsg) joinMsg.textContent = 'Please log in first.'; return; }
    const { error } = await sb.from('whanau_members').insert([{
      whanau_id: whanauId,
      user_id: user.id,
      role: 'member'
    }]);
    if (error) {
      if (joinMsg) joinMsg.textContent = 'Hapa: ' + (error.message || 'Could not join.');
      console.error(error);
      return;
    }
    resetCache();
    if (joinMsg) joinMsg.textContent = 'Kua hono! Redirecting…';
    location.href = 'index.html';
  }

  // Create new whānau
  const createMsg = document.getElementById('create-msg');
  if (createForm) createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('whanau-name').value.trim();
    const desc = document.getElementById('whanau-desc').value.trim();
    if (!name) return;
    const { data: sess } = await sb.auth.getSession();
    const user = sess.session?.user;
    if (!user) { if (createMsg) createMsg.textContent = 'Please log in first.'; return; }

    // Insert the whānau group
    const { data: newW, error: wErr } = await sb.from('whanau').insert([{
      name,
      description: desc || null,
      created_by: user.id
    }]).select('id').single();
    if (wErr || !newW) {
      if (createMsg) createMsg.textContent = 'Hapa: ' + (wErr?.message || 'Could not create.');
      console.error(wErr);
      return;
    }

    // Add creator as admin member
    const { error: mErr } = await sb.from('whanau_members').insert([{
      whanau_id: newW.id,
      user_id: user.id,
      role: 'admin'
    }]);
    if (mErr) {
      if (createMsg) createMsg.textContent = 'Created but could not join: ' + (mErr.message || '');
      console.error(mErr);
      return;
    }

    resetCache();
    if (createMsg) createMsg.textContent = 'Kua waihangahia! Redirecting…';
    location.href = 'index.html';
  });
})();
