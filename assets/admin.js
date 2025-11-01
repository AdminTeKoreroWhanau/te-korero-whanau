(function(){
  const msg = document.getElementById('admin-msg');
  const postList = document.getElementById('korero-admin-list');
  const postEmpty = document.getElementById('korero-admin-empty');
  const waiataList = document.getElementById('waiata-admin-list');
  const waiataEmpty = document.getElementById('waiata-admin-empty');
  const karakiaList = document.getElementById('karakia-admin-list');
  const karakiaEmpty = document.getElementById('karakia-admin-empty');

  // Admin story view modal
  const viewModal = document.getElementById('admin-view-modal');
  const viewClose = document.getElementById('admin-view-close');
  const viewBody = document.getElementById('admin-view-body');

  // Admin delete confirm modal
  const delModal = document.getElementById('admin-delete-modal');
  const delClose = document.getElementById('admin-delete-close');
  const delCancel = document.getElementById('admin-delete-cancel');
  const delConfirm = document.getElementById('admin-delete-confirm');
  let pendingDelete = null; // { kind: 'korero'|'waiata'|'karakia', id?, item? }


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
      const header = document.createElement('div');
      header.innerHTML = `<span class=\"tag\">${tag}</span>`;
      const meta = document.createElement('div'); meta.className = 'small muted'; meta.textContent = fmt(p.createdAt||Date.now());
      body.appendChild(header); body.appendChild(meta);

      if (p.type==='story'){
        const T = String(p.text||'');
        if (T.length > 280){
          const preview = document.createElement('p'); preview.style.whiteSpace='pre-wrap'; preview.style.margin='.5rem 0 0';
          preview.textContent = T.slice(0, 280).trim() + '… ';
          const more = document.createElement('a'); more.href='#'; more.textContent='Read more'; more.style.color='var(--accent)'; more.style.textDecoration='none'; more.style.cursor='pointer';
          more.addEventListener('click', (e)=>{ e.preventDefault(); if (viewBody) viewBody.textContent = T; if (viewModal){ viewModal.hidden=false; viewModal.setAttribute('aria-hidden','false'); } });
          preview.appendChild(more);
          body.appendChild(preview);
        } else if (T){
          const pre = document.createElement('p'); pre.textContent = T; pre.style.whiteSpace='pre-wrap'; pre.style.margin='.5rem 0 0'; body.appendChild(pre);
        }
      }

      if (p.type==='vlog' && p.mediaUrl){ const a=document.createElement('a'); a.href=p.mediaUrl; a.target='_blank'; a.rel='noopener'; a.textContent='Open video'; body.appendChild(a); }

      const actions = document.createElement('div'); actions.className='actions';
      const del = document.createElement('button'); del.className='btn outline'; del.textContent='Muku';
      del.addEventListener('mouseenter', ()=>{ del.textContent='Delete'; });
      del.addEventListener('mouseleave', ()=>{ del.textContent='Muku'; });
      del.addEventListener('click', ()=>{ pendingDelete = { kind:'korero', id: p.id }; showDelete(); });
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
      body.innerHTML = `<h3>${esc(title)}</h3><div class=\"small muted\">${fmt(ts)}</div>`;

      // Optional description/lyrics/body preview with Read more
      try {
        const desc = (it.lyrics || it.description || it.text || it.content || it.body || '').toString();
        if (desc){
          if (desc.length > 280){
            const p = document.createElement('p'); p.style.whiteSpace='pre-wrap'; p.style.margin='.5rem 0 0';
            p.textContent = desc.slice(0,280).trim() + '… ';
            const more = document.createElement('a'); more.href='#'; more.textContent='Read more'; more.style.color='var(--accent)'; more.style.textDecoration='none'; more.style.cursor='pointer';
            more.addEventListener('click', (e) => { e.preventDefault(); if (viewBody) viewBody.textContent = desc; if (viewModal){ viewModal.hidden=false; viewModal.setAttribute('aria-hidden','false'); } });
            p.appendChild(more); body.appendChild(p);
          } else {
            const p = document.createElement('p'); p.textContent = desc; p.style.whiteSpace='pre-wrap'; p.style.margin='.5rem 0 0'; body.appendChild(p);
          }
        }
      } catch(_){}

      const actions = document.createElement('div'); actions.className='actions';
      const del = document.createElement('button'); del.className='btn outline'; del.textContent='Muku';
      del.addEventListener('mouseenter', ()=>{ del.textContent='Delete'; });
      del.addEventListener('mouseleave', ()=>{ del.textContent='Muku'; });
      del.addEventListener('click', ()=>{
        const kind = (root===waiataList) ? 'waiata' : (root===karakiaList ? 'karakia' : 'unknown');
        pendingDelete = { kind, item: it };
        showDelete();
      });
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

  // View modal handlers
  function hideView(){ if (viewModal){ viewModal.hidden = true; viewModal.setAttribute('aria-hidden','true'); } }
  if (viewClose) viewClose.addEventListener('click', hideView);
  if (viewModal) viewModal.addEventListener('click', (e) => { if (e.target === viewModal) hideView(); });

  // Delete modal handlers
  function showDelete(){ if (delModal){ delModal.hidden = false; delModal.setAttribute('aria-hidden','false'); } }
  function hideDelete(){ if (delModal){ delModal.hidden = true; delModal.setAttribute('aria-hidden','true'); } pendingDelete = null; }
  if (delClose) delClose.addEventListener('click', hideDelete);
  if (delCancel) delCancel.addEventListener('click', hideDelete);
  if (delModal) delModal.addEventListener('click', (e) => { if (e.target === delModal) hideDelete(); });
  if (delConfirm) delConfirm.addEventListener('click', async () => {
    if (!pendingDelete) return;
    try {
      if (pendingDelete.kind === 'korero') await backend.delKorero(pendingDelete.id);
      else if (pendingDelete.kind === 'waiata') await backend.delWaiata(pendingDelete.item);
      else if (pendingDelete.kind === 'karakia') await backend.delKarakia(pendingDelete.item);
      await refresh();
    } finally { hideDelete(); }
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { hideView(); hideDelete(); } });

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
