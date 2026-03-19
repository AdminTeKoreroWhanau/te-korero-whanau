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

// Landing page - login modal + signup page redirect
(function landingAuth(){
  const authModal = document.getElementById('auth-modal');
  
  // Open login modal
  const openLogin = document.getElementById('open-auth');
  const authClose = document.getElementById('auth-close');
  
  const showAuthModal = () => {
    if (!authModal) return;
    authModal.hidden = false;
    authModal.setAttribute('aria-hidden', 'false');
  };
  
  const hideAuthModal = () => {
    if (!authModal) return;
    authModal.hidden = true;
    authModal.setAttribute('aria-hidden', 'true');
  };
  
  // Event listeners
  if (openLogin) openLogin.addEventListener('click', (e) => { e.preventDefault(); showAuthModal(); });
  if (authClose) authClose.addEventListener('click', hideAuthModal);
})();

// Landing page search
(function landingSearch(){
  const form = document.getElementById('landing-search-form');
  const input = document.getElementById('landing-search-input');
  if (!form || !input) return;
  
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    // Redirect to whakapapa or korero page with search query
    // For now, we'll search across visible sections on the page
    const sections = document.querySelectorAll('main section.panel');
    let found = false;
    sections.forEach(s => {
      const text = s.textContent.toLowerCase();
      if (text.includes(q.toLowerCase())) {
        s.style.display = '';
        if (!found) {
          s.scrollIntoView({ behavior: 'smooth', block: 'start' });
          found = true;
        }
      }
    });
    // If nothing found on page, redirect to whakapapa with query hint
    if (!found) {
      window.location.href = 'whakapapa.html';
    }
  });
})();

// Future: load content JSON for profiles, waiata, and whakapapa
// fetch('content/whanau.json').then(r => r.json()).then(data => {/* render */});

// ========================================
// MOBILE LOGIN ICON (header, when logged out)
// ========================================
(function initMobileLoginBtn() {
  const headerNav = document.querySelector('header.papa nav');
  const themeToggle = document.getElementById('theme-toggle');
  if (!headerNav) return;

  const btn = document.createElement('button');
  btn.className = 'mobile-login-btn';
  btn.setAttribute('title', 'Takiuru / Login');
  btn.setAttribute('aria-label', 'Takiuru / Login');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';

  // Insert before theme toggle so order is: [login] [theme]
  if (themeToggle) {
    headerNav.insertBefore(btn, themeToggle);
  } else {
    headerNav.appendChild(btn);
  }

  // Open auth modal on click
  btn.addEventListener('click', () => {
    const openAuth = document.getElementById('open-auth');
    if (openAuth) openAuth.click();
  });
})();

