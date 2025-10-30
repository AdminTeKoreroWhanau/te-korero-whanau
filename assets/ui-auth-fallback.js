(function(){
  const modal = document.getElementById('auth-modal');
  const openBtn = document.getElementById('open-auth');
  const closeBtn = document.getElementById('auth-close');
  if (!modal || !openBtn) return;
  const show = ()=>{ modal.hidden=false; modal.setAttribute('aria-hidden','false'); };
  const hide = ()=>{ modal.hidden=true; modal.setAttribute('aria-hidden','true'); };
  if (!openBtn.__authBound){ openBtn.addEventListener('click', (e)=>{ e.preventDefault(); show(); }); openBtn.__authBound=true; }
  if (closeBtn && !closeBtn.__authBound){ closeBtn.addEventListener('click', hide); closeBtn.__authBound=true; }
})();
