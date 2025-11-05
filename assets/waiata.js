// Waiata page logic with pluggable backend: local (default) or Supabase for sharing
(function(){
  // Waiata (audio/lyrics)
  const listEl = document.getElementById('waiata-list');
  const emptyEl = document.getElementById('waiata-empty');
  const searchEl = document.getElementById('waiata-search');
  // Karakia (documents)
  const kListEl = document.getElementById('karakia-list');
  const kEmptyEl = document.getElementById('karakia-empty');
  const kSearchEl = document.getElementById('karakia-search');
  const formKarakia = document.getElementById('form-karakia');

  // Tabs
  const tabAudio = document.getElementById('tab-audio');
  const tabLyrics = document.getElementById('tab-lyrics');
  const formAudio = document.getElementById('form-audio');
  const formLyrics = document.getElementById('form-lyrics');
  const formArt = document.getElementById('form-art');

  if (!listEl && !kListEl) return; // not on this page

  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const esc = (s) => (s || '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[c]));

  // Aroha animation with fireworks (same as Kōrero)
  function showArohaAnimation(x, y) {
    const popup = document.createElement('div');
    popup.className = 'aroha-popup';
    popup.textContent = 'Aroha!';
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 1200);
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
      const k = 'waiata.anonId';
      let v = localStorage.getItem(k);
      if (!v) { v = uid(); localStorage.setItem(k, v); }
      return v;
    } catch { return 'anon'; }
  }

  // Backend adapter (extended with local reactions/comments for waiata and art)
  function createBackend(cfg){
    // Local fallback
    const KEY_W = 'waiataItems.v1';
    const KEY_K = 'karakiaDocs.v1';
    const KEY_A = 'ngatoiItems.v1';
    const KEY_RW = 'waiata.reactions.v1';
    const KEY_CW = 'waiata.comments.v1';
    const KEY_RA = 'ngatoi.reactions.v1';
    const KEY_CA = 'ngatoi.comments.v1';
    const local = {
      async list(){ try { return JSON.parse(localStorage.getItem(KEY_W) || '[]'); } catch { return []; } },
      async listDocs(){ try { return JSON.parse(localStorage.getItem(KEY_K) || '[]'); } catch { return []; } },
      async addAudio(title, author, file){
        const dataUrl = await fileToDataURL(file);
        const item = { id: uid(), type: 'audio', title, author, createdAt: Date.now(), audio: dataUrl };
        const cur = await this.list(); cur.unshift(item);
        try { localStorage.setItem(KEY_W, JSON.stringify(cur)); } catch {}
      },
      async addLyrics(title, author, text){
        const item = { id: uid(), type: 'lyrics', title, author, createdAt: Date.now(), lyrics: text };
        const cur = await this.list(); cur.unshift(item);
        try { localStorage.setItem(KEY_W, JSON.stringify(cur)); } catch {}
      },
      async addDoc(title, author, file){
        const dataUrl = await fileToDataURL(file);
        const item = { id: uid(), type: 'doc', title, author, createdAt: Date.now(), file: dataUrl, filename: file.name, mime: file.type };
        const cur = await this.listDocs(); cur.unshift(item);
        try { localStorage.setItem(KEY_K, JSON.stringify(cur)); } catch {}
      },
      async remove(item){
        if (item.type === 'doc') {
          const cur = await this.listDocs();
          const next = cur.filter(x => x.id !== item.id);
          try { localStorage.setItem(KEY_K, JSON.stringify(next)); } catch {}
        } else if (item && (item.type === 'audio' || item.type === 'lyrics')) {
          const cur = await this.list();
          const next = cur.filter(x => x.id !== item.id);
          try { localStorage.setItem(KEY_W, JSON.stringify(next)); } catch {}
        } else if (item && item.type === 'art') {
          const cur = await this.listArt();
          const next = cur.filter(x => x.id !== item.id);
          try { localStorage.setItem(KEY_A, JSON.stringify(next)); } catch {}
        }
      },
      async listArt(){ try { return JSON.parse(localStorage.getItem(KEY_A) || '[]'); } catch { return []; } },
      async addArt(title, author, file){
        const dataUrl = await fileToDataURL(file);
        const item = { id: uid(), type: 'art', title, author, createdAt: Date.now(), image: dataUrl };
        const cur = await this.listArt(); cur.unshift(item);
        try { localStorage.setItem(KEY_A, JSON.stringify(cur)); } catch {}
      },
      async userId(){ return getAnonId(); },
      // Waiata reactions/comments
      async listWaiataReactions(){ try { return JSON.parse(localStorage.getItem(KEY_RW) || '[]'); } catch { return []; } },
      async toggleWaiataReaction(itemId, type){
        const userId = await this.userId();
        const cur = await this.listWaiataReactions();
        const i = cur.findIndex(r => r.itemId===itemId && r.userId===userId && r.type===type);
        if (i>=0) cur.splice(i,1); else cur.push({ id: uid(), itemId, userId, type, createdAt: Date.now() });
        try { localStorage.setItem(KEY_RW, JSON.stringify(cur)); } catch {}
      },
      async getWaiataReactionsMap(){
        const all = await this.listWaiataReactions();
        const map = new Map();
        for (const r of all){
          const m = map.get(r.itemId) || { aroha:0, mine:new Set() };
          if (r.type==='aroha') m.aroha++;
          m.mine.add(r.userId+':'+r.type);
          map.set(r.itemId, m);
        }
        return map;
      },
      async listWaiataComments(itemId){
        try { return (JSON.parse(localStorage.getItem(KEY_CW) || '[]') || []).filter(c => c.itemId===itemId); } catch { return []; }
      },
      async addWaiataComment(itemId, text){
        const userId = await this.userId();
        const rec = { id: uid(), itemId, userId, text, createdAt: Date.now() };
        let all = []; try { all = JSON.parse(localStorage.getItem(KEY_CW) || '[]') || []; } catch {}
        all.push(rec); try { localStorage.setItem(KEY_CW, JSON.stringify(all)); } catch {}
        return rec;
      },
      // Art reactions/comments (by image src key)
      async listArtReactions(){ try { return JSON.parse(localStorage.getItem(KEY_RA) || '[]'); } catch { return []; } },
      async toggleArtReaction(artId, type){
        const userId = await this.userId();
        const cur = await this.listArtReactions();
        const i = cur.findIndex(r => r.artId===artId && r.userId===userId && r.type===type);
        if (i>=0) cur.splice(i,1); else cur.push({ id: uid(), artId, userId, type, createdAt: Date.now() });
        try { localStorage.setItem(KEY_RA, JSON.stringify(cur)); } catch {}
      },
      async getArtReactionsMap(){
        const all = await this.listArtReactions();
        const map = new Map();
        for (const r of all){
          const m = map.get(r.artId) || { aroha:0, mine:new Set() };
          if (r.type==='aroha') m.aroha++;
          m.mine.add(r.userId+':'+r.type);
          map.set(r.artId, m);
        }
        return map;
      },
      async listArtComments(artId){
        try { return (JSON.parse(localStorage.getItem(KEY_CA) || '[]') || []).filter(c => c.artId===artId); } catch { return []; }
      },
      async addArtComment(artId, text){
        const userId = await this.userId();
        const rec = { id: uid(), artId, userId, text, createdAt: Date.now() };
        let all = []; try { all = JSON.parse(localStorage.getItem(KEY_CA) || '[]') || []; } catch {}
        all.push(rec); try { localStorage.setItem(KEY_CA, JSON.stringify(all)); } catch {}
        return rec;
      }
    };

    // Even if Supabase is configured for uploads, reactions/comments default to local for now
    if (!cfg || cfg.type !== 'supabase' || typeof window.supabase === 'undefined') return local;

    // Supabase adapter (uploads only)
    const sb = window.supabase.createClient(cfg.url, cfg.anonKey);
    const bucketW = cfg.bucket || 'waiata';
    const bucketArt = cfg.artBucket || 'ngatoi';
    return {
      async list(){
        const { data, error } = await sb.from('waiata_items').select('*').in('type',['audio','lyrics']).order('created_at', { ascending: false });
        if (error) { console.error(error); return []; }
        return (data || []).map(r => ({
          id: r.id,
          type: r.type,
          title: r.title,
          author: r.author,
          createdAt: new Date(r.created_at || Date.now()).getTime(),
          lyrics: r.lyrics || undefined,
          audio: r.audio_url || undefined,
          storage_path: r.storage_path || undefined
        }));
      },
      async addAudio(title, author, file){
        const id = uid();
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        const path = `${id}.${ext}`;
        const up = await sb.storage.from(bucketW).upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
        if (up.error) throw up.error;
        const { data: pub } = sb.storage.from(bucketW).getPublicUrl(path);
;
        const audio_url = pub.publicUrl;
        const ins = await sb.from('waiata_items').insert([{ id, type: 'audio', title, author, audio_url, storage_path: path }]);
        if (ins.error) { await sb.storage.from(bucketW).remove([path]); throw ins.error; }

      },
      async addLyrics(title, author, text){
        const id = uid();
        const ins = await sb.from('waiata_items').insert([{ id, type: 'lyrics', title, author, lyrics: text }]);
        if (ins.error) throw ins.error;
      },
      async listDocs(){
        const { data, error } = await sb.from('waiata_items').select('*').eq('type','doc').order('created_at', { ascending: false });
        if (error) { console.error(error); return []; }
        return (data || []).map(r => ({
          id: r.id,
          type: r.type,
          title: r.title,
          author: r.author,
          createdAt: new Date(r.created_at || Date.now()).getTime(),
          file: r.file_url || r.audio_url || undefined,
          filename: r.filename || undefined,
          storage_path: r.storage_path || undefined
        }));
      },
      async addDoc(title, author, file){
        const id = uid();
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        const path = `${id}.${ext}`;
        const up = await sb.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
        if (up.error) throw up.error;
        const { data: pub } = sb.storage.from(bucket).getPublicUrl(path);
        const file_url = pub.publicUrl;
        const ins = await sb.from('waiata_items').insert([{ id, type: 'doc', title, author, file_url, filename: file.name, storage_path: path }]);
        if (ins.error) { await sb.storage.from(bucket).remove([path]); throw ins.error; }
      },
      async remove(item){
        if (item.type === 'audio' && item.storage_path) {
          await sb.storage.from(bucketW).remove([item.storage_path]);
        }
        const del = await sb.from('waiata_items').delete().eq('id', item.id);
        if (del.error) throw del.error;
      },
      // Art gallery items (Supabase)
      async listArt(){
        const { data, error } = await sb.from('ngatoi_items').select('*').order('created_at', { ascending: false });
        if (error) { console.error(error); return []; }
        return (data||[]).map(r => ({ id:r.id, type:'art', title:r.title||'', author:r.author||'', createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(), image: r.image_url||'', storage_path: r.storage_path||null }));
      },
      async addArt(title, author, file){
        const id = uid();
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${id}.${ext}`;
        const up = await sb.storage.from(bucketArt).upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
        if (up.error) throw up.error;
        const { data: pub } = sb.storage.from(bucketArt).getPublicUrl(path);
        const image_url = pub.publicUrl;
        const ins = await sb.from('ngatoi_items').insert([{ id, title, author, image_url, storage_path: path }]);
        if (ins.error) { await sb.storage.from(bucketArt).remove([path]); throw ins.error; }
      },
      // Reactions/comments for art via Supabase
      async userId(){ const { data } = await sb.auth.getSession(); return data.session?.user?.id || ''; },
      async listArtReactions(){ const { data, error } = await sb.from('ngatoi_reactions').select('*'); if (error){ console.error(error); return []; } return data||[]; },
      async toggleArtReaction(artId, type){
        const { data } = await sb.auth.getSession(); const user = data.session?.user; if (!user) throw new Error('login-required');
        const { data: exists, error: selErr } = await sb.from('ngatoi_reactions').select('id').eq('art_id', artId).eq('user_id', user.id).eq('type', type).maybeSingle();
        if (selErr && selErr.code !== 'PGRST116') console.error(selErr);
        if (exists && exists.id){ await sb.from('ngatoi_reactions').delete().eq('id', exists.id); }
        else {
          const rec = { id: uid(), art_id: artId, user_id: user.id, type };
          const { error } = await sb.from('ngatoi_reactions').insert([rec]); if (error) throw error;
        }
      },
      async getArtReactionsMap(){
        const { data, error } = await sb.from('ngatoi_reactions').select('*');
        if (error) { console.error(error); return new Map(); }
        const map = new Map();
        for (const r of (data||[])){
          const artId = r.art_id; const type = r.type;
          const m = map.get(artId) || { aroha:0, mine: new Set() };
          if (type==='aroha') m.aroha++;
          m.mine.add((r.user_id||'')+':'+type);
          map.set(artId, m);
        }
        return map;
      },
      async listArtComments(artId){
        const { data, error } = await sb.from('ngatoi_comments').select('*').eq('art_id', artId).order('created_at', { ascending: true });
        if (error) { console.error(error); return []; }
        return data || [];
      },
      async addArtComment(artId, text){
        const { data } = await sb.auth.getSession(); const user = data.session?.user; if (!user) throw new Error('login-required');
        const rec = { id: uid(), art_id: artId, user_id: user.id, text };
        const { error } = await sb.from('ngatoi_comments').insert([rec]); if (error) throw error;
      }
    };
  }

  const backend = createBackend(window.WAIATA_BACKEND || { type: 'local' });

  // UI state/render
  let cache = [];
  let kcache = [];
  let reactMapW = new Map();
  let currentUserId = '';
  let artCache = [];
  const setBusy = (b) => listEl.setAttribute('aria-busy', String(!!b));
  const fmtDate = (ts) => new Date(ts).toLocaleDateString();

  const refresh = async () => {
    setBusy(true);
    try {
      cache = await backend.list();
      try { currentUserId = await backend.userId(); } catch { currentUserId = ''; }
      try { reactMapW = await backend.getWaiataReactionsMap(); } catch { reactMapW = new Map(); }
      render(searchEl ? searchEl.value.trim().toLowerCase() : '');
      renderShowcase();
      await refreshArt();
      setupArtUI();
    } finally { setBusy(false); }
  };

  const render = (q='') => {
    const items = cache
      .slice()
      .sort((a,b) => b.createdAt - a.createdAt)
      .filter(item => {
        if (!q) return true;
        const hay = `${item.title}\n${item.author||''}\n${item.lyrics||''}`.toLowerCase();
        return hay.includes(q);
      });
    listEl.innerHTML = '';
    if (!items.length) {
      emptyEl && (emptyEl.style.display = 'block');
      return;
    }
    emptyEl && (emptyEl.style.display = 'none');

    const frag = document.createDocumentFragment();
    for (const it of items) {
      const card = document.createElement('article');
      card.className = 'card';

      const body = document.createElement('div');
      body.className = 'card-body';
      body.innerHTML = `
        <h3>${esc(it.title)}</h3>
        <div class=\"small muted\">${esc(it.author||'')}${it.author?' • ':''}${fmtDate(it.createdAt)}</div>
      `;

      if (it.type === 'audio' && it.audio) {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = it.audio;
        audio.style.width = '100%';
        body.appendChild(audio);
      }
      if (it.type === 'lyrics' && it.lyrics) {
        const pre = document.createElement('pre');
        pre.textContent = it.lyrics;
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.margin = '.25rem 0 0';
        body.appendChild(pre);
      }

      const actions = document.createElement('div');
      actions.className = 'actions';

      // Aroha react button (like Kōrero)
      const r = reactMapW.get(it.id) || { aroha:0, mine:new Set() };
      const btnAroha = document.createElement('button'); btnAroha.type='button'; btnAroha.className='btn outline';
      const markMine = () => { const mine = r.mine && currentUserId ? r.mine.has(currentUserId+':aroha') : false; btnAroha.classList.toggle('active', !!mine); };
      btnAroha.innerHTML = `<span class="emoji">💛</span> ${r.aroha||0}`;
      btnAroha.addEventListener('click', async () => {
        const rect = btnAroha.getBoundingClientRect();
        showArohaAnimation(rect.left + rect.width/2, rect.top + rect.height/2);
        try { await backend.toggleWaiataReaction(it.id, 'aroha'); await refresh(); } catch (e){ alert('Hapa urupare / Reaction error'); }
      });
      actions.appendChild(btnAroha);

      // Comment toggle
      const btnComment = document.createElement('button'); btnComment.type='button'; btnComment.className='btn outline'; btnComment.textContent='Kōrero / Comment';
      const commentWrap = document.createElement('div'); commentWrap.style.marginTop = '.5rem'; commentWrap.hidden = true;
      btnComment.addEventListener('click', async () => {
        commentWrap.hidden = !commentWrap.hidden; if (!commentWrap.hidden) await renderComments(it.id, commentWrap, 'waiata');
      });
      actions.appendChild(btnComment);

      // Owner delete
      const del = document.createElement('button');
      del.className = 'btn-link';
      del.type = 'button';
      del.textContent = 'Muku / Delete';
      del.addEventListener('click', async () => {
        if (!confirm('Muku tēnei tāuru? / Delete this entry?')) return;
        setBusy(true);
        try { await backend.remove(it); await refresh(); } finally { setBusy(false); }
      });
      actions.appendChild(del);
      body.appendChild(actions);
      body.appendChild(commentWrap);

      card.appendChild(body);
      frag.appendChild(card);
      markMine();
    }
    listEl.appendChild(frag);
  };

  async function renderComments(id, container, kind){
    container.innerHTML = '';
    const list = document.createElement('div'); list.className='comments-list';
    const items = kind==='waiata' ? await backend.listWaiataComments(id) : await backend.listArtComments(id);
    if (items && items.length){
      for (const c of items.sort((a,b)=>a.createdAt-b.createdAt)){
        const p = document.createElement('p'); p.className='small'; p.style.margin='.25rem 0';
        p.textContent = c.text; list.appendChild(p);
      }
    }
    const form = document.createElement('form'); form.className='form'; form.style.marginTop='.25rem';
    const ta = document.createElement('textarea'); ta.rows = 2; ta.placeholder = 'Tāuruhia tētahi kōrero / Write a comment';
    const submit = document.createElement('button'); submit.type='submit'; submit.className='btn'; submit.textContent='Tāpiri / Add';
    form.appendChild(ta); form.appendChild(submit);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const text = (ta.value||'').trim(); if (!text) return;
      try { if (kind==='waiata') await backend.addWaiataComment(id, text); else await backend.addArtComment(id, text); ta.value=''; await renderComments(id, container, kind); } catch { alert('Hapa kōrero / Comment error'); }
    });
    container.appendChild(list); container.appendChild(form);
  }

  async function refreshArt(){
    try { artCache = (await (backend.listArt ? backend.listArt() : [])) || []; renderArtGallery(); }
    catch(e){ console.error(e); }
  }
  function renderArtGallery(){
    const gallery = document.querySelector('#nga-toi .gallery'); if (!gallery) return;
    // remove previously rendered dynamic figures
    Array.from(gallery.querySelectorAll('figure[data-art-id]')).forEach(el => el.remove());
    if (!artCache.length) return;
    const frag = document.createDocumentFragment();
    for (const it of artCache){
      const fig = document.createElement('figure'); fig.setAttribute('data-art-id', it.id);
      const img = document.createElement('img'); img.loading='lazy'; img.decoding='async'; img.alt = it.title || 'Whakaahua'; img.src = it.image;
      const cap = document.createElement('figcaption'); cap.textContent = it.title || '';
      fig.appendChild(img); fig.appendChild(cap); frag.appendChild(fig);
    }
    gallery.appendChild(frag);
  }

  // Search
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      const q = searchEl.value.trim().toLowerCase();
      render(q);
    });
  }

  // Tabs switching
  const activateTab = (kind) => {
    // If tabs are not present, do nothing (both forms visible)
    if (!tabAudio || !tabLyrics || !formAudio || !formLyrics) return;
    const audioActive = kind === 'audio';
    tabAudio.setAttribute('aria-selected', String(audioActive));
    tabLyrics.setAttribute('aria-selected', String(!audioActive));
    tabAudio.classList.toggle('active', audioActive);
    tabLyrics.classList.toggle('active', !audioActive);
    formAudio.hidden = !audioActive; formAudio.setAttribute('aria-hidden', String(!audioActive));
    formLyrics.hidden = audioActive; formLyrics.setAttribute('aria-hidden', String(audioActive));
  };
  tabAudio && tabAudio.addEventListener('click', () => activateTab('audio'));
  tabLyrics && tabLyrics.addEventListener('click', () => activateTab('lyrics'));

  // Upload handlers
  formAudio && formAudio.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('audio-title').value.trim();
    const author = document.getElementById('audio-author').value.trim();
    const fileEl = document.getElementById('audio-file');
    const file = fileEl && fileEl.files && fileEl.files[0];
    if (!title || !file) return alert('Whakaurua te taitara me te kōnae.');
    if (!file.type.startsWith('audio/')) return alert('Kōnae oro anake.');
    setBusy(true);
    try {
      await backend.addAudio(title, author, file);
      formAudio.reset();
      activateTab('audio');
      await refresh();
    } catch (e) {
      alert('Hapa tuku / Upload error'); console.error(e);
    } finally { setBusy(false); }
  });

  formLyrics && formLyrics.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('lyrics-title').value.trim();
    const author = document.getElementById('lyrics-author').value.trim();
    const text = document.getElementById('lyrics-text').value.trim();
    if (!title || !text) return alert('Whakaurua te taitara me ngā kupu.');
    setBusy(true);
    try {
      await backend.addLyrics(title, author, text);
      formLyrics.reset();
      activateTab('lyrics');
      await refresh();
    } catch (e) {
      alert('Hapa tuku / Upload error'); console.error(e);
    } finally { setBusy(false); }
  });

  function fileToDataURL(file){
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = () => rej(new Error('pānui kōnae hē'));
      fr.onload = () => res(String(fr.result));
      fr.readAsDataURL(file);
    });
  }

  // Karakia search
  if (kSearchEl) {
    kSearchEl.addEventListener('input', () => {
      const q = kSearchEl.value.trim().toLowerCase();
      renderK(q);
    });
  }

  // Art upload (gallery)
  formArt && formArt.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('art-title').value.trim();
    const author = document.getElementById('art-author').value.trim();
    const fileEl = document.getElementById('art-file');
    const file = fileEl && fileEl.files && fileEl.files[0];
    if (!title || !file) return alert('Whakaurua te taitara me te kōnae.');
    if (!file.type.startsWith('image/')) return alert('He whakaahua anake.');
    setBusy(true);
    try {
      await backend.addArt(title, author, file);
      formArt.reset();
      await refreshArt();
      setupArtUI();
    } catch (e) {
      alert('Hapa tuku / Upload error'); console.error(e);
    } finally { setBusy(false); }
  });

  // Karakia upload
  formKarakia && formKarakia.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('karakia-title').value.trim();
    const author = document.getElementById('karakia-author').value.trim();
    const fileEl = document.getElementById('karakia-file');
    const file = fileEl && fileEl.files && fileEl.files[0];
    if (!title || !file) return alert('Whakaurua te taitara me te kōnae.');
    setBusy(true);
    try {
      await backend.addDoc(title, author, file);
      formKarakia.reset();
      await refreshK();
    } catch (e) {
      alert('Hapa tuku / Upload error'); console.error(e);
    } finally { setBusy(false); }
  });

  // Karakia render/refresh
  const refreshK = async () => {
    if (!kListEl) return;
    setBusy(true);
    try { kcache = (await (backend.listDocs ? backend.listDocs() : [])) || []; renderK(kSearchEl ? kSearchEl.value.trim().toLowerCase() : ''); }
    finally { setBusy(false); }
  };
  const renderK = (q='') => {
    if (!kListEl) return;
    const items = kcache.slice().sort((a,b)=>b.createdAt-a.createdAt).filter(it => {
      if (!q) return true; const hay = `${it.title}\n${it.author||''}`.toLowerCase(); return hay.includes(q);
    });
    kListEl.innerHTML = '';
    if (!items.length) { kEmptyEl && (kEmptyEl.style.display='block'); return; }
    kEmptyEl && (kEmptyEl.style.display='none');
    const frag = document.createDocumentFragment();
    for (const it of items) {
      const card = document.createElement('article'); card.className='card';
      const body = document.createElement('div'); body.className='card-body';
      const name = esc(it.filename||'tuku kōnae');
      body.innerHTML = `
        <h3>${esc(it.title)}</h3>
        <div class=\"small muted\">${esc(it.author||'')}${it.author?' • ':''}${new Date(it.createdAt).toLocaleDateString()}</div>
        <a class=\"btn outline\" href=\"${it.file}\" target=\"_blank\" rel=\"noopener noreferrer\">Tikiake / Open: ${name}</a>
      `;
      const actions = document.createElement('div'); actions.className='actions';
      const del = document.createElement('button'); del.className='btn-link'; del.type='button'; del.textContent='Muku / Delete';
      del.addEventListener('click', async () => {
        if (!confirm('Muku tēnei kōnae? / Delete this document?')) return;
        setBusy(true); try { await backend.remove(it); await refreshK(); } finally { setBusy(false); }
      });
      actions.appendChild(del); body.appendChild(actions);
      card.appendChild(body); frag.appendChild(card);
    }
    kListEl.appendChild(frag);
  };

  // Slideshow (waiata)
  function setupSlider(rootId){
    const root = document.getElementById(rootId);
    if (!root) return () => {};
    const slides = root.querySelector('.slides');
    const dots = root.querySelector('.slide-dots');
    const prev = root.querySelector('button[id$="prev"]');
    const next = root.querySelector('button[id$="next"]');
    let i = 0; let n = slides.children.length;
    const update = () => { slides.style.transform = `translateX(-${i*100}%)`; if (dots){ [...dots.children].forEach((d,idx)=>d.classList.toggle('active', idx===i)); } };
    const setN = () => { n = slides.children.length; if (dots){ dots.innerHTML = ''; for (let k=0;k<n;k++){ const b=document.createElement('button'); if (k===i) b.classList.add('active'); b.addEventListener('click', ()=>{ i=k; update(); }); dots.appendChild(b);} } update(); };
    prev && prev.addEventListener('click', ()=>{ i = (i-1+n)%n; update(); });
    next && next.addEventListener('click', ()=>{ i = (i+1)%n; update(); });
    return setN;
  }
  const applyWaiataSliderCount = setupSlider('waiata-slideshow');

  function renderShowcase(){
    const container = document.getElementById('waiata-slides'); if (!container) return;
    const items = cache.slice(0,5);
    if (!items.length) { if (applyWaiataSliderCount) applyWaiataSliderCount(); return; }
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const it of items){
      const slide = document.createElement('div'); slide.className='slide';
      const art = document.createElement('article'); art.className='card';
      const body = document.createElement('div'); body.className='card-body';
      const tag = it.type === 'audio' ? 'Audio' : 'Lyrics';
      body.innerHTML = `<div><span class=\"tag\">${tag}</span></div><h3>${esc(it.title)}</h3><p class=\"meta\">${esc(it.author||'')}</p>`;
      if (it.type === 'lyrics' && it.lyrics){
        const p = document.createElement('p'); p.className='muted small'; p.textContent = it.lyrics.slice(0,120) + (it.lyrics.length>120?'…':''); body.appendChild(p);
      }
      art.appendChild(body); slide.appendChild(art); frag.appendChild(slide);
    }
    container.appendChild(frag);
    if (applyWaiataSliderCount) applyWaiataSliderCount();
  }

  // Reactions/comments for art gallery images
  async function setupArtUI(){
    const gallery = document.querySelector('#nga-toi .gallery');
    if (!gallery) return;
    let artMap = new Map();
    try { artMap = await backend.getArtReactionsMap(); } catch { artMap = new Map(); }
    const figs = Array.from(gallery.querySelectorAll('figure'));
    for (const fig of figs){
      if (fig.__hasReact) continue; // init once
      fig.__hasReact = true;
      const img = fig.querySelector('img'); const cap = fig.querySelector('figcaption');
      const artId = (img && (img.currentSrc || img.src)) || (cap && cap.textContent) || uid();
      const actions = document.createElement('div'); actions.className='actions'; actions.style.marginTop='.25rem';
      const r = artMap.get(artId) || { aroha:0, mine:new Set() };
      const btnA = document.createElement('button'); btnA.type='button'; btnA.className='btn outline'; btnA.innerHTML = `<span class="emoji">💛</span> ${r.aroha||0}`;
      btnA.addEventListener('click', async () => {
        const rect = btnA.getBoundingClientRect();
        showArohaAnimation(rect.left + rect.width/2, rect.top + rect.height/2);
        try { await backend.toggleArtReaction(artId, 'aroha'); const m = await backend.getArtReactionsMap(); const rr = m.get(artId) || { aroha:0 }; btnA.innerHTML = `<span class="emoji">💛</span> ${rr.aroha||0}`; } catch {}
      });
      const btnC = document.createElement('button'); btnC.type='button'; btnC.className='btn outline'; btnC.textContent='Kōrero / Comment';
      const wrap = document.createElement('div'); wrap.style.marginTop='.25rem'; wrap.hidden = true;
      btnC.addEventListener('click', async () => { wrap.hidden = !wrap.hidden; if (!wrap.hidden) await renderComments(artId, wrap, 'art'); });
      actions.appendChild(btnA); actions.appendChild(btnC);
      fig.appendChild(actions); fig.appendChild(wrap);
    }
  }

  // Initial load
  refresh();
  refreshK();
})();
