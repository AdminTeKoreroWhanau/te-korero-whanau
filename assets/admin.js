(function(){
  const msg = document.getElementById('admin-msg');
  const postList = document.getElementById('korero-admin-list');
  const postEmpty = document.getElementById('korero-admin-empty');
  const waiataList = document.getElementById('waiata-admin-list');
  const waiataEmpty = document.getElementById('waiata-admin-empty');
  const karakiaList = document.getElementById('karakia-admin-list');
  const karakiaEmpty = document.getElementById('karakia-admin-empty');

  const form = document.getElementById('admin-korero-form');
  const typeSel = document.getElementById('admin-post-type');
  const storyWrap = document.getElementById('admin-story-wrap');
  const vlogWrap = document.getElementById('admin-vlog-wrap');
  const storyText = document.getElementById('admin-story-text');
  const vlogUrl = document.getElementById('admin-vlog-url');

  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const esc = (s) => (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const fmt = (ts) => new Date(ts).toLocaleString();

  // Determine backend
  const wb = window.WAIATA_BACKEND || { type:'local' };
  const kb = window.KORERO_BACKEND || { type:'local' };
  const isSupa = (cfg) => cfg && cfg.type === 'supabase' && typeof window.supabase !== 'undefined';

  const sb = (window.sb || (isSupa(kb) ? window.supabase.createClient(kb.url, kb.anonKey) : null));
  const waiataBucket = wb.bucket || 'waiata';

  const localKeys = {
    WAIATA: 'waiataItems.v1',
    KARAKIA: 'karakiaDocs.v1',
    KORERO: 'korero.posts.v1',
    REACT: 'korero.reactions.v1',
  };

  const backend = {
    async listKorero(){
      if (!isSupa(kb)){
        try { return JSON.parse(localStorage.getItem(localKeys.KORERO)||'[]'); } catch { return []; }
      }
      const { data, error } = await sb.from('korero_posts').select('*').order('created_at', { ascending:false });
      if (error) { console.error(error); return []; }
      return (data||[]).map(r => ({ id:r.id, type:r.type, text:r.text||'', mediaUrl:r.media_url||'', createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now() }));
    },
    async addKorero(t, text, url){
      if (!isSupa(kb)){
        const cur = await this.listKorero();
        cur.unshift({ id: uid(), type:t, text:text||'', mediaUrl:url||'', createdAt: Date.now(), updatedAt: Date.now() });
        try { localStorage.setItem(localKeys.KORERO, JSON.stringify(cur)); } catch {}
        return;
      }
      const { data: sess } = await sb.auth.getSession();
      const user = sess.session?.user; if (!user) throw new Error('login-required');
      const payload = { id: uid(), type:t, text, media_url: (url||null), author_id: user.id };
      const { error } = await sb.from('korero_posts').insert([payload]);
      if (error) throw error;
    },
    async delKorero(id){
      if (!isSupa(kb)){
        const cur = await this.listKorero();
        const next = cur.filter(p => p.id !== id);
        try { localStorage.setItem(localKeys.KORERO, JSON.stringify(next)); } catch {}
        return;
      }
      await sb.from('korero_posts').delete().eq('id', id);
    },
    async listWaiata(){
      if (!isSupa(wb)){
        try { return JSON.parse(localStorage.getItem(localKeys.WAIATA)||'[]'); } catch { return []; }
      }
      const { data, error } = await sb.from('waiata_items').select('*').order('created_at', { ascending:false });
      if (error) { console.error(error); return []; }
      return (data||[]);
    },
    async delWaiata(item){
      if (!isSupa(wb)){
        const cur = await this.listWaiata();
        const next = cur.filter(x => x.id !== item.id);
        try { localStorage.setItem(localKeys.WAIATA, JSON.stringify(next)); } catch {}
        return;
      }
      if (item.storage_path){ await sb.storage.from(waiataBucket).remove([item.storage_path]); }
      await sb.from('waiata_items').delete().eq('id', item.id);
    },
    async listKarakia(){
      if (!isSupa(wb)){
        try { return JSON.parse(localStorage.getItem(localKeys.KARAKIA)||'[]'); } catch { return []; }
      }
      const { data, error } = await sb.from('waiata_items').select('*').eq('type','doc').order('created_at', { ascending:false });
      if (error) { console.error(error); return []; }
      return (data||[]);
    },
    async delKarakia(item){
      if (!isSupa(wb)){
        const cur = await this.listKarakia();
        const next = cur.filter(x => x.id !== item.id);
        try { localStorage.setItem(localKeys.KARAKIA, JSON.stringify(next)); } catch {}
        return;
      }
      if (item.storage_path){ await sb.storage.from(waiataBucket).remove([item.storage_path]); }
      await sb.from('waiata_items').delete().eq('id', item.id);
    }
  };

  function renderKorero(list){
    postList.innerHTML = '';
    const items = (list||[]).slice();
    if (!items.length){ postEmpty.style.display='block'; return; }
    postEmpty.style.display='none';
    const frag = document.createDocumentFragment();
    for (const p of items){
      const card = document.createElement('article'); card.className='card';
      const body = document.createElement('div'); body.className='card-body';
      const tag = p.type === 'vlog' ? 'Vlog' : 'Story';
      body.innerHTML = `<div><span class="tag">${tag}</span></div><div class="small muted">${fmt(p.createdAt||Date.now())}</div>` + (p.text?`<p>${esc(p.text)}</p>`:'');
      if (p.type==='vlog' && p.mediaUrl){ const a=document.createElement('a'); a.href=p.mediaUrl; a.target='_blank'; a.rel='noopener'; a.textContent='Open video'; body.appendChild(a); }
      const actions = document.createElement('div'); actions.className='actions';
      const del = document.createElement('button'); del.className='btn outline'; del.textContent='Muku / Delete'; del.addEventListener('click', async()=>{ if (!confirm('Delete this post?')) return; await backend.delKorero(p.id); await refresh(); });
      actions.appendChild(del); body.appendChild(actions);
      card.appendChild(body); frag.appendChild(card);
    }
    postList.appendChild(frag);
  }

  function renderGeneric(list, root, empty){
    root.innerHTML = '';
    if (!list || !list.length){ empty.style.display='block'; return; }
    empty.style.display='none';
    const frag = document.createDocumentFragment();
    for (const it of list){
      const card = document.createElement('article'); card.className='card';
      const body = document.createElement('div'); body.className='card-body';
      const title = it.title || it.filename || it.id;
      const ts = it.createdAt || (it.created_at ? new Date(it.created_at).getTime() : Date.now());
      body.innerHTML = `<h3>${esc(title)}</h3><div class="small muted">${fmt(ts)}</div>`;
      const actions = document.createElement('div'); actions.className='actions';
      const del = document.createElement('button'); del.className='btn outline'; del.textContent='Muku / Delete'; del.addEventListener('click', async()=>{ if (!confirm('Delete item?')) return; if (root===waiataList) await backend.delWaiata(it); else await backend.delKarakia(it); await refresh(); });
      actions.appendChild(del); body.appendChild(actions);
      card.appendChild(body); frag.appendChild(card);
    }
    root.appendChild(frag);
  }

  async function refresh(){
    postList.setAttribute('aria-busy','true'); waiataList.setAttribute('aria-busy','true'); karakiaList.setAttribute('aria-busy','true');
    try{
      const [kp, wi, kd] = await Promise.all([
        backend.listKorero(), backend.listWaiata(), backend.listKarakia()
      ]);
      renderKorero(kp);
      renderGeneric(wi, waiataList, waiataEmpty);
      renderGeneric(kd, karakiaList, karakiaEmpty);
    } finally {
      postList.setAttribute('aria-busy','false'); waiataList.setAttribute('aria-busy','false'); karakiaList.setAttribute('aria-busy','false');
    }
  }

  // type switch
  if (typeSel){
    const apply = () => { const isS = typeSel.value==='story'; storyWrap.hidden=!isS; vlogWrap.hidden=isS; if (isS) vlogUrl.value=''; else storyText.value=''; };
    typeSel.addEventListener('change', apply); apply();
  }

  form && form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = typeSel.value;
    const text = t==='story' ? (storyText.value||'').trim() : '';
    const url = t==='vlog' ? (vlogUrl.value||'').trim() : '';
    if (t==='story' && !text) return alert('Enter story text.');
    if (t==='vlog' && !url) return alert('Enter video URL.');
    try {
      await backend.addKorero(t, text, url);
      form.reset(); typeSel.value='story'; storyWrap.hidden=false; vlogWrap.hidden=true;
      await refresh();
    } catch (e){
      alert('Failed to add post. Make sure you are logged in and have admin rights.');
    }
  });

  // Admin gate message (best effort)
  (async function guard(){
    if (!sb) { msg.textContent = 'Local mode: admin panel available (no auth).'; refresh(); return; }
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user){ msg.textContent = 'Please login to access admin.'; return; }
    try {
      const emails = (window.ADMIN_EMAILS || []).map(e => String(e||'').toLowerCase());
      const byEmail = user.email && emails.includes(String(user.email).toLowerCase());
      const { data: row } = await sb.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
      if (!byEmail && !row){ msg.textContent = 'This account is not an admin.'; return; }
      msg.textContent = '';
      refresh();
    } catch { msg.textContent = 'Unable to verify admin. Ensure admin_users table exists or ADMIN_EMAILS is set.'; }
  })();
})();
