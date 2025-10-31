(function(){
  const listEl = document.getElementById('korero-list');
  const emptyEl = document.getElementById('korero-empty');
  const form = document.getElementById('korero-form');
  const selType = document.getElementById('post-type');
  const storyWrap = document.getElementById('story-wrap');
  const vlogWrap = document.getElementById('vlog-wrap');
  const storyText = document.getElementById('story-text');
  const vlogUrl = document.getElementById('vlog-url');
  // Modal elements for create
  const createOpenBtn = document.getElementById('open-korero-modal');
  const createModal = document.getElementById('korero-modal');
  const createCloseBtn = document.getElementById('korero-modal-close');
  const createCancelBtn = document.getElementById('korero-cancel');
  if (!listEl) return;

  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const esc = (s) => (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const fmtTS = (ts) => new Date(ts).toLocaleString();

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
      async addPost(type, text, mediaUrl, authorId){
        const p = { id: uid(), type, text: text || '', mediaUrl: mediaUrl || '', authorId: authorId || getAnonId(), createdAt: Date.now(), updatedAt: Date.now() };
        const cur = await this.listPosts(); cur.unshift(p);
        try { localStorage.setItem(KEY_P, JSON.stringify(cur)); } catch {}
        return p;
      },
      async updatePost(id, fields){
        const cur = await this.listPosts();
        const i = cur.findIndex(p => p.id === id);
        if (i >= 0) {
          const next = { ...cur[i], ...('text' in fields ? { text: fields.text } : {}), ...('mediaUrl' in fields ? { mediaUrl: fields.mediaUrl } : {}), updatedAt: Date.now() };
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
          text: r.text || '',
          mediaUrl: r.media_url || '',
          authorId: r.author_id || '',
          createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
          updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : undefined
        }));
      },
      async addPost(type, text, mediaUrl){
        const { data: sess } = await sb.auth.getSession();
        const user = sess.session?.user; if (!user) throw new Error('login-required');
        const payload = { id: uid(), type, text, media_url: mediaUrl || null, author_id: user.id };
        const { error } = await sb.from('korero_posts').insert([payload]);
        if (error) throw error;
        return { id: payload.id, type, text, mediaUrl: payload.media_url||'', authorId: payload.author_id, createdAt: Date.now() };
      },
      async updatePost(id, fields){
        const patch = {};
        if (typeof fields.text === 'string') patch.text = fields.text;
        if (typeof fields.mediaUrl === 'string') patch.media_url = fields.mediaUrl;
        patch.updated_at = new Date().toISOString();
        const { error } = await sb.from('korero_posts').update(patch).eq('id', id);
        if (error) throw error;
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
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCreate(); });

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
    listEl.innerHTML = '';
    const items = cache.slice().sort((a,b)=>b.createdAt-a.createdAt);
    if (!items.length){ emptyEl && (emptyEl.style.display='block'); } else { emptyEl && (emptyEl.style.display='none'); }
    const frag = document.createDocumentFragment();

    // Add button as first card (left)
    const addCard = document.createElement('article'); addCard.className='card add-card';
    const addBody = document.createElement('div'); addBody.className='card-body';
    const addBtn = document.createElement('button'); addBtn.type='button'; addBtn.className='image-btn'; addBtn.setAttribute('aria-label','Add a story or vlog');
    addBtn.innerHTML = `<img class=\"image-btn-img\" loading=\"lazy\" decoding=\"async\" alt=\"Video camera next to an open diary with a pen on a wooden desk\" src=\"assets/korero-button.jpg\" />`;
    addBtn.addEventListener('click', () => showCreate());
    addBody.appendChild(addBtn); addCard.appendChild(addBody); frag.appendChild(addCard);

    for (const p of items){
      const card = document.createElement('article'); card.className='card';
      const body = document.createElement('div'); body.className='card-body';
      const tag = p.type === 'vlog' ? 'Vlog' : 'Story';
      body.innerHTML = `<div><span class=\"tag\">${tag}</span></div>` +
        `<div class=\"small muted\">${fmtTS(p.createdAt)}</div>`;

      if (p.type === 'story' && p.text){
        const pre = document.createElement('p'); pre.textContent = p.text; pre.style.whiteSpace='pre-wrap'; pre.style.margin='.5rem 0 0'; body.appendChild(pre);
      }
      if (p.type === 'vlog' && p.mediaUrl){
        const url = p.mediaUrl.trim();
        // Try YouTube embed
        const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/i);
        if (yt){
          const iframe = document.createElement('iframe');
          iframe.width = '560'; iframe.height = '315'; iframe.loading = 'lazy';
          iframe.src = `https://www.youtube.com/embed/${yt[1]}`; iframe.title='YouTube video'; iframe.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'; iframe.allowFullscreen = true;
          iframe.style.width='100%'; iframe.style.aspectRatio='16/9'; iframe.style.border='0';
          body.appendChild(iframe);
        } else {
          const a = document.createElement('a'); a.href = url; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent = 'Open video'; body.appendChild(a);
        }
      }

      // Reactions
      const r = reactMap.get(p.id) || { like:0, aroha:0, mine: new Set() };
      const actions = document.createElement('div'); actions.className='actions';
      const btnLike = document.createElement('button'); btnLike.type='button'; btnLike.className='btn outline';
      const btnAroha = document.createElement('button'); btnAroha.type='button'; btnAroha.className='btn outline';
      const markMine = () => {
        const mineLike = r.mine.has(currentUserId+':like');
        const mineAroha = r.mine.has(currentUserId+':aroha');
        btnLike.classList.toggle('active', !!mineLike);
        btnAroha.classList.toggle('active', !!mineAroha);
      };
      btnLike.textContent = `👍 ${r.like||0}`;
      btnAroha.textContent = `💛 ${r.aroha||0}`;
      btnLike.addEventListener('click', async () => { try { await backend.toggleReaction(p.id, 'like'); await refresh(); } catch (e){ if (String(e&&e.message).includes('login-required')) alert('Takiuru kia urupare. / Sign in to react.'); } });
      btnAroha.addEventListener('click', async () => { try { await backend.toggleReaction(p.id, 'aroha'); await refresh(); } catch (e){ if (String(e&&e.message).includes('login-required')) alert('Takiuru kia urupare. / Sign in to react.'); } });
      actions.appendChild(btnLike); actions.appendChild(btnAroha);

      // Owner actions (edit/delete)
      const isOwner = p.authorId && currentUserId && p.authorId === currentUserId;
      if (isOwner){
        const gap = document.createElement('span'); gap.style.flex='1'; actions.appendChild(gap);
        const btnEdit = document.createElement('button'); btnEdit.type='button'; btnEdit.className='btn'; btnEdit.textContent='Whakatika / Edit';
        btnEdit.addEventListener('click', async () => {
          try {
            if (p.type === 'story'){
              const val = prompt('Whakatika kōrero / Edit story', p.text || '');
              if (val == null) return; // cancelled
              const text = String(val).trim();
              if (!text) return alert('Koa, kaua e waiho kia koretake. / Text cannot be empty.');
              await backend.updatePost(p.id, { text });
            } else if (p.type === 'vlog'){
              const val = prompt('Whakatika hono vlog / Edit vlog URL', p.mediaUrl || '');
              if (val == null) return;
              const mediaUrl = String(val).trim();
              if (!mediaUrl) return alert('Whakaurua he hono tika. / URL cannot be empty.');
              await backend.updatePost(p.id, { mediaUrl });
            }
            await refresh();
          } catch (e){
            alert('Hapa whakatika / Edit error'); console.error(e);
          }
        });
        const btnDel = document.createElement('button'); btnDel.type='button'; btnDel.className='btn danger outline'; btnDel.textContent='Muku / Delete';
        btnDel.addEventListener('click', async () => {
          if (!confirm('Muku tēnei tāurunga? / Delete this post?')) return;
          try { await backend.removePost(p.id); await refresh(); } catch(e){ alert('Hapa muku / Delete error'); console.error(e); }
        });
        actions.appendChild(btnEdit); actions.appendChild(btnDel);
      }

      body.appendChild(actions);
      markMine();

      card.appendChild(body); frag.appendChild(card);
    }
    listEl.appendChild(frag);
  }

  // Submit handler
  form && form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = selType ? selType.value : 'story';
    const text = (t==='story') ? (storyText.value||'').trim() : '';
    const url = (t==='vlog') ? (vlogUrl.value||'').trim() : '';
    if (t==='story' && !text) return alert('Tāuruhia he kōrero. / Enter a story.');
    if (t==='vlog' && !url) return alert('Whakaurua he hono ataata. / Enter a video URL.');
    listEl.setAttribute('aria-busy','true');
    try {
      await backend.addPost(t, text, url);
      form.reset(); if (selType) selType.value='story'; if (storyWrap && vlogWrap) { storyWrap.hidden=false; vlogWrap.hidden=true; }
      hideCreate();
      await refresh();
    } catch (err){
      if (String(err&&err.message).includes('login-required')) alert('Takiuru kia tuku. / Sign in to post.'); else { alert('Hapa tuku / Post error'); console.error(err); }
    } finally { listEl.setAttribute('aria-busy','false'); }
  });

  refresh();
})();
