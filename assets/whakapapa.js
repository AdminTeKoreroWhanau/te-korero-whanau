// Whakapapa (family tree) drag-and-drop builder
// Admin arranges nodes via drag-and-drop; positions persist to Supabase.
// All users can view the shared tree. Clicking a node opens that member's profile.
(function(){
  const hasVis = !!window.vis;
  const container = document.getElementById('whakapapa-tree');
  const msg = document.getElementById('whakapapa-msg');
  if (!container || !hasVis) { if (msg) msg.textContent = 'Network library failed to load.'; return; }

  const fitBtn = document.getElementById('fit');
  const saveBtn = document.getElementById('save-layout');
  const saveMsg = document.getElementById('save-msg');
  const adminHint = document.getElementById('whakapapa-admin-hint');
  const adminForms = document.getElementById('whakapapa-admin-forms');

  const personForm = document.getElementById('person-form');
  const personMsg = document.getElementById('person-msg');
  const relForm = document.getElementById('rel-form');
  const relMsg = document.getElementById('rel-msg');

  // Supabase client (set by auth.js)
  const sb = window.sb || null;

  let isAdminUser = false;
  let positions = {};
  let profiles = [];
  let profileMap = new Map();
  let peopleIds = [];
  let relations = [];

  // --- Helpers ---
  function avatarOf(p){ return p.avatar_url || p.photo_url || p.image_url || p.avatar || null; }
  function displayName(p){ return p.full_name || p.name || p.email || '—'; }
  function avatarPlaceholder(name){
    const seed = encodeURIComponent(String(name||'—'));
    return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundType=gradientLinear`;
  }

  function toNode(p){
    const name = displayName(p);
    const img = avatarOf(p) || avatarPlaceholder(name);
    const node = {
      id: p.id,
      label: name,
      title: name + '\nPāwhiria ki te tiro kōtaha / Click to view profile',
      shape: 'circularImage',
      image: img,
      borderWidth: 2,
      size: 40
    };
    if (positions[p.id]) {
      node.x = positions[p.id].x;
      node.y = positions[p.id].y;
      node.fixed = { x: true, y: true };
    }
    return node;
  }

  function toEdge(r){
    if (r.type === 'parent' || r.type === 'mother' || r.type === 'father'){
      return { from: r.from_id, to: r.to_id, arrows: 'to', label: r.type, color: { color: '#6ec5be' }, width: 2 };
    }
    if (r.type === 'spouse' || r.type === 'partner'){
      return { from: r.from_id, to: r.to_id, dashes: true, label: r.type, color: { color: '#c58f6e' }, width: 2 };
    }
    return { from: r.from_id, to: r.to_id, label: r.type || '', color: { color: '#9aa3a7' }, width: 2 };
  }

  // --- Network setup (free-form layout) ---
  const opts = {
    layout: { randomSeed: 42 },
    physics: {
      enabled: true,
      stabilization: { iterations: 200 },
      barnesHut: { gravitationalConstant: -3000, springLength: 200, springConstant: 0.04 }
    },
    interaction: {
      dragNodes: false,
      dragView: true,
      zoomView: true,
      hover: true,
      tooltipDelay: 200
    },
    nodes: {
      color: { background: '#12181a', border: '#1e2629' },
      font: { color: '#eef2f3', size: 14, face: 'arial', strokeWidth: 1, strokeColor: '#000000' },
      borderWidth: 2,
      shapeProperties: { useBorderWithImage: true }
    },
    edges: {
      smooth: { type: 'cubicBezier' },
      font: { color: '#a7b1b5', size: 12 }
    }
  };

  let allNodes = new vis.DataSet([]);
  let allEdges = new vis.DataSet([]);
  let network = new vis.Network(container, { nodes: allNodes, edges: allEdges }, opts);

  // --- Theme adaptation ---
  function getCSSVar(name, fallback=''){
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }
  function currentTheme(){ return document.documentElement.getAttribute('data-theme') || 'dark'; }
  function applyThemeToNetwork(){
    const theme = currentTheme();
    const fg = getCSSVar('--fg', theme === 'light' ? '#0a0e10' : '#eef2f3');
    const muted = getCSSVar('--muted', theme === 'light' ? '#485256' : '#a7b1b5');
    const panel = getCSSVar('--panel', theme === 'light' ? '#ffffff' : '#12181a');
    const border = getCSSVar('--border', theme === 'light' ? '#d8e1e5' : '#1e2629');
    const strokeColor = theme === 'light' ? '#ffffff' : '#000000';
    network.setOptions({
      nodes: {
        color: { background: panel, border },
        font: { color: fg, size: 14, face: 'arial', strokeWidth: 1, strokeColor },
        borderWidth: 2,
        shapeProperties: { useBorderWithImage: true }
      },
      edges: { font: { color: muted } }
    });
  }
  const themeObserver = new MutationObserver(() => applyThemeToNetwork());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // --- Auth helpers ---
  async function currentUserId(){
    if (!sb) return null;
    try { const { data } = await sb.auth.getSession(); return data.session?.user?.id || null; } catch { return null; }
  }

  async function checkIsAdmin(){
    if (!sb) return false;
    try {
      const { data } = await sb.auth.getSession();
      const user = data.session?.user;
      if (!user) return false;
      const emails = (window.ADMIN_EMAILS || []).map(e => String(e||'').toLowerCase());
      if (user.email && emails.includes(String(user.email).toLowerCase())) return true;
      const { data: row } = await sb.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
      return !!(row && row.user_id);
    } catch { return false; }
  }

  // --- Position persistence ---
  async function loadPositions(){
    if (!sb){
      try { return JSON.parse(localStorage.getItem('whakapapa.positions.v1') || '{}'); } catch { return {}; }
    }
    try {
      const { data, error } = await sb.from('whakapapa_positions').select('profile_id, pos_x, pos_y');
      if (error){ console.warn('Positions table not available, using defaults.', error); return {}; }
      const map = {};
      (data || []).forEach(p => { map[p.profile_id] = { x: p.pos_x, y: p.pos_y }; });
      return map;
    } catch { return {}; }
  }

  async function saveAllPositions(){
    const nodePositions = network.getPositions();
    if (!sb){
      try { localStorage.setItem('whakapapa.positions.v1', JSON.stringify(nodePositions)); } catch {}
      if (saveMsg) saveMsg.textContent = 'Kua tiakina (local) / Saved locally.';
      setTimeout(() => { if (saveMsg) saveMsg.textContent = ''; }, 3000);
      return;
    }
    try {
      const records = Object.entries(nodePositions).map(([id, pos]) => ({
        profile_id: id,
        pos_x: Math.round(pos.x),
        pos_y: Math.round(pos.y),
        updated_at: new Date().toISOString()
      }));
      for (const rec of records){
        const { error } = await sb.from('whakapapa_positions').upsert(rec, { onConflict: 'profile_id' });
        if (error) throw error;
      }
      if (saveMsg) saveMsg.textContent = 'Kua tiakina / Layout saved!';
      setTimeout(() => { if (saveMsg) saveMsg.textContent = ''; }, 3000);
    } catch (err){
      console.error('Failed to save positions:', err);
      if (saveMsg) saveMsg.textContent = 'Hapa tiaki / Failed to save layout.';
    }
  }

  // --- Populate form selects (admin only) ---
  function populatePersonSelect(){
    const selP = document.getElementById('person-select');
    const btn = document.getElementById('person-add-btn');
    if (!selP) return;
    selP.innerHTML = '';
    if (!sb){ selP.disabled = true; if (btn) btn.disabled = true; return; }
    const notAdded = profiles.filter(p => !peopleIds.includes(p.id));
    if (!profiles.length){
      const opt = document.createElement('option'); opt.value=''; opt.textContent='No profiles available'; selP.appendChild(opt);
      selP.disabled = true; if (btn) btn.disabled = true; return;
    }
    for (const p of notAdded){
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = displayName(p);
      selP.appendChild(opt);
    }
    if (!notAdded.length){
      const opt = document.createElement('option'); opt.value=''; opt.textContent='All profiles already added'; selP.appendChild(opt);
    }
    const has = notAdded.length > 0;
    selP.disabled = !has; if (btn) btn.disabled = !has;
  }

  function populateRelSelects(){
    const a = document.getElementById('rel-a');
    const b = document.getElementById('rel-b');
    if (!a || !b) return;
    const people = peopleIds.map(id => profileMap.get(id)).filter(Boolean);
    const add = (el) => {
      el.innerHTML = '';
      people.forEach(p => { const opt = document.createElement('option'); opt.value = p.id; opt.textContent = displayName(p); el.appendChild(opt); });
    };
    add(a); add(b);
  }

  // --- Interaction events ---

  // Click node → open profile
  network.on('click', function(params){
    if (params.nodes.length > 0){
      const nodeId = params.nodes[0];
      window.location.href = 'profile.html?id=' + encodeURIComponent(nodeId);
    }
  });

  // Cursor styling
  network.on('hoverNode', function(){ container.style.cursor = 'pointer'; });
  network.on('blurNode', function(){ container.style.cursor = isAdminUser ? 'grab' : 'default'; });
  network.on('dragStart', function(){ if (isAdminUser) container.style.cursor = 'grabbing'; });
  network.on('dragEnd', function(){ if (isAdminUser) container.style.cursor = 'grab'; });

  // Buttons
  fitBtn && fitBtn.addEventListener('click', () => network.fit({ animation: true }));
  saveBtn && saveBtn.addEventListener('click', saveAllPositions);

  // Default position for newly added nodes
  function getNewNodePosition(){
    const viewPos = network.getViewPosition();
    const offset = 80 + Math.random() * 120;
    const angle = Math.random() * 2 * Math.PI;
    return { x: viewPos.x + Math.cos(angle) * offset, y: viewPos.y + Math.sin(angle) * offset };
  }

  // --- Bootstrap ---
  async function bootstrap(){
    container.setAttribute('aria-busy','true');
    try {
      isAdminUser = await checkIsAdmin();
      positions = await loadPositions();

      // Load all profiles
      if (sb){
        const { data: profs, error } = await sb.from('profiles').select('id, full_name, avatar_url');
        if (error){
          profiles = [];
          if (msg) msg.textContent = 'Kāore e taea te tiki kōtaha / Cannot load profiles.';
        } else {
          profiles = Array.isArray(profs) ? profs : [];
        }
        // Fallback: include current user if table is empty
        if (!profiles.length){
          try {
            const { data: sess } = await sb.auth.getSession();
            const u = sess?.session?.user;
            if (u){
              const full_name = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || u.email || '—';
              const avatar_url = (u.user_metadata && (u.user_metadata.avatar_url || u.user_metadata.picture)) || null;
              profiles = [{ id: u.id, full_name, avatar_url }];
            }
          } catch {}
        }
      } else {
        profiles = [];
      }
      profileMap = new Map(profiles.map(p => [p.id, p]));

      // Load people and relations (shared tree — all entries, deduplicated)
      if (sb){
        const { data: people } = await sb.from('whakapapa_people').select('profile_id');
        peopleIds = [...new Set((people || []).map(r => r.profile_id).filter(Boolean))];

        const { data: rels } = await sb.from('whakapapa_relations').select('from_id, to_id, type');
        const relSet = new Set();
        relations = (rels || []).filter(r => {
          const key = r.from_id + '-' + r.to_id + '-' + r.type;
          if (relSet.has(key)) return false;
          relSet.add(key);
          return true;
        });
      } else {
        peopleIds = [];
        relations = [];
      }

      // Build graph
      const nodes = peopleIds.map(id => profileMap.get(id)).filter(Boolean).map(p => toNode(p));
      allNodes = new vis.DataSet(nodes);
      allEdges = new vis.DataSet(relations.map(toEdge));
      network.setData({ nodes: allNodes, edges: allEdges });
      applyThemeToNetwork();

      // If all nodes have saved positions, skip physics entirely
      const allHavePositions = nodes.length > 0 && nodes.every(n => positions[n.id]);
      if (allHavePositions){
        network.setOptions({ physics: { enabled: false } });
      }

      // After physics stabilizes, freeze and allow admin dragging
      network.once('stabilized', function(){
        network.setOptions({ physics: { enabled: false } });
        if (isAdminUser){
          allNodes.forEach(n => { allNodes.update({ id: n.id, fixed: false }); });
        }
      });

      // Enable admin mode UI
      if (isAdminUser){
        network.setOptions({ interaction: { dragNodes: true } });
        if (saveBtn) saveBtn.style.display = '';
        if (adminHint) adminHint.style.display = '';
        if (adminForms) adminForms.style.display = '';
        container.style.cursor = 'grab';
        container.classList.add('admin-mode');

        // Unfix nodes immediately if all positions loaded (physics already off)
        if (allHavePositions){
          allNodes.forEach(n => { allNodes.update({ id: n.id, fixed: false }); });
        }

        populatePersonSelect();
        populateRelSelects();
      }

      // Status messages
      if (!peopleIds.length){
        if (msg) msg.textContent = isAdminUser
          ? 'Tāpirihia ngā kōtaha ki te rākau. / Add profiles to the tree below.'
          : 'Kāore anō he tāngata i te rākau. / No members in the tree yet.';
      } else {
        if (msg) msg.textContent = '';
      }

      network.fit({ animation: true });
    } catch (e){
      console.error(e);
      if (msg) msg.textContent = 'Kāore i taea te uta te rākau whakapapa / Unable to load family tree.';
    } finally {
      container.setAttribute('aria-busy','false');
    }
  }

  // --- Add person (admin only) ---
  personForm && personForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (personMsg) personMsg.textContent = '';
    if (!isAdminUser) return;
    try {
      const userId = await currentUserId();
      if (!userId){ if (personMsg) personMsg.textContent = 'Takiuru hei tiaki / Login to save.'; return; }
      const profile_id = String(document.getElementById('person-select').value||'').trim();
      if (!profile_id){ if (personMsg) personMsg.textContent = 'Kōwhiria tētahi kōtaha / Select a profile.'; return; }
      if (peopleIds.includes(profile_id)){ if (personMsg) personMsg.textContent = 'Kua tāpirihia kē / Already added.'; return; }

      if (sb){
        const { error } = await sb.from('whakapapa_people').insert([{ user_id: userId, profile_id }]);
        if (error) throw error;
      }
      peopleIds.push(profile_id);
      const prof = profileMap.get(profile_id);
      if (prof){
        const pos = getNewNodePosition();
        const node = toNode(prof);
        node.x = pos.x;
        node.y = pos.y;
        allNodes.add(node);
      }
      populatePersonSelect();
      populateRelSelects();
      if (personMsg) personMsg.textContent = 'Kua tāpirihia / Added. Drag them into position then save.';
      if (msg) msg.textContent = '';
    } catch (err){
      if (personMsg) personMsg.textContent = 'Hapa tāpiri / Failed to add person.';
    }
  });

  // --- Add relation (admin only) ---
  relForm && relForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (relMsg) relMsg.textContent = '';
    if (!isAdminUser) return;
    const from_id = document.getElementById('rel-a').value;
    const to_id = document.getElementById('rel-b').value;
    const type = document.getElementById('rel-type').value;
    if (!from_id || !to_id || !type){ if (relMsg) relMsg.textContent = 'Kōwhiria te tāngata me te momo hononga / Select people and relation type.'; return; }
    if (from_id === to_id){ if (relMsg) relMsg.textContent = 'Kāore e tika / Cannot relate a person to themselves.'; return; }
    try {
      const userId = await currentUserId();
      if (!userId){ if (relMsg) relMsg.textContent = 'Takiuru hei tiaki / Login to save.'; return; }
      const rel = { from_id, to_id, type };
      if (sb){
        const { error } = await sb.from('whakapapa_relations').insert([{ ...rel, user_id: userId }]);
        if (error) throw error;
      }
      relations.push(rel);
      allEdges.add(toEdge(rel));
      if (relMsg) relMsg.textContent = 'Kua tāpirihia / Relationship added.';
    } catch (err){
      if (relMsg) relMsg.textContent = 'Hapa tāpiri / Failed to add relation.';
    }
  });

  bootstrap();
})();
