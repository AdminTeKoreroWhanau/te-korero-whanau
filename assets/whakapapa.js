// Whakapapa (family tree) drag-and-drop builder
// Drag a member node onto another to link them. Double-click a link to edit/remove.
// Right sidebar: unplaced members, stats. All changes auto-save.
(function(){
  const hasVis = !!window.vis;
  const container = document.getElementById('whakapapa-tree');
  const msg = document.getElementById('whakapapa-msg');
  if (!container || !hasVis) { if (msg) msg.textContent = 'Network library failed to load.'; return; }

  const fitBtn = document.getElementById('fit');
  const sidebarRight = document.getElementById('whakapapa-sidebar-right');
  const personMsg = document.getElementById('person-msg');

  // Stats elements
  const statOnTree = document.getElementById('stat-on-tree');
  const statUnplaced = document.getElementById('stat-unplaced');
  const statRelations = document.getElementById('stat-relations');
  const unplacedListEl = document.getElementById('unplaced-list');

  // Supabase client (set by auth.js)
  const sb = window.sb || null;

  let isFamilyMember = false;
  let positions = {};
  let profiles = [];
  let profileMap = new Map();
  let peopleIds = [];
  let relations = [];

  // Current appearance settings
  let treeSettings = {
    direction: 'free',
    edgeStyle: 'continuous',
    nodeSize: 40,
    edgeColor: '#6ec5be',
    spouseColor: '#c58f6e',
    showLabels: true,
    physics: false,
    snapToGrid: true,
    gridSize: 120
  };

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
      size: treeSettings.nodeSize
    };
    if (positions[p.id]) {
      node.x = positions[p.id].x;
      node.y = positions[p.id].y;
      node.fixed = { x: true, y: true };
    }
    return node;
  }

  function toEdge(r){
    const showLabel = treeSettings.showLabels;
    const id = r.from_id + '__' + r.to_id + '__' + r.type;
    if (r.type === 'parent' || r.type === 'mother' || r.type === 'father' || r.type === 'grandparent'){
      return { id, from: r.from_id, to: r.to_id, arrows: 'to', label: showLabel ? r.type : '', color: { color: treeSettings.edgeColor }, width: 2 };
    }
    if (r.type === 'spouse' || r.type === 'partner'){
      return { id, from: r.from_id, to: r.to_id, dashes: true, label: showLabel ? r.type : '', color: { color: treeSettings.spouseColor }, width: 2 };
    }
    if (r.type === 'uncle_aunt'){
      return { id, from: r.from_id, to: r.to_id, arrows: 'to', label: showLabel ? 'uncle/aunt' : '', color: { color: treeSettings.edgeColor }, width: 2 };
    }
    if (r.type === 'cousin'){
      return { id, from: r.from_id, to: r.to_id, label: showLabel ? 'cousin' : '', color: { color: '#9aa3a7' }, width: 2 };
    }
    return { id, from: r.from_id, to: r.to_id, label: showLabel ? (r.type || '') : '', color: { color: '#9aa3a7' }, width: 2 };
  }

  // --- Build vis.js options from treeSettings ---
  function buildNetworkOptions(){
    const base = {
      physics: {
        enabled: treeSettings.physics,
        stabilization: { iterations: 200 },
        barnesHut: { gravitationalConstant: -3000, springLength: 200, springConstant: 0.04 }
      },
      interaction: {
        dragNodes: true,
        dragView: true,
        zoomView: true,
        hover: true,
        tooltipDelay: 200
      },
      nodes: {
        color: { background: '#12181a', border: '#1e2629' },
        font: { color: '#eef2f3', size: 14, face: 'arial', strokeWidth: 1, strokeColor: '#000000' },
        borderWidth: 2,
        shapeProperties: { useBorderWithImage: true },
        size: treeSettings.nodeSize
      },
      edges: {
        smooth: false,
        font: { color: '#eef2f3', size: 14, face: 'arial', background: 'rgba(18,24,26,0.85)', strokeWidth: 2, strokeColor: '#000000' }
      }
    };
    if (treeSettings.direction === 'free'){
      base.layout = { randomSeed: 42 };
    } else {
      base.layout = {
        hierarchical: {
          enabled: true,
          direction: treeSettings.direction,
          sortMethod: 'directed',
          levelSeparation: 150,
          nodeSpacing: 120
        }
      };
    }
    return base;
  }

  // --- Network setup ---
  let opts = buildNetworkOptions();
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
    const edgeBg = theme === 'light' ? 'rgba(255,255,255,0.85)' : 'rgba(18,24,26,0.85)';
    network.setOptions({
      nodes: {
        color: { background: panel, border },
        font: { color: fg, size: 14, face: 'arial', strokeWidth: 1, strokeColor },
        borderWidth: 2,
        shapeProperties: { useBorderWithImage: true }
      },
      edges: { font: { color: fg, size: 14, face: 'arial', background: edgeBg, strokeWidth: 2, strokeColor } }
    });
  }
  const themeObserver = new MutationObserver(() => applyThemeToNetwork());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // --- Auth helpers ---
  async function currentUserId(){
    if (!sb) return null;
    try { const { data } = await sb.auth.getSession(); return data.session?.user?.id || null; } catch { return null; }
  }

  async function checkIsFamilyMember(){
    if (!sb) return false;
    try {
      const { data } = await sb.auth.getSession();
      const user = data.session?.user;
      if (!user) return false;
      const emails = (window.ADMIN_EMAILS || []).map(e => String(e||'').toLowerCase());
      if (user.email && emails.includes(String(user.email).toLowerCase())) return true;
      const { data: row } = await sb.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
      if (row && row.user_id) return true;
      // Any whānau member can edit
      if (typeof window.getMyWhanauId === 'function'){
        const wid = await window.getMyWhanauId();
        if (wid) return true;
      }
      return !!user.id;
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
    } catch (err){
      console.error('Failed to save positions:', err);
    }
  }


  // --- Right sidebar: unplaced members ---
  function renderUnplacedMembers(){
    if (!unplacedListEl) return;
    const unplaced = profiles.filter(p => !peopleIds.includes(p.id));
    if (statOnTree) statOnTree.textContent = peopleIds.length;
    if (statUnplaced) statUnplaced.textContent = unplaced.length;
    if (statRelations) statRelations.textContent = relations.length;

    if (!unplaced.length){
      unplacedListEl.innerHTML = '<p class="small muted">Kua whakaritea katoa / All members are on the tree! \ud83c\udf89</p>';
      return;
    }
    unplacedListEl.innerHTML = '';
    for (const p of unplaced){
      const item = document.createElement('div');
      item.className = 'unplaced-member-item';
      item.setAttribute('data-id', p.id);
      const img = avatarOf(p) || avatarPlaceholder(displayName(p));
      item.innerHTML =
        '<img src="' + img + '" alt="" class="unplaced-avatar" onerror="this.src=\'' + avatarPlaceholder(displayName(p)) + '\'"/>' +
        '<div class="unplaced-info"><strong>' + displayName(p) + '</strong></div>' +
        '<button class="btn outline unplaced-add-btn" type="button" title="Add to tree">+</button>';
      item.querySelector('.unplaced-add-btn').addEventListener('click', async () => {
        await addPersonToTree(p.id);
      });
      unplacedListEl.appendChild(item);
    }
  }

  // --- Add person to tree (shared logic) ---
  async function addPersonToTree(profile_id){
    if (personMsg) personMsg.textContent = '';
    try {
      const userId = await currentUserId();
      if (!userId){ if (personMsg) personMsg.textContent = 'Takiuru hei tiaki / Login to save.'; return; }
      if (peopleIds.includes(profile_id)){ if (personMsg) personMsg.textContent = 'Kua tāpirihia kē / Already added.'; return; }

      if (sb){
        const whanau_id = (typeof window.getMyWhanauId === 'function') ? await window.getMyWhanauId() : null;
        const { error } = await sb.from('whakapapa_people').insert([{ user_id: userId, profile_id, whanau_id }]);
        if (error) throw error;
      }
      peopleIds.push(profile_id);
      const prof = profileMap.get(profile_id);
      if (prof){
        const pos = getNewNodePosition();
        const node = toNode(prof);
        node.x = pos.x;
        node.y = pos.y;
        node.fixed = false;
        allNodes.add(node);
      }
      renderUnplacedMembers();
      autoSavePositions();
      if (personMsg) personMsg.textContent = 'Kua tāpirihia / Added!';
      if (msg) msg.textContent = '';
    } catch (err){
      console.error(err);
      if (personMsg) personMsg.textContent = 'Hapa tāpiri / Failed to add person.';
    }
  }

  // --- Grid snap helpers ---
  function snapToGrid(val){
    const g = treeSettings.gridSize;
    return Math.round(val / g) * g;
  }

  function snapNodeToGrid(nodeId){
    if (!treeSettings.snapToGrid) return;
    const pos = network.getPositions([nodeId]);
    if (!pos[nodeId]) return;
    const sx = snapToGrid(pos[nodeId].x);
    const sy = snapToGrid(pos[nodeId].y);
    allNodes.update({ id: nodeId, x: sx, y: sy });
    network.redraw();
  }

  function snapAllNodesToGrid(){
    const g = treeSettings.gridSize;
    const posMap = network.getPositions();
    const occupied = new Set();
    const updates = [];
    for (const id of Object.keys(posMap)){
      let sx = Math.round(posMap[id].x / g) * g;
      let sy = Math.round(posMap[id].y / g) * g;
      // Avoid stacking: nudge if another node already occupies this cell
      let key = sx + ',' + sy;
      while (occupied.has(key)){
        sx += g;
        key = sx + ',' + sy;
      }
      occupied.add(key);
      updates.push({ id, x: sx, y: sy });
    }
    if (updates.length) allNodes.update(updates);
    network.redraw();
    network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    // Auto-save after snap-all
    saveAllPositions();
  }

  // --- Auto-save a single node position (debounced) ---
  let _saveTimer = null;
  function autoSavePositions(){
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function(){ saveAllPositions(); }, 800);
  }

  // --- Arrange linked nodes after a new relationship ---
  function autoArrangeAfterLink(){
    if (!treeSettings.snapToGrid){
      network.fit({ animation: true });
      autoSavePositions();
      return;
    }
    snapAllNodesToGrid();
  }

  // --- Drag-to-link state ---
  let draggedNodeId = null;
  let dragStartPos = null;
  let wasDragging = false;

  // --- Interaction events ---
  network.on('click', function(params){
    // Don't navigate if we just finished a drag
    if (wasDragging){ wasDragging = false; return; }
    if (params.nodes.length > 0){
      const nodeId = params.nodes[0];
      window.location.href = 'profile.html?id=' + encodeURIComponent(nodeId);
    }
  });

  // Double-click edge to edit/delete relationship
  network.on('doubleClick', function(params){
    if (!isFamilyMember) return;
    if (params.edges.length === 1 && params.nodes.length === 0){
      const edgeId = String(params.edges[0]);
      const parts = edgeId.split('__');
      if (parts.length < 3) return;
      const from_id = parts[0];
      const to_id = parts[1];
      const type = parts.slice(2).join('__');
      showDragLinkPopup(from_id, to_id, type);
    }
  });

  network.on('hoverNode', function(){ container.style.cursor = 'pointer'; });
  network.on('blurNode', function(){ container.style.cursor = 'grab'; });

  network.on('dragStart', function(params){
    container.style.cursor = 'grabbing';
    if (params.nodes.length === 1){
      draggedNodeId = params.nodes[0];
      const pos = network.getPositions([draggedNodeId]);
      dragStartPos = pos[draggedNodeId] ? { x: pos[draggedNodeId].x, y: pos[draggedNodeId].y } : null;
    }
  });

  network.on('dragEnd', function(params){
    container.style.cursor = 'grab';
    if (!isFamilyMember || !draggedNodeId || params.nodes.length !== 1){
      draggedNodeId = null;
      dragStartPos = null;
      return;
    }
    wasDragging = true;

    // Check if dropped near another node (drag-to-link)
    const dropCanvas = params.pointer.canvas;
    const threshold = treeSettings.nodeSize * 2.5;
    let targetNodeId = null;
    let closestDist = Infinity;

    const allPositions = network.getPositions();
    for (const id of Object.keys(allPositions)){
      if (id === draggedNodeId) continue;
      const pos = allPositions[id];
      const dx = pos.x - dropCanvas.x;
      const dy = pos.y - dropCanvas.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < threshold && dist < closestDist){
        closestDist = dist;
        targetNodeId = id;
      }
    }

    if (targetNodeId){
      // Snap dragged node back — this is a link gesture, not a move
      if (dragStartPos){
        allNodes.update({ id: draggedNodeId, x: dragStartPos.x, y: dragStartPos.y });
      }
      showDragLinkPopup(draggedNodeId, targetNodeId);
    } else {
      // Normal drag — snap to grid and auto-save
      snapNodeToGrid(draggedNodeId);
      autoSavePositions();
    }

    draggedNodeId = null;
    dragStartPos = null;
  });

  // --- Drag-to-link popup (also used for edit mode) ---
  function showDragLinkPopup(fromId, toId, editType){
    const modal = document.getElementById('drag-link-modal');
    if (!modal) return;
    const profA = profileMap.get(fromId);
    const profB = profileMap.get(toId);
    if (!profA || !profB) return;

    const nameA = displayName(profA);
    const nameB = displayName(profB);
    const imgA = avatarOf(profA) || avatarPlaceholder(nameA);
    const imgB = avatarOf(profB) || avatarPlaceholder(nameB);

    document.getElementById('drag-link-a-name').textContent = nameA;
    document.getElementById('drag-link-b-name').textContent = nameB;
    const aImg = document.getElementById('drag-link-a-img');
    const bImg = document.getElementById('drag-link-b-img');
    if (aImg) aImg.src = imgA;
    if (bImg) bImg.src = imgB;
    document.getElementById('drag-link-msg').textContent = '';

    const isEdit = !!editType;
    modal._fromId = fromId;
    modal._toId = toId;
    modal._mode = isEdit ? 'edit' : 'create';
    modal._originalType = editType || null;

    document.getElementById('drag-link-type').value = editType || 'parent';

    const titleEl = document.getElementById('drag-link-title');
    const descEl = modal.querySelector('.drag-link-desc');
    const submitBtn = document.getElementById('drag-link-submit');
    const deleteBtn = document.getElementById('drag-link-delete');

    if (isEdit){
      if (titleEl) titleEl.textContent = '✏️ Whakatika / Edit Link';
      if (descEl) descEl.textContent = 'Change the relationship type or remove this link.';
      if (submitBtn) submitBtn.textContent = 'Whakahou / Update';
      if (deleteBtn) deleteBtn.hidden = false;
    } else {
      if (titleEl) titleEl.textContent = '🔗 Honoa / Link Members';
      if (descEl) descEl.textContent = 'How are these whānau members related?';
      if (submitBtn) submitBtn.textContent = 'Honoa / Link';
      if (deleteBtn) deleteBtn.hidden = true;
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeDragLinkPopup(){
    const modal = document.getElementById('drag-link-modal');
    if (modal){ modal.hidden = true; modal.setAttribute('aria-hidden', 'true'); }
  }

  // Close button & cancel
  document.getElementById('drag-link-close')?.addEventListener('click', closeDragLinkPopup);
  document.getElementById('drag-link-cancel')?.addEventListener('click', closeDragLinkPopup);
  // Close on backdrop click
  document.getElementById('drag-link-modal')?.addEventListener('click', function(e){
    if (e.target === this) closeDragLinkPopup();
  });

  // Submit drag-link form (handles both create and edit)
  document.getElementById('drag-link-form')?.addEventListener('submit', async function(e){
    e.preventDefault();
    const modal = document.getElementById('drag-link-modal');
    const msgEl = document.getElementById('drag-link-msg');
    if (!modal) return;
    const from_id = modal._fromId;
    const to_id = modal._toId;
    const newType = document.getElementById('drag-link-type').value;
    if (!from_id || !to_id || !newType) return;
    if (from_id === to_id){ if (msgEl) msgEl.textContent = 'K\u0101ore e tika / Cannot relate a person to themselves.'; return; }

    const isEdit = modal._mode === 'edit';
    const oldType = modal._originalType;

    try {
      const userId = await currentUserId();
      if (!userId){ if (msgEl) msgEl.textContent = 'Takiuru hei tiaki / Login to save.'; return; }

      if (isEdit && oldType){
        // Update existing relationship
        if (sb){
          const { error } = await sb.from('whakapapa_relations')
            .update({ type: newType })
            .eq('from_id', from_id)
            .eq('to_id', to_id)
            .eq('type', oldType);
          if (error) throw error;
        }
        const idx = relations.findIndex(r => r.from_id === from_id && r.to_id === to_id && r.type === oldType);
        if (idx !== -1) relations[idx].type = newType;
        const oldEdgeId = from_id + '__' + to_id + '__' + oldType;
        allEdges.remove(oldEdgeId);
        allEdges.add(toEdge({ from_id, to_id, type: newType }));
        autoSavePositions();
      } else {
        // Create new relationship
        const rel = { from_id, to_id, type: newType };
        if (sb){
          const whanau_id = (typeof window.getMyWhanauId === 'function') ? await window.getMyWhanauId() : null;
          const { error } = await sb.from('whakapapa_relations').insert([{ ...rel, user_id: userId, whanau_id }]);
          if (error) throw error;
        }
        relations.push(rel);
        allEdges.add(toEdge(rel));
        autoArrangeAfterLink();
      }
      renderUnplacedMembers();
      closeDragLinkPopup();
    } catch (err){
      if (msgEl) msgEl.textContent = isEdit ? 'Hapa whakahou / Failed to update.' : 'Hapa t\u0101piri / Failed to add relation.';
    }
  });

  // Delete relationship from edit popup
  document.getElementById('drag-link-delete')?.addEventListener('click', async function(){
    const modal = document.getElementById('drag-link-modal');
    const msgEl = document.getElementById('drag-link-msg');
    if (!modal || modal._mode !== 'edit') return;
    const from_id = modal._fromId;
    const to_id = modal._toId;
    const type = modal._originalType;
    if (!from_id || !to_id || !type) return;
    try {
      if (sb){
        const { error } = await sb.from('whakapapa_relations')
          .delete()
          .eq('from_id', from_id)
          .eq('to_id', to_id)
          .eq('type', type);
        if (error) throw error;
      }
      const idx = relations.findIndex(r => r.from_id === from_id && r.to_id === to_id && r.type === type);
      if (idx !== -1) relations.splice(idx, 1);
      allEdges.remove(from_id + '__' + to_id + '__' + type);
      renderUnplacedMembers();
      autoSavePositions();
      closeDragLinkPopup();
    } catch (err){
      console.error(err);
      if (msgEl) msgEl.textContent = 'Hapa muku / Failed to remove link.';
    }
  });

  fitBtn && fitBtn.addEventListener('click', () => network.fit({ animation: true }));

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
      isFamilyMember = await checkIsFamilyMember();
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

      // Load people and relations
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

      const allHavePositions = nodes.length > 0 && nodes.every(n => positions[n.id]);
      if (allHavePositions){
        network.setOptions({ physics: { enabled: false } });
      }

      network.once('stabilized', function(){
        network.setOptions({ physics: { enabled: false } });
        allNodes.forEach(n => { allNodes.update({ id: n.id, fixed: false }); });
      });

      // Show sidebar for family members
      if (isFamilyMember){
        if (sidebarRight) sidebarRight.classList.add('active');
        container.style.cursor = 'grab';
        container.classList.add('admin-mode');

        if (allHavePositions){
          allNodes.forEach(n => { allNodes.update({ id: n.id, fixed: false }); });
        }
      } else {
        if (sidebarRight) sidebarRight.classList.add('hidden');
        const layout = document.querySelector('.whakapapa-layout');
        if (layout) layout.classList.add('view-only');
      }

      renderUnplacedMembers();

      if (!peopleIds.length){
        if (msg) msg.textContent = isFamilyMember
          ? 'Tāpirihia ngā kōtaha ki te rākau. / Add profiles to the tree using the sidebar.'
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

  bootstrap();
})();
