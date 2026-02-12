// Enhance interactivity: mobile nav, scrollspy, reveal-on-scroll, theme toggle, lightbox

// Mobile nav toggle
const navToggle = document.querySelector('.nav-toggle');
const navList = document.querySelector('#whanau-nav');
if (navToggle && navList) {
  navToggle.addEventListener('click', () => {
    const open = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!open));
    navList.style.display = open ? 'none' : 'flex';
  });
  // Close nav after clicking a link (mobile)
  navList.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.tagName === 'A') {
      navToggle.setAttribute('aria-expanded', 'false');
      if (window.innerWidth <= 720) navList.style.display = 'none';
    }
  });
}

// Set current year
const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

// Scrollspy (single-page) or pathname highlight (multi-page)
const sections = Array.from(document.querySelectorAll('section[id]'));
const navLinks = Array.from(document.querySelectorAll('.nav-list a'));
// Highlight based on current page when using multi-page nav (hrefs not starting with #)
if (navLinks.length) {
  const setActiveByPath = () => {
    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    navLinks.forEach(a => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      if (href && !href.startsWith('#')) {
        a.classList.toggle('active', href === path || (path === '' && href === 'index.html'));
      }
    });
  };
  setActiveByPath();
}
// Enable scrollspy only when nav links are in-page hashes
if (sections.length && navLinks.length && navLinks.every(a => (a.getAttribute('href') || '').startsWith('#'))) {
  const byId = (id) => navLinks.find(a => (a.getAttribute('href') || '').replace('#','') === id);
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(a => a.classList.remove('active'));
        const link = byId(id);
        if (link) link.classList.add('active');
      }
    });
  }, { rootMargin: '-40% 0px -50% 0px', threshold: [0, 0.5, 1] });
  sections.forEach(s => io.observe(s));
}

// Reveal-on-scroll animations (respect reduced motion)
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!reduceMotion) {
  const revealTargets = Array.from(document.querySelectorAll('.panel, .hero'));
  revealTargets.forEach(el => el.classList.add('reveal'));
  const revealIO = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });
  revealTargets.forEach(el => revealIO.observe(el));
}

// Theme toggle with localStorage
const themeBtn = document.getElementById('theme-toggle');
const applyTheme = (t) => document.documentElement.setAttribute('data-theme', t);
try {
  const saved = localStorage.getItem('theme');
  if (saved) {
    applyTheme(saved);
    if (themeBtn) {
      themeBtn.textContent = saved === 'light' ? '☾' : '☀︎';
    }
  }
  if (themeBtn) {
    themeBtn.setAttribute('aria-pressed', String((localStorage.getItem('theme') || 'dark') === 'light'));
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'light' ? 'dark' : 'light';
      applyTheme(next);
      localStorage.setItem('theme', next);
      themeBtn.setAttribute('aria-pressed', String(next === 'light'));
      themeBtn.textContent = next === 'light' ? '☾' : '☀︎';
    });
  }
} catch (_) { /* ignore if storage not available */ }

// Site search: filter sections and gallery items
const searchInput = document.getElementById('site-search');
const resultCount = document.getElementById('search-result-count');
if (searchInput) {
  const allSections = Array.from(document.querySelectorAll('main section.panel, main section.hero')).filter(s => s.id !== 'rapu');
  const galleryImgs = () => Array.from(document.querySelectorAll('#nga-toi .gallery img'));
  const reset = () => {
    allSections.forEach(s => s.style.display = '');
    galleryImgs().forEach(img => img.style.display = '');
    if (resultCount) resultCount.textContent = '';
  };
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (q.length < 2) return reset();
    let hits = 0;
    allSections.forEach(s => {
      const match = s.textContent.toLowerCase().includes(q);
      s.style.display = match ? '' : 'none';
      if (match) hits++;
    });
    galleryImgs().forEach(img => {
      const alt = (img.alt || '').toLowerCase();
      const show = alt.includes(q);
      img.style.display = show ? '' : 'none';
      if (show) hits++;
    });
    if (resultCount) resultCount.textContent = hits ? `${hits} hua i kitea / results` : 'Kāore he hua / no results';
  });
}

// Simple lightbox for images inside #nga-toi
(function setupLightbox(){
  const container = document.getElementById('lightbox');
  if (!container) return;
  const imgEl = container.querySelector('img');
  const closeBtn = container.querySelector('.lightbox-close');
  const open = (src, alt='') => {
    imgEl.src = src; imgEl.alt = alt || '';
    container.hidden = false; container.setAttribute('aria-hidden','false');
  };
  const close = () => { container.hidden = true; container.setAttribute('aria-hidden','true'); imgEl.src=''; };
  closeBtn.addEventListener('click', close);
  container.addEventListener('click', (e) => { if (e.target === container) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !container.hidden) close(); });
  const galleryRoot = document.getElementById('nga-toi');
  if (!galleryRoot) return;
  galleryRoot.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG') {
      e.preventDefault();
      open(t.currentSrc || t.src, t.alt);
    }
  });
})();

// Updates badge logic for preview cards: show 'New' only when updated since user last viewed.
(function updatesBadges(){
  const cards = Array.from(document.querySelectorAll('.previews .card'));
  if (!cards.length) return;
  const slugFromHref = (href) => {
    try {
      const url = new URL(href, location.href);
      const file = (url.pathname.split('/').pop() || '').toLowerCase();
      return file.replace(/\.html$/, '');
    } catch { return ''; }
  };
  fetch('assets/updates.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(map => {
      // Helper to mark a slug as seen (to now or its lastUpdated)
      const markSlugSeen = (slug) => {
        if (!slug) return;
        const lu = Date.parse(map[slug]?.lastUpdated || 0) || Date.now();
        try { localStorage.setItem('seen_' + slug, String(lu)); } catch {}
      };

      // If we are currently ON one of the mapped pages, mark it seen on load
      try {
        const current = (location.pathname.split('/').pop() || '').toLowerCase();
        const currentSlug = current.replace(/\.html$/, '');
        if (currentSlug && map[currentSlug]) markSlugSeen(currentSlug);
      } catch {}

      // Render badges on index cards and set click handlers on the cards
      cards.forEach(card => {
        const link = card.querySelector('a.card-link');
        const h3 = card.querySelector('h3');
        if (!link || !h3) return;
        const slug = slugFromHref(link.getAttribute('href') || '');
        if (!slug || !map[slug]) return;
        const lastUpdated = Date.parse(map[slug].lastUpdated || 0) || 0;
        let seen = 0;
        try { seen = parseInt(localStorage.getItem('seen_' + slug) || '0', 10) || 0; } catch {}
        if (lastUpdated > seen) {
          if (!h3.querySelector('.tag.new')){
            const tag = document.createElement('span');
            tag.className = 'tag new';
            tag.textContent = 'New';
            h3.appendChild(tag);
          }
        }
        link.addEventListener('click', () => markSlugSeen(slug), { once: true });
      });

      // Also attach to top nav page links so clicking them clears badges too
      const navLinks = Array.from(document.querySelectorAll('.nav-list a'))
        .filter(a => !!a.getAttribute('href') && !a.getAttribute('href').startsWith('#'));
      navLinks.forEach(a => {
        const slug = slugFromHref(a.getAttribute('href'));
        if (!slug || !map[slug]) return;
        a.addEventListener('click', () => markSlugSeen(slug));
      });
    })
    .catch(() => { /* ignore if missing */ });
})();

// Future: load content JSON for profiles, waiata, and whakapapa
// fetch('content/whanau.json').then(r => r.json()).then(data => {/* render */});