// ========================================
// MOBILE BOTTOM TAB BAR (Facebook-style)
// ========================================
(function initMobileTabBar() {
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  // SVG icons (solid/filled style)
  const icons = {
    home: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L2 12h3v8h5v-5h4v5h5v-8h3L12 3z"/></svg>',
    whakapapa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05C16.19 13.89 17 15.02 17 16.5V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>',
    korero: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>',
    hui: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="19" r="2.5"/></svg>'
  };

  // Primary tabs
  const tabs = [
    { href: 'index.html', label: 'Kāinga', icon: icons.home, match: ['index.html', ''] },
    { href: 'whakapapa.html', label: 'Whakapapa', icon: icons.whakapapa, match: ['whakapapa.html'] },
    { href: 'korero.html', label: 'Kōrero', icon: icons.korero, match: ['korero.html', 'korero-public.html'] },
    { href: 'hui.html', label: 'Hui', icon: icons.hui, match: ['hui.html'] }
  ];

  // More drawer items
  const morePages = [
    { href: 'mahi.html', label: 'Mahi', emoji: '🛠️', match: ['mahi.html'] },
    { href: 'tauparapara.html', label: 'Tauparapara', emoji: '🙏', match: ['tauparapara.html'] },
    { href: 'nga-toi.html', label: 'Ngā Toi', emoji: '🎨', match: ['nga-toi.html'] }
  ];

  const isActive = (match) => match.includes(page);
  const inMore = morePages.some(m => isActive(m.match));

  // --- Build tab bar ---
  const bar = document.createElement('nav');
  bar.className = 'mobile-tab-bar';
  bar.setAttribute('aria-label', 'Mobile navigation');

  tabs.forEach(t => {
    const a = document.createElement('a');
    a.href = t.href;
    a.className = 'tab-item' + (isActive(t.match) ? ' active' : '');
    a.innerHTML = t.icon + '<span class="tab-label">' + t.label + '</span>';
    bar.appendChild(a);
  });

  // More button
  const moreBtn = document.createElement('button');
  moreBtn.className = 'tab-item' + (inMore ? ' active' : '');
  moreBtn.id = 'mobile-more-btn';
  moreBtn.setAttribute('aria-expanded', 'false');
  moreBtn.setAttribute('aria-controls', 'mobile-more-drawer');
  moreBtn.innerHTML = icons.more + '<span class="tab-label">More</span>';
  bar.appendChild(moreBtn);

  // --- Build overlay + drawer ---
  const overlay = document.createElement('div');
  overlay.className = 'more-drawer-overlay';
  overlay.id = 'mobile-more-overlay';

  const drawer = document.createElement('div');
  drawer.className = 'more-drawer';
  drawer.id = 'mobile-more-drawer';

  // Drag handle
  const handle = document.createElement('div');
  handle.className = 'more-drawer-handle';
  drawer.appendChild(handle);

  const grid = document.createElement('div');
  grid.className = 'more-drawer-grid';

  // Page items
  morePages.forEach(m => {
    const a = document.createElement('a');
    a.href = m.href;
    a.className = 'more-drawer-item' + (isActive(m.match) ? ' active' : '');
    a.innerHTML = '<span class="more-drawer-icon">' + m.emoji + '</span><span>' + m.label + '</span>';
    grid.appendChild(a);
  });

  // Divider
  const divider = document.createElement('div');
  divider.className = 'more-drawer-divider';
  grid.appendChild(divider);

  // Auth-dependent items: Profile
  const profileLink = document.createElement('a');
  profileLink.href = 'profile.html';
  profileLink.className = 'more-drawer-item' + (page === 'profile.html' ? ' active' : '');
  profileLink.id = 'mobile-more-profile';
  profileLink.innerHTML = '<span class="more-drawer-icon">👤</span><span>Kōtaha</span>';
  profileLink.style.display = 'none';
  grid.appendChild(profileLink);

  // Auth-dependent: Admin
  const adminLink = document.createElement('a');
  adminLink.href = 'admin.html';
  adminLink.className = 'more-drawer-item' + (page === 'admin.html' ? ' active' : '');
  adminLink.id = 'mobile-more-admin';
  adminLink.innerHTML = '<span class="more-drawer-icon">⚙️</span><span>Kaiwhakahaere</span>';
  adminLink.style.display = 'none';
  grid.appendChild(adminLink);

  // Auth-dependent: Login
  const loginLink = document.createElement('a');
  loginLink.href = '#';
  loginLink.className = 'more-drawer-item';
  loginLink.id = 'mobile-more-login';
  loginLink.innerHTML = '<span class="more-drawer-icon">🔑</span><span>Takiuru</span>';
  grid.appendChild(loginLink);

  // Auth-dependent: Sign out
  const signoutLink = document.createElement('a');
  signoutLink.href = '#';
  signoutLink.className = 'more-drawer-item';
  signoutLink.id = 'mobile-more-signout';
  signoutLink.innerHTML = '<span class="more-drawer-icon">🚪</span><span>Takiputa</span>';
  signoutLink.style.display = 'none';
  grid.appendChild(signoutLink);

  drawer.appendChild(grid);

  // Append to body
  document.body.appendChild(overlay);
  document.body.appendChild(drawer);
  document.body.appendChild(bar);

  // --- Toggle logic ---
  const toggleDrawer = (show) => {
    const open = typeof show === 'boolean' ? show : !drawer.classList.contains('open');
    drawer.classList.toggle('open', open);
    overlay.classList.toggle('open', open);
    moreBtn.setAttribute('aria-expanded', String(open));
  };

  moreBtn.addEventListener('click', () => toggleDrawer());
  overlay.addEventListener('click', () => toggleDrawer(false));
  drawer.addEventListener('click', (e) => {
    if (e.target.closest('a')) toggleDrawer(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) toggleDrawer(false);
  });

  // --- Sync auth state from existing nav items ---
  const syncAuth = () => {
    const navProfile = document.getElementById('nav-profile-item');
    const navAdmin = document.getElementById('nav-admin-item');
    const navLogin = document.getElementById('nav-login-item');
    const navSignout = document.getElementById('nav-signout-item');

    if (navProfile) profileLink.style.display = navProfile.style.display;
    if (navAdmin) adminLink.style.display = navAdmin.style.display;
    if (navLogin) loginLink.style.display = navLogin.style.display;
    if (navSignout) signoutLink.style.display = navSignout.style.display;
  };

  // Wire login link to open auth modal (same as header nav)
  loginLink.addEventListener('click', (e) => {
    e.preventDefault();
    toggleDrawer(false);
    const openAuth = document.getElementById('open-auth');
    if (openAuth) openAuth.click();
  });

  // Wire signout link
  signoutLink.addEventListener('click', (e) => {
    e.preventDefault();
    toggleDrawer(false);
    const signoutBtn = document.getElementById('signout');
    if (signoutBtn) signoutBtn.click();
  });

  // Observe changes on the original nav items to sync auth state
  const observeTargets = ['nav-profile-item', 'nav-admin-item', 'nav-login-item', 'nav-signout-item'];
  const observer = new MutationObserver(syncAuth);
  observeTargets.forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el, { attributes: true, attributeFilter: ['style'] });
  });

  // --- Auth-gate: only show tab bar when logged in ---
  const setAuthed = (loggedIn) => {
    document.body.classList.toggle('authed', loggedIn);
    // Close drawer when signing out
    if (!loggedIn) toggleDrawer(false);
  };

  const checkAuthState = async () => {
    try {
      if (window.sb) {
        const { data } = await window.sb.auth.getSession();
        setAuthed(!!data.session?.user);
      } else {
        setAuthed(false);
      }
    } catch { setAuthed(false); }
  };

  // Wait for Supabase client then listen for auth changes
  const waitForSb = () => {
    if (window.sb) {
      checkAuthState();
      syncAuth();
      window.sb.auth.onAuthStateChange((_event, session) => {
        setAuthed(!!session?.user);
        syncAuth();
      });
    } else {
      setTimeout(waitForSb, 100);
    }
  };
  waitForSb();

  // Initial sync (delayed fallback)
  setTimeout(syncAuth, 200);
  setTimeout(syncAuth, 1000);
})();

