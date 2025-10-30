// Whakapapa (family tree) builder with per-user persistence (Supabase) and local fallback
(function(){
  const hasVis = !!window.vis;
  const container = document.getElementById('whakapapa-tree');
  const msg = document.getElementById('whakapapa-msg');
  if (!container || !hasVis) { if (msg) msg.textContent = 'Network library failed to load.'; return; }

  const sel = document.getElementById('root-select');
  const onlyConnected = document.getElementById('only-connected');
  const depthInput = document.getElementById('depth');
  const depthVal = document.getElementById('depth-val');
  const fitBtn = document.getElementById('fit');

  const personForm = document.getElementById('person-form');
  const personMsg = document.getElementById('person-msg');

  const relForm = document.getElementById('rel-form');
  const relMsg = document.getElementById('rel-msg');
  const relFit = document.getElementById('rel-fit');

  // Supabase client (optional)
  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
  const sb = (window.sb || (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null));

  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  async function currentUserId(){
    if (!sb) return null;
    try { const { data } = await sb.auth.getSession(); return data.session?.user?.id || null; } catch { return null; }
  }

  function storageKey(base, userId){ return `${base}.v1:${userId||'anon'}`; }

  function avatarOf(p){ return p.avatar_url || p.photo_url || p.image_url || p.avatar || null; }
  function displayName(p){ return p.full_name || p.name || p.email || '—'; }
  function toNode(p){
    const img = avatarOf(p);
    if (img){ return { id: p.id, label: displayName(p), shape: 'circularImage', image: img, borderWidth: 1 }; }
    return { id: p.id, label: displayName(p), shape: 'box' };
  }
  function toEdge(r){
    if (r.type === 'parent' || r.type === 'mother' || r.type === 'father'){
      return { from: r.from_id, to: r.to_id, arrows: 'to', label: 'parent', color: { color: '#6ec5be' } };
    }
    if (r.type === 'spouse' || r.type === 'partner'){
      return { from: r.from_id, to: r.to_id, dashes: true, label: 'spouse', color: { color: '#c58f6e' } };
    }
    return { from: r.from_id, to: r.to_id, color: { color: '#9aa3a7' } };
  }

  const opts = {
    layout: { hierarchical: { enabled: true, direction: 'UD', sortMethod: 'directed', nodeSpacing: 150, levelSeparation: 120 } },
    physics: false,
    nodes: { color: { background: 'var(--panel)', border: 'var(--border)' }, font: { color: 'var(--fg)' }, borderWidth: 1 },
    edges: { smooth: { type: 'cubicBezier' }, font: { color: 'var(--muted)' } }
  };

  // All available profiles (from Supabase)
  let profiles = [];
  let profileMap = new Map();
  // People in this user's tree (array of profile IDs)
  let peopleIds = [];
  let relations = [];
  let allNodes = new vis.DataSet([]);
  let allEdges = new vis.DataSet([]);
  let network = new vis.Network(container, { nodes: allNodes, edges: allEdges }, opts);

  function neighborsWithin(rootId, maxDepth){
    const adj = new Map();
    allEdges.forEach(e => {
      if (!adj.has(e.from)) adj.set(e.from, []);
      if (!adj.has(e.to)) adj.set(e.to, []);
      adj.get(e.from).push(e.to);
      adj.get(e.to).push(e.from);
    });
    const seen = new Set([rootId]);
    const q = [[rootId,0]];
    while (q.length){
      const [u,d] = q.shift();
      if (d >= maxDepth) continue;
      const ns = adj.get(u) || [];
      for (const v of ns){ if (!seen.has(v)) { seen.add(v); q.push([v,d+1]); } }
    }
    return seen;
  }

  function applyFilter(){
    const rootId = sel.value || (allNodes.getIds()[0] || null);
    const d = parseInt(depthInput.value || '3', 10);
    depthVal.textContent = String(d);
    if (!onlyConnected.checked || !rootId){
      network.setData({ nodes: allNodes, edges: allEdges });
      if (rootId) network.focus(rootId, { animation: true, scale: 1 });
      return;
    }
    const keep = neighborsWithin(rootId, d);
    const nodes = new vis.DataSet(allNodes.get({ filter: n => keep.has(n.id) }));
    const edges = new vis.DataSet(allEdges.get({ filter: e => keep.has(e.from) && keep.has(e.to) }));
    network.setData({ nodes, edges });
    network.focus(rootId, { animation: true, scale: 1 });
  }

  function selectedPeople(){
    return peopleIds.map(id => profileMap.get(id)).filter(Boolean);
  }
  function populateRootSelect(){
    sel.innerHTML = '';
    selectedPeople().forEach(p => { const opt = document.createElement('option'); opt.value = p.id; opt.textContent = displayName(p); sel.appendChild(opt); });
  }
  function populateRelSelects(){
    const a = document.getElementById('rel-a');
    const b = document.getElementById('rel-b');
    if (!a || !b) return;
    const add = (el) => {
      el.innerHTML = '';
      selectedPeople().forEach(p => { const opt = document.createElement('option'); opt.value = p.id; opt.textContent = displayName(p); el.appendChild(opt); });
    };
    add(a); add(b);
  }

  function createBackend(){
    // Local fallback (per-user by auth uid; otherwise per-browser)
    const local = {
      async listPeopleIds(userId){
        try { return JSON.parse(localStorage.getItem(storageKey('whakapapa.people.ids', userId)) || '[]'); } catch { return []; }
      },
      async listRelations(userId){
        try { return JSON.parse(localStorage.getItem(storageKey('whakapapa.relations', userId)) || '[]'); } catch { return []; }
      },
      async addPersonId(userId, profile_id){
        const cur = await this.listPeopleIds(userId);
        if (!cur.includes(profile_id)) cur.push(profile_id);
        try { localStorage.setItem(storageKey('whakapapa.people.ids', userId), JSON.stringify(cur)); } catch {}
      },
      async addRelation(userId, rel){
        const cur = await this.listRelations(userId); cur.push(rel);
        try { localStorage.setItem(storageKey('whakapapa.relations', userId), JSON.stringify(cur)); } catch {}
      }
    };

    if (!sb) return { type: 'local', ...local };

    const peopleTable = 'whakapapa_people'; // columns: user_id uuid, profile_id uuid
    const relTable = 'whakapapa_relations';
    return {
      type: 'supabase',
      async listPeopleIds(userId){
        if (!userId) return [];
        const { data, error } = await sb.from(peopleTable).select('profile_id').eq('user_id', userId);
        if (error) { console.error(error); return []; }
        return (data||[]).map(r => r.profile_id).filter(Boolean);
      },
      async listRelations(userId){
        if (!userId) return [];
        const { data, error } = await sb.from(relTable).select('from_id, to_id, type').eq('user_id', userId);
        if (error) { console.error(error); return []; }
        return data || [];
      },
      async addPersonId(userId, profile_id){
        const payload = { user_id: userId, profile_id };
        const { error } = await sb.from(peopleTable).insert([payload]).select().single();
        if (error) throw error;
      },
      async addRelation(userId, rel){
        const payload = { from_id: rel.from_id, to_id: rel.to_id, type: rel.type, user_id: userId };
        const { error } = await sb.from(relTable).insert([payload]);
        if (error) throw error;
      }
    };
  }

  const backend = createBackend();

  async function bootstrap(){
    container.setAttribute('aria-busy','true');
    try{
      const uidNow = await currentUserId();

      // Load profiles (Supabase only)
      if (sb){
        const { data: profs, error } = await sb.from('profiles').select('id, full_name, avatar_url');
        if (error) {
          profiles = [];
          if (msg) msg.textContent = 'Kāore e taea te tiki kōtaha. Tukua te here RLS kia pānui ngā kaiwhakamahi takiuru i te profiles. / Cannot load profiles. Add a SELECT policy on profiles for authenticated users.';
        } else if (Array.isArray(profs)) {
          profiles = profs;
        } else {
          profiles = [];
        }
      } else {
        profiles = [];
      }
      profileMap = new Map(profiles.map(p => [p.id, p]));

      // Load this user's selected people (IDs) and relations
      peopleIds = await backend.listPeopleIds(uidNow);
      relations = await backend.listRelations(uidNow);

      // Build graph datasets
      const nodes = peopleIds.map(id => profileMap.get(id)).filter(Boolean).map(toNode);
      allNodes = new vis.DataSet(nodes);
      allEdges = new vis.DataSet(relations.map(toEdge));
      network.setData({ nodes: allNodes, edges: allEdges });

      populateRootSelect();
      populateRelSelects();
      populatePersonSelect();

      if (!peopleIds.length){
        if (msg) msg.textContent = sb ? 'Kōwhiria ngā kōtaha ki te tāpiri ki te rākau. / Select profiles to add to your tree.' : 'Local mode (no Supabase): unable to list profiles.';
      } else { if (msg) msg.textContent = ''; }

      // Default root: current user if in selection
      if (sb){
        const { data } = await sb.auth.getSession();
        const myId = data?.session?.user?.id;
        if (myId && peopleIds.includes(myId)) sel.value = myId;
      }

      applyFilter();
    } catch (e){ if (msg) msg.textContent = 'Kāore i taea te uta te rākau whakapapa / Unable to load family tree.'; }
    finally { container.setAttribute('aria-busy','false'); }
  }

  // Events
  sel && sel.addEventListener('change', applyFilter);
  onlyConnected && onlyConnected.addEventListener('change', applyFilter);
  depthInput && depthInput.addEventListener('input', applyFilter);
  fitBtn && fitBtn.addEventListener('click', () => network.fit({ animation: true }));
  relFit && relFit.addEventListener('click', () => network.fit({ animation: true }));

  // Populate and handle Add person (from existing profiles)
  function populatePersonSelect(){
    const selP = document.getElementById('person-select');
    const btn = document.getElementById('person-add-btn');
    if (!selP){ return; }
    selP.innerHTML = '';
    if (!sb){ selP.disabled = true; if (btn) btn.disabled = true; return; }
    // Show profiles not yet included
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

  personForm && personForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (personMsg) personMsg.textContent = '';
    try {
      const userId = await currentUserId();
      if (backend.type === 'supabase' && !userId) { if (personMsg) personMsg.textContent = 'Takiuru hei tiaki / Login to save.'; return; }
      const profile_id = String(document.getElementById('person-select').value||'').trim();
      if (!profile_id){ if (personMsg) personMsg.textContent = 'Kōwhiria tētahi kōtaha / Select a profile.'; return; }
      if (peopleIds.includes(profile_id)){ if (personMsg) personMsg.textContent = 'Kua tāpirihia kē / Already added.'; return; }
      await backend.addPersonId(userId, profile_id);
      peopleIds.push(profile_id);
      const prof = profileMap.get(profile_id);
      if (prof) allNodes.add(toNode(prof));
      populateRootSelect();
      populateRelSelects();
      populatePersonSelect();
      if (!sel.value) sel.value = profile_id;
      applyFilter();
      if (personMsg) personMsg.textContent = 'Kua tāpirihia / Added.';
    } catch (err){ if (personMsg) personMsg.textContent = 'Hapa tāpiri / Failed to add person.'; }
  });

  // Add relation (between selected people) 
  relForm && relForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (relMsg) relMsg.textContent = '';
    const from_id = document.getElementById('rel-a').value;
    const to_id = document.getElementById('rel-b').value;
    const type = document.getElementById('rel-type').value;
    if (!from_id || !to_id || !type){ if (relMsg) relMsg.textContent = 'Kōwhiria te tāngata me te momo hononga / Select people and relation type.'; return; }
    if (from_id === to_id){ if (relMsg) relMsg.textContent = 'Kāore e tika te hono ki a ia anō / Cannot relate a person to themselves.'; return; }
    try{
      const userId = await currentUserId();
      if (backend.type === 'supabase' && !userId) { if (relMsg) relMsg.textContent = 'Takiuru hei tiaki / Login to save.'; return; }
      const rel = { from_id, to_id, type };
      await backend.addRelation(userId, rel);
      relations.push(rel);
      allEdges.add(toEdge(rel));
      applyFilter();
      if (relMsg) relMsg.textContent = 'Kua tāpirihia / Added.';
    }catch(err){ if (relMsg) relMsg.textContent = 'Hapa tāpiri / Failed to add relation.'; }
  });

  bootstrap();
})();
