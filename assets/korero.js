(function(){
  const listEl = document.getElementById('korero-list');
  const featuredEl = document.getElementById('korero-featured');
  const emptyEl = document.getElementById('korero-empty');
  const form = document.getElementById('korero-form');
  const selType = document.getElementById('post-type');
  const storyWrap = document.getElementById('story-wrap');
  const vlogWrap = document.getElementById('vlog-wrap');
  const storyText = document.getElementById('story-text');
  const vlogUrl = document.getElementById('vlog-url');
  const postTitle = document.getElementById('post-subject');
  // Modal elements for create
  const createOpenBtn = document.getElementById('open-korero-modal');
  const createModal = document.getElementById('korero-modal');
  const createCloseBtn = document.getElementById('korero-modal-close');
  const createCancelBtn = document.getElementById('korero-cancel');
  // Edit modal elements
  const editModal = document.getElementById('korero-edit-modal');
  const editCloseBtn = document.getElementById('korero-edit-close');
  const editForm = document.getElementById('korero-edit-form');
  const editStoryWrap = document.getElementById('edit-story-wrap');
  const editVlogWrap = document.getElementById('edit-vlog-wrap');
  const editStoryText = document.getElementById('edit-story-text');
  const editVlogUrl = document.getElementById('edit-vlog-url');
  const editTitleHeading = document.getElementById('korero-edit-title');
  const editTitleInput = document.getElementById('edit-subject');
  const editCancelBtn = document.getElementById('korero-edit-cancel');
  // Delete modal elements
  const deleteModal = document.getElementById('korero-delete-modal');
  const deleteCloseBtn = document.getElementById('korero-delete-close');
  const deleteCancelBtn = document.getElementById('korero-delete-cancel');
  const deleteConfirmBtn = document.getElementById('korero-delete-confirm');
  // View modal elements
  const viewModal = document.getElementById('korero-view-modal');
  const viewCloseBtn = document.getElementById('korero-view-close');
  const viewBody = document.getElementById('korero-view-body');
  if (!listEl) return;

  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const esc = (s) => (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const fmtTS = (ts) => new Date(ts).toLocaleString();

  // Aroha animation with fireworks
  function showArohaAnimation(x, y) {
    // Create "Aroha!" text popup
    const popup = document.createElement('div');
    popup.className = 'aroha-popup';
    popup.textContent = 'Aroha!';
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 1200);

    // Create fireworks particles
    const colors = ['#00c4b3', '#ffd700', '#ff6b6b', '#4ecdc4', '#ffe66d'];
    const particleCount = 12;
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'firework';
      const angle = (Math.PI * 2 * i) / particleCount;
      const distance = 60 + Math.random() * 40;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;
      particle.style.left = x + 'px';
      particle.style.top = y + 'px';
      particle.style.background = colors[Math.floor(Math.random() * colors.length)];
      particle.style.setProperty('--tx', tx + 'px');
      particle.style.setProperty('--ty', ty + 'px');
      particle.style.animation = 'firework-burst 0.8s ease-out forwards';
      document.body.appendChild(particle);
      setTimeout(() => particle.remove(), 800);
    }
  }

  function getAnonId(){
    try {
      const k = 'korero.anonId';
      let v = localStorage.getItem(k);
      if (!v) { v = uid(); localStorage.setItem(k, v); }
      return v;
    } catch { return 'anon'; }
  }

  function createBackend(cfg){
    // Local storage adapter
    const KEY_P = 'korero.posts.v1';
    const KEY_R = 'korero.reactions.v1';
    const local = {
      async listPosts(){ try { return JSON.parse(localStorage.getItem(KEY_P) || '[]'); } catch { return []; } },
      async userId(){ return getAnonId(); },
      async addPost(type, title, text, mediaUrl, authorId){
        const p = { id: uid(), type, title: title||'', text: text || '', mediaUrl: mediaUrl || '', authorId: authorId || getAnonId(), createdAt: Date.now(), updatedAt: Date.now() };
        const cur = await this.listPosts(); cur.unshift(p);
        try { localStorage.setItem(KEY_P, JSON.stringify(cur)); } catch {}
        return p;
      },
      async updatePost(id, fields){
        const cur = await this.listPosts();
        const i = cur.findIndex(p => p.id === id);
        if (i >= 0) {
          const next = {
            ...cur[i],
            ...('title' in fields ? { title: fields.title } : {}),
            ...('text' in fields ? { text: fields.text } : {}),
            ...('mediaUrl' in fields ? { mediaUrl: fields.mediaUrl } : {}),
            updatedAt: Date.now()
          };
          cur[i] = next;
          try { localStorage.setItem(KEY_P, JSON.stringify(cur)); } catch {}
          return next;
        }
      },
      async removePost(id){ const cur = await this.listPosts(); const next = cur.filter(p => p.id !== id); try { localStorage.setItem(KEY_P, JSON.stringify(next)); } catch {} },
      async listReactions(){ try { return JSON.parse(localStorage.getItem(KEY_R) || '[]'); } catch { return []; } },
      async toggleReaction(postId, type){
        const userId = await this.userId();
        const cur = await this.listReactions();
        const i = cur.findIndex(r => r.postId===postId && r.userId===userId && r.type===type);
        if (i>=0) { cur.splice(i,1); }
        else { cur.push({ id: uid(), postId, userId, type, createdAt: Date.now() }); }
        try { localStorage.setItem(KEY_R, JSON.stringify(cur)); } catch {}
      },
      async getReactionsMap(){
        const all = await this.listReactions();
        const map = new Map();
        for (const r of all){
          const m = map.get(r.postId) || { like:0, aroha:0, mine: new Set() };
          if (r.type==='like') m.like++;
          if (r.type==='aroha') m.aroha++;
          m.mine.add(r.userId+':'+r.type);
          map.set(r.postId, m);
        }
        return map;
      }
    };

    if (!cfg || cfg.type !== 'supabase' || typeof window.supabase === 'undefined') return local;

    // Supabase adapter
    const sb = window.sb || window.supabase.createClient(cfg.url, cfg.anonKey);
    const supa = {
      async listPosts(){
        const { data, error } = await sb.from('korero_posts').select('*').order('created_at', { ascending: false });
        if (error) { console.error(error); return []; }
        return (data||[]).map(r => ({
          id: r.id,
          type: r.type,
          title: r.title || '',
          text: r.text || '',
          mediaUrl: r.media_url || '',
          authorId: r.author_id || '',
          createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
          updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : undefined
        }));
      },
      async addPost(type, title, text, mediaUrl){
        const { data: sess } = await sb.auth.getSession();
        const user = sess.session?.user; if (!user) throw new Error('login-required');
        let payload = { id: uid(), type, title, text, media_url: mediaUrl || null, author_id: user.id };
        let { error } = await sb.from('korero_posts').insert([payload]);
        if (error && String(error.message||'').toLowerCase().includes('title')){
          payload = { id: payload.id, type, text, media_url: payload.media_url, author_id: payload.author_id };
          const retry = await sb.from('korero_posts').insert([payload]); if (retry.error) throw retry.error;
        } else if (error) throw error;
        return { id: payload.id, type, title: payload.title||'', text, mediaUrl: payload.media_url||'', authorId: payload.author_id, createdAt: Date.now() };
      },
      async updatePost(id, fields){
        const patch = {};
        if (typeof fields.title === 'string') patch.title = fields.title;
        if (typeof fields.text === 'string') patch.text = fields.text;
        if (typeof fields.mediaUrl === 'string') patch.media_url = fields.mediaUrl;
        patch.updated_at = new Date().toISOString();
        let { error } = await sb.from('korero_posts').update(patch).eq('id', id);
        if (error && String(error.message||'').toLowerCase().includes('title')){
          delete patch.title; const retry = await sb.from('korero_posts').update(patch).eq('id', id); if (retry.error) throw retry.error;
        } else if (error) throw error;
      },
      async removePost(id){ await sb.from('korero_posts').delete().eq('id', id); },
      async userId(){ const { data } = await sb.auth.getSession(); return data.session?.user?.id || ''; },
      async toggleReaction(postId, type){
        const { data } = await sb.auth.getSession(); const user = data.session?.user; if (!user) throw new Error('login-required');
        const { data: exists, error: selErr } = await sb.from('korero_reactions').select('id').eq('post_id', postId).eq('user_id', user.id).eq('type', type).maybeSingle();
        if (selErr && selErr.code !== 'PGRST116') console.error(selErr);
        if (exists && exists.id){
          await sb.from('korero_reactions').delete().eq('id', exists.id);
        } else {
          const ins = { id: uid(), post_id: postId, user_id: user.id, type };
          const { error } = await sb.from('korero_reactions').insert([ins]);
          if (error) throw error;
        }
      },
      async getReactionsMap(){
        const { data, error } = await sb.from('korero_reactions').select('*');
        if (error) { console.error(error); return new Map(); }
        const mineId = await this.userId();
        const map = new Map();
        for (const r of (data||[])){
          const postId = r.post_id; const type = r.type;
          const m = map.get(postId) || { like:0, aroha:0, mine: new Set() };
          if (type==='like') m.like++;
          if (type==='aroha') m.aroha++;
          m.mine.add((r.user_id||'')+':'+type);
          map.set(postId, m);
        }
        // Attach mine marker for current user
        return map;
      }
    };
    return supa;
  }

  const backend = createBackend(window.KORERO_BACKEND || { type: 'local' });


  // Modal open/close handlers
  function showCreate(){ if (createModal){ createModal.hidden = false; createModal.setAttribute('aria-hidden','false'); } }
  function hideCreate(){ if (createModal){ createModal.hidden = true; createModal.setAttribute('aria-hidden','true'); } }
  if (createOpenBtn) createOpenBtn.addEventListener('click', (e) => { e.preventDefault(); showCreate(); });
  if (createCloseBtn) createCloseBtn.addEventListener('click', hideCreate);
  if (createCancelBtn) createCancelBtn.addEventListener('click', hideCreate);
  if (createModal) createModal.addEventListener('click', (e) => { if (e.target === createModal) hideCreate(); });

  // Manage state
  let managePost = null;
  function showEdit(){ if (editModal){ editModal.hidden = false; editModal.setAttribute('aria-hidden','false'); } }
  function hideEdit(){ if (editModal){ editModal.hidden = true; editModal.setAttribute('aria-hidden','true'); } managePost=null; }
  function showDelete(){ if (deleteModal){ deleteModal.hidden = false; deleteModal.setAttribute('aria-hidden','false'); } }
  function hideDelete(){ if (deleteModal){ deleteModal.hidden = true; deleteModal.setAttribute('aria-hidden','true'); } managePost=null; }
  if (editCloseBtn) editCloseBtn.addEventListener('click', hideEdit);
  if (editCancelBtn) editCancelBtn.addEventListener('click', hideEdit);
  if (deleteCloseBtn) deleteCloseBtn.addEventListener('click', hideDelete);
  if (deleteCancelBtn) deleteCancelBtn.addEventListener('click', hideDelete);
  if (editModal) editModal.addEventListener('click', (e) => { if (e.target === editModal) hideEdit(); });
  if (deleteModal) deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) hideDelete(); });
  if (viewCloseBtn) viewCloseBtn.addEventListener('click', () => { if (viewModal){ viewModal.hidden = true; viewModal.setAttribute('aria-hidden','true'); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { hideCreate(); hideEdit(); hideDelete(); if (viewModal){ viewModal.hidden=true; viewModal.setAttribute('aria-hidden','true'); } } });
  if (viewModal) viewModal.addEventListener('click', (e) => { if (e.target === viewModal){ viewModal.hidden=true; viewModal.setAttribute('aria-hidden','true'); } });

  // Toggle form fields based on type
  if (selType && storyWrap && vlogWrap){
    const apply = () => {
      const t = selType.value;
      const isStory = t === 'story';
      storyWrap.hidden = !isStory; vlogWrap.hidden = isStory;
      if (isStory) vlogUrl.value = ''; else storyText.value = '';
    };
    selType.addEventListener('change', apply); apply();
  }

  // Render state
  let cache = [];
  let reactMap = new Map();
  let currentUserId = '';
  const setBusy = (b) => listEl.setAttribute('aria-busy', String(!!b));

  function buildPostCard(p, opts){
    const card = document.createElement('article'); card.className='card';
    const body = document.createElement('div'); body.className='card-body';
    const tagLabel = p.type === 'vlog' ? 'Vlog' : 'Story';
    const popularTag = (opts && opts.popular) ? ' <span class="tag popular">Most popular</span>' : '';
    body.innerHTML = `<div><span class=\"tag\">${tagLabel}</span>${popularTag}</div>` +
      (p.title ? `<h3 class=\"post-title\">${esc(p.title)}</h3>` : '') +
      `<div class=\"small muted\">${fmtTS(p.createdAt)}</div>`;

    if (p.type === 'story' && p.text){
      const T = String(p.text||'');
      const LIMIT = 280; // characters
      if (T.length > LIMIT){
        const preview = document.createElement('p'); preview.style.whiteSpace='pre-wrap'; preview.style.margin='.5rem 0 0';
        preview.textContent = T.slice(0, LIMIT).trim() + '… ';
        const more = document.createElement('a'); more.href='#'; more.textContent='Read more'; more.style.color='var(--accent)'; more.style.textDecoration='none'; more.style.cursor='pointer';
        more.addEventListener('click', (e)=>{ e.preventDefault(); if (viewBody) viewBody.textContent = T; if (viewModal){ viewModal.hidden=false; viewModal.setAttribute('aria-hidden','false'); } });
        preview.appendChild(more);
        body.appendChild(preview);
      } else {
        const pre = document.createElement('p'); pre.textContent = T; pre.style.whiteSpace='pre-wrap'; pre.style.margin='.5rem 0 0'; body.appendChild(pre);
      }
    }
    if (p.type === 'vlog' && p.mediaUrl){
      const url = p.mediaUrl.trim();
      const ytId = (u) => {
        try {
          const x = new URL(u);
          const host = x.hostname.replace(/^www\./,'');
          if (host.includes('youtu.be')) return (x.pathname.split('/')[1]||'').slice(0,11);
          if (host.includes('youtube.com')){
            const v = x.searchParams.get('v');
            if (v) return v.slice(0,11);
            if (x.pathname.startsWith('/embed/')) return (x.pathname.split('/')[2]||'').slice(0,11);
          }
        } catch {}
        return '';
      };
      const id = ytId(url);
      if (id){
        const iframe = document.createElement('iframe');
        iframe.width = '560'; iframe.height = '315'; iframe.loading = 'lazy';
        iframe.src = `https://www.youtube.com/embed/${id}`; iframe.title='YouTube video'; iframe.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'; iframe.allowFullscreen = true;
        iframe.style.width='100%'; iframe.style.aspectRatio='16/9'; iframe.style.border='0';
        body.appendChild(iframe);
      } else {
        const a = document.createElement('a'); a.href = url; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent = 'Open video'; body.appendChild(a);
      }
    }

    const r = reactMap.get(p.id) || { like:0, aroha:0, mine: new Set() };
    const actions = document.createElement('div'); actions.className='actions'; actions.style.marginTop='1rem';
    const btnAroha = document.createElement('button'); btnAroha.type='button'; btnAroha.className='btn outline';
    const markMine = () => {
      const mineAroha = r.mine.has(currentUserId+':aroha');
      btnAroha.classList.toggle('active', !!mineAroha);
    };
    btnAroha.innerHTML = `<span class="emoji">💛</span> ${r.aroha||0}`;
    btnAroha.addEventListener('click', async (e) => { 
      // Show aroha animation
      const rect = btnAroha.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      showArohaAnimation(x, y);
      
      try { await backend.toggleReaction(p.id, 'aroha'); await refresh(); } catch (e){ if (String(e&&e.message).includes('login-required')) alert('Takiuru kia urupare. / Sign in to react.'); } 
    });
    actions.appendChild(btnAroha);

    // Owner buttons in bottom-right container
    const ownerActions = document.createElement('div'); ownerActions.className='owner-actions';
    const isOwner = p.authorId && currentUserId && p.authorId === currentUserId;
    if (isOwner){
      const btnEdit = document.createElement('button'); btnEdit.type='button'; btnEdit.className='btn lang-swap'; btnEdit.innerHTML='<span class="lang mi">Whakatika</span><span class="lang en" aria-hidden="true">Edit</span>';
      btnEdit.addEventListener('click', () => {
        managePost = p;
        editTitleHeading && (editTitleHeading.textContent = p.type==='story' ? 'Whakatika Kōrero / Edit Story' : 'Whakatika Vlog URL');
        if (editTitleInput) editTitleInput.value = p.title || '';
        if (p.type==='story'){ editStoryWrap.hidden = false; editVlogWrap.hidden = true; if (editStoryText) editStoryText.value = p.text || ''; }
        else { editStoryWrap.hidden = true; editVlogWrap.hidden = false; if (editVlogUrl) editVlogUrl.value = p.mediaUrl || ''; }
        showEdit();
      });
      const btnDel = document.createElement('button'); btnDel.type='button'; btnDel.className='btn danger outline lang-swap'; btnDel.innerHTML='<span class="lang mi">Muku</span><span class="lang en" aria-hidden="true">Delete</span>';
      btnDel.addEventListener('click', () => { managePost = p; showDelete(); });
      ownerActions.appendChild(btnEdit); ownerActions.appendChild(btnDel);
    }

    if (isOwner) actions.appendChild(ownerActions);
    body.appendChild(actions);
    markMine();
    card.appendChild(body);
    return card;
  }

  async function refresh(){
    setBusy(true);
    try {
      cache = await backend.listPosts();
      reactMap = await backend.getReactionsMap();
      try { currentUserId = await backend.userId(); } catch { currentUserId = ''; }
      render();
    } finally { setBusy(false); }
  }

  function render(){
    try {
      if (featuredEl) featuredEl.innerHTML='';
      listEl.innerHTML = '';
      const items = cache.slice();
      if (!items.length){ emptyEl && (emptyEl.style.display='block'); } else { emptyEl && (emptyEl.style.display='none'); }

      // Featured row: add button + most reacted story
      const ffrag = document.createDocumentFragment();
      const addCard = document.createElement('article'); addCard.className='card add-card';
      const addBody = document.createElement('div'); addBody.className='card-body';
      const addBtn = document.createElement('button'); addBtn.type='button'; addBtn.className='image-btn'; addBtn.setAttribute('aria-label','Add a story or vlog');
      addBtn.innerHTML = `<img class=\"image-btn-img\" loading=\"lazy\" decoding=\"async\" alt=\"Video camera next to an open diary with a pen on a wooden desk\" src=\"assets/korero-button.jpg\" />`;
      addBtn.addEventListener('click', () => showCreate());
      addBody.appendChild(addBtn); addCard.appendChild(addBody); ffrag.appendChild(addCard);

      // pick most reacted story
      let featured = null; let bestScore = -1;
      for (const p of items){
        if (p.type !== 'story') continue;
        const r = reactMap.get(p.id) || { like:0, aroha:0 };
        const score = (r.like||0) + (r.aroha||0);
        if (score > bestScore || (score === bestScore && featured && p.createdAt > featured.createdAt)){
          featured = p; bestScore = score;
        } else if (featured === null) { featured = p; bestScore = score; }
      }
      if (featuredEl){
        if (featured) ffrag.appendChild(buildPostCard(featured, { popular: true }));
        featuredEl.appendChild(ffrag);
      }

      // Rest of stories (and vlogs) by most recent, excluding featured
      const rest = items.sort((a,b)=>b.createdAt-a.createdAt).filter(p => !featured || p.id !== featured.id);
      const lfrag = document.createDocumentFragment();
      for (const p of rest){
        try { lfrag.appendChild(buildPostCard(p)); } catch(e){ console.error('Render card error', e); }
      }
      listEl.appendChild(lfrag);
    } catch (e){
      console.error('Render error', e);
      // Minimal fallback: ensure add button shows
      if (featuredEl) featuredEl.innerHTML='';
      listEl.innerHTML='';
      const addCard = document.createElement('article'); addCard.className='card add-card';
      const addBody = document.createElement('div'); addBody.className='card-body';
      const addBtn = document.createElement('button'); addBtn.type='button'; addBtn.className='image-btn'; addBtn.setAttribute('aria-label','Add a story or vlog');
      addBtn.innerHTML = `<img class=\"image-btn-img\" loading=\"lazy\" decoding=\"async\" alt=\"Video camera next to an open diary with a pen on a wooden desk\" src=\"assets/korero-button.jpg\" />`;
      addBtn.addEventListener('click', () => showCreate());
      addBody.appendChild(addBtn); addCard.appendChild(addBody);
      if (featuredEl) featuredEl.appendChild(addCard); else listEl.appendChild(addCard);
    }
  }

  // Submit handler
  form && form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = selType ? selType.value : 'story';
    const title = (postTitle?.value||'').trim();
    const text = (t==='story') ? (storyText.value||'').trim() : '';
    const url = (t==='vlog') ? (vlogUrl.value||'').trim() : '';
    if (t==='story' && !text) return alert('Tāuruhia he kōrero. / Enter a story.');
    if (t==='vlog' && !url) return alert('Whakaurua he hono ataata. / Enter a video URL.');
    listEl.setAttribute('aria-busy','true');
    try {
      await backend.addPost(t, title, text, url);
      form.reset(); if (selType) selType.value='story'; if (storyWrap && vlogWrap) { storyWrap.hidden=false; vlogWrap.hidden=true; }
      hideCreate();
      await refresh();
    } catch (err){
      if (String(err&&err.message).includes('login-required')) alert('Takiuru kia tuku. / Sign in to post.'); else { alert('Hapa tuku / Post error'); console.error(err); }
    } finally { listEl.setAttribute('aria-busy','false'); }
  });

  // Edit form submit
  if (editForm){
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!managePost) return;
      try {
        const title = (editTitleInput?.value||'').trim();
        if (managePost.type==='story'){
          const text = (editStoryText?.value||'').trim(); if (!text) return alert('Kōrero wātea kore.');
          await backend.updatePost(managePost.id, { title, text });
        } else {
          const mediaUrl = (editVlogUrl?.value||'').trim(); if (!mediaUrl) return alert('Tāuruhia te URL.');
          await backend.updatePost(managePost.id, { title, mediaUrl });
        }
        hideEdit(); await refresh();
      } catch(err){ alert('Hapa whakatika'); console.error(err); }
    });
  }
  if (deleteConfirmBtn){
    deleteConfirmBtn.addEventListener('click', async () => {
      if (!managePost) return; try { await backend.removePost(managePost.id); hideDelete(); await refresh(); } catch(err){ alert('Hapa muku'); console.error(err); }
    });
  }

  refresh();
})();