// Hui page - show/hide event form based on auth
(function initHuiPage(){
  const eventFormSection = document.getElementById('event-form-section');
  const eventLoginPrompt = document.getElementById('event-login-prompt');
  const eventForm = document.getElementById('event-form');
  
  if (!eventFormSection && !eventLoginPrompt) return; // Not on hui page
  
  // Update UI based on user state
  const updateUI = (user) => {
    if (user) {
      // Logged in - show form, hide prompt
      if (eventFormSection) eventFormSection.style.display = '';
      if (eventLoginPrompt) eventLoginPrompt.style.display = 'none';
    } else {
      // Not logged in - hide form, show prompt
      if (eventFormSection) eventFormSection.style.display = 'none';
      if (eventLoginPrompt) eventLoginPrompt.style.display = '';
    }
  };
  
  // Check auth state using Supabase
  const checkAuth = async () => {
    try {
      if (window.sb) {
        const { data } = await window.sb.auth.getSession();
        updateUI(data.session?.user || null);
      } else {
        // Fallback if Supabase not available
        updateUI(null);
      }
    } catch {
      updateUI(null);
    }
  };
  
  // Initial check (with small delay to ensure sb is initialized)
  setTimeout(checkAuth, 100);
  
  // Listen for auth state changes
  const setupAuthListener = () => {
    if (window.sb) {
      window.sb.auth.onAuthStateChange((_event, session) => {
        updateUI(session?.user || null);
      });
    }
  };
  setTimeout(setupAuthListener, 100);
  
  // Event form submission is handled by hui.js (saves to Supabase)
})();

// Mahi page - show/hide project form based on auth
(function initMahiPage(){
  const mahiFormSection = document.getElementById('mahi-form-section');
  const mahiLoginPrompt = document.getElementById('mahi-login-prompt');

  if (!mahiFormSection && !mahiLoginPrompt) return; // Not on mahi page

  const updateUI = (user) => {
    if (user) {
      if (mahiFormSection) mahiFormSection.style.display = '';
      if (mahiLoginPrompt) mahiLoginPrompt.style.display = 'none';
    } else {
      if (mahiFormSection) mahiFormSection.style.display = 'none';
      if (mahiLoginPrompt) mahiLoginPrompt.style.display = '';
    }
  };

  const checkAuth = async () => {
    try {
      if (window.sb) {
        const { data } = await window.sb.auth.getSession();
        updateUI(data.session?.user || null);
      } else {
        updateUI(null);
      }
    } catch {
      updateUI(null);
    }
  };

  setTimeout(checkAuth, 100);

  const setupAuthListener = () => {
    if (window.sb) {
      window.sb.auth.onAuthStateChange((_event, session) => {
        updateUI(session?.user || null);
      });
    }
  };
  setTimeout(setupAuthListener, 100);
})();

// Dashboard initialization
(function initDashboard(){
  const userNameEl = document.getElementById('user-name');
  const currentDayEl = document.getElementById('current-day');
  const currentDateEl = document.getElementById('current-date');
  
  // Only run on dashboard page
  if (!userNameEl && !currentDayEl && !currentDateEl) return;
  
  // Set user's surname (whānau name) from Supabase session
  const setUserName = async () => {
    if (!userNameEl) return;
    try {
      if (window.sb) {
        const { data } = await window.sb.auth.getSession();
        const user = data.session?.user;
        if (user) {
          const fullName = user.user_metadata?.full_name || '';
          const nameParts = fullName.trim().split(' ');
          // Get surname (last part of name) to represent whānau
          const surname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
          userNameEl.textContent = surname ? `${surname} Whānau` : 'Whānau';
        }
      }
    } catch {}
  };
  
  // Run after small delay to ensure sb is initialized
  setTimeout(setUserName, 100);
  
  // Set current date
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  if (currentDayEl) {
    currentDayEl.textContent = now.getDate();
  }
  if (currentDateEl) {
    currentDateEl.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getFullYear()}`;
  }
})();
