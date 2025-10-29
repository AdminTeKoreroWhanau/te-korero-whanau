// Karakia page logic: upload and browse documents with optional Supabase sharing
(function(){
  const kListEl = document.getElementById('karakia-list');
  const kEmptyEl = document.getElementById('karakia-empty');
  const kSearchEl = document.getElementById('karakia-search');
  const formKarakia = document.getElementById('form-karakia');
  if (!kListEl) return;

  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const esc = (s) => (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));

  function createBackend(cfg){
    const KEY_K = 'karakiaDocs.v1';
    const local = {
      async listDocs(){ try { return JSON.parse(localStorage.getItem(KEY_K) || '[]'); } catch { return []; } },
      async addDoc(title, author, file){
        const dataUrl = await fileToDataURL(file);
        const item = { id: uid(), type: 'doc', title, author, createdAt: Date.now(), file: dataUrl, filename: file.name, mime: file.type };
        const cur = await this.listDocs(); cur.unshift(item);
        try { localStorage.setItem(KEY_K, JSON.stringify(cur)); } catch {}
      },
      async remove(item){
        const cur = await this.listDocs();
        const next = cur.filter(x => x.id !== item.id);
        try { localStorage.setItem(KEY_K, JSON.stringify(next)); } catch {}
      }
    };

    if (!cfg || cfg.type !== 'supabase' || typeof window.supabase === 'undefined') return local;

    const sb = window.supabase.createClient(cfg.url, cfg.anonKey);
    const bucket = cfg.bucket || 'waiata';
    return {
      async listDocs(){
        const { data, error } = await sb.from('waiata_items').select('*').eq('type','doc').order('created_at', { ascending: false });
        if (error) { console.error(error); return []; }
        return (data || []).map(r => ({
          id: r.id,
          type: r.type,
          title: r.title,
          author: r.author,
          createdAt: new Date(r.created_at || Date.now()).getTime(),
          file: r.file_url || undefined,
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
        if (item.storage_path) await sb.storage.from(bucket).remove([item.storage_path]);
        const del = await sb.from('waiata_items').delete().eq('id', item.id);
        if (del.error) throw del.error;
      }
    };
  }

  const backend = createBackend(window.WAIATA_BACKEND || { type: 'local' });

  let kcache = [];
  const setBusy = (b) => kListEl.setAttribute('aria-busy', String(!!b));

  const refreshK = async () => {
    setBusy(true);
    try { kcache = (await backend.listDocs()) || []; renderK(kSearchEl ? kSearchEl.value.trim().toLowerCase() : ''); renderShowcaseK(); }
    finally { setBusy(false); }
  };

  const renderK = (q='') => {
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
      const name = esc(it.filename||'kōnae');
      body.innerHTML = `
        <h3>${esc(it.title)}</h3>
        <div class="small muted">${esc(it.author||'')}</div>
        <a class="btn outline" href="${it.file}" target="_blank" rel="noopener noreferrer">Tikiake / Open: ${name}</a>
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

  if (kSearchEl) kSearchEl.addEventListener('input', () => renderK(kSearchEl.value.trim().toLowerCase()));

  formKarakia && formKarakia.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('karakia-title').value.trim();
    const author = document.getElementById('karakia-author').value.trim();
    const fileEl = document.getElementById('karakia-file');
    const file = fileEl && fileEl.files && fileEl.files[0];
    if (!title || !file) return alert('Whakaurua te taitara me te kōnae.');
    setBusy(true);
    try { await backend.addDoc(title, author, file); formKarakia.reset(); await refreshK(); }
    catch (e) { alert('Hapa tuku / Upload error'); console.error(e); }
    finally { setBusy(false); }
  });

  function fileToDataURL(file){
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = () => rej(new Error('pānui kōnae hē'));
      fr.onload = () => res(String(fr.result));
      fr.readAsDataURL(file);
    });
  }

  // Slideshow (karakia)
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
  const applyKSliderCount = setupSlider('karakia-slideshow');

  function renderShowcaseK(){
    const container = document.getElementById('karakia-slides'); if (!container) return;
    const items = kcache.slice(0,5);
    if (!items.length) { if (applyKSliderCount) applyKSliderCount(); return; }
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const it of items){
      const slide = document.createElement('div'); slide.className='slide';
      const art = document.createElement('article'); art.className='card';
      const body = document.createElement('div'); body.className='card-body';
      body.innerHTML = `<div><span class=\"tag\">Doc</span></div><h3>${esc(it.title)}</h3><p class=\"meta\">${esc(it.author||'')}</p>`;
      const a = document.createElement('a'); a.className='btn outline'; a.href = it.file; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent = `Tikiake / Open: ${esc(it.filename||'kōnae')}`;
      body.appendChild(a);
      art.appendChild(body); slide.appendChild(art); frag.appendChild(slide);
    }
    container.appendChild(frag);
    if (applyKSliderCount) applyKSliderCount();
  }

  refreshK();
})();
