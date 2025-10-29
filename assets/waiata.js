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

  if (!listEl && !kListEl) return; // not on this page

  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const esc = (s) => (s || '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[c]));

  // Backend adapter
  function createBackend(cfg){
    // Local fallback
    const KEY_W = 'waiataItems.v1';
    const KEY_K = 'karakiaDocs.v1';
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
        } else {
          const cur = await this.list();
          const next = cur.filter(x => x.id !== item.id);
          try { localStorage.setItem(KEY_W, JSON.stringify(next)); } catch {}
        }
      }
    };

    if (!cfg || cfg.type !== 'supabase' || typeof window.supabase === 'undefined') return local;

    // Supabase adapter
    const sb = window.supabase.createClient(cfg.url, cfg.anonKey);
    const bucket = cfg.bucket || 'waiata';
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
        const up = await sb.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
        if (up.error) throw up.error;
        const { data: pub } = sb.storage.from(bucket).getPublicUrl(path);
        const audio_url = pub.publicUrl;
        const ins = await sb.from('waiata_items').insert([{ id, type: 'audio', title, author, audio_url, storage_path: path }]);
        if (ins.error) { await sb.storage.from(bucket).remove([path]); throw ins.error; }
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
          await sb.storage.from(bucket).remove([item.storage_path]);
        }
        const del = await sb.from('waiata_items').delete().eq('id', item.id);
        if (del.error) throw del.error;
      }
    };
  }

  const backend = createBackend(window.WAIATA_BACKEND || { type: 'local' });

  // UI state/render
  let cache = [];
  let kcache = [];
  const setBusy = (b) => listEl.setAttribute('aria-busy', String(!!b));
  const fmtDate = (ts) => new Date(ts).toLocaleDateString();

  const refresh = async () => {
    setBusy(true);
    try {
      cache = await backend.list();
      render(searchEl ? searchEl.value.trim().toLowerCase() : '');
      renderShowcase();
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

      card.appendChild(body);
      frag.appendChild(card);
    }
    listEl.appendChild(frag);
  };

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

  // Initial load
  refresh();
  refreshK();
})();
