// Hui events: CRUD, rendering, dashboard stats & activity — all from Supabase
(function(){
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function waitForSb(cb, tries){
    tries = tries || 0;
    if (window.sb) return cb(window.sb);
    if (tries > 30) return; // give up after ~3s
    setTimeout(() => waitForSb(cb, tries + 1), 100);
  }

  // Format a time string like "18:00" to "6:00 PM"
  function fmtTime(t){
    if (!t) return '';
    const [h,m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return `${hr}:${String(m).padStart(2,'0')} ${ampm}`;
  }

  function todayStr(){ return new Date().toISOString().slice(0,10); }

  // ─── Hui page: form submission ────────────────────────────────
  function initEventForm(sb){
    const form = document.getElementById('event-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('event-form-msg');
      const fd = new FormData(form);
      const { data: sessionData } = await sb.auth.getSession();
      const user = sessionData.session?.user;
      if (!user){ if(msg) msg.textContent = 'Please log in first.'; return; }

      const whanau_id = (typeof window.getMyWhanauId === 'function') ? await window.getMyWhanauId() : null;
      const payload = {
        event_name: fd.get('event_name'),
        event_date: fd.get('event_date'),
        event_time: fd.get('event_time') || null,
        event_location: fd.get('event_location'),
        event_description: fd.get('event_description') || null,
        is_public: !!fd.get('is_public'),
        created_by: user.id,
        whanau_id
      };
      const { error } = await sb.from('hui_events').insert(payload);
      if (error){
        if(msg){ msg.textContent = 'Error: ' + error.message; msg.style.color = 'var(--danger, red)'; }
        return;
      }
      if(msg){ msg.textContent = 'Hui added successfully!'; msg.style.color = 'var(--accent)'; }
      form.reset();
      // Reload events on page
      loadHuiPageEvents(sb);
    });
  }

  // ─── Render a full hui-card (used on hui.html) ────────────────
  function renderHuiCard(ev, isPast){
    const d = new Date(ev.event_date + 'T00:00:00');
    const day = String(d.getDate()).padStart(2,'0');
    const mon = MONTHS[d.getMonth()];
    const year = d.getFullYear();
    const time = ev.event_time ? fmtTime(ev.event_time) : '';
    const desc = ev.event_description || '';
    const tags = [];
    if (ev.is_public) tags.push('Public');
    if (isPast) tags.push('Completed');

    return `<article class="hui-card${isPast ? ' past' : ''}">
      <div class="hui-date">
        <span class="hui-day">${day}</span>
        <span class="hui-month">${mon}</span>
        <span class="hui-year">${year}</span>
      </div>
      <div class="hui-details">
        <h3>${esc(ev.event_name)}</h3>
        <div class="hui-meta">
          <span class="hui-location">📍 ${esc(ev.event_location)}</span>
          ${time ? `<span class="hui-time">🕐 ${time}</span>` : ''}
        </div>
        ${desc ? `<p>${esc(desc)}</p>` : ''}
        <div class="hui-tags">${tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
      </div>
    </article>`;
  }

  // ─── Load events for hui.html ─────────────────────────────────
  async function loadHuiPageEvents(sb){
    const upGrid = document.getElementById('events-grid');
    const pastGrid = document.getElementById('past-events-grid');
    if (!upGrid && !pastGrid) return;

    const today = todayStr();
    // Upcoming
    if (upGrid){
      const { data, error } = await sb.from('hui_events')
        .select('*').gte('event_date', today).order('event_date', { ascending: true });
      if (!error && data && data.length){
        upGrid.innerHTML = data.map(ev => renderHuiCard(ev, false)).join('');
      } else {
        upGrid.innerHTML = '<p class="muted">Kāore he hui kei te haere mai. / No upcoming events yet.</p>';
      }
    }
    // Past
    if (pastGrid){
      const { data, error } = await sb.from('hui_events')
        .select('*').lt('event_date', today).order('event_date', { ascending: false }).limit(10);
      if (!error && data && data.length){
        pastGrid.innerHTML = data.map(ev => renderHuiCard(ev, true)).join('');
      } else {
        pastGrid.innerHTML = '<p class="muted">Kāore he hui kua pahure. / No past events yet.</p>';
      }
    }
  }

  // ─── Dashboard (index.html): upcoming events widget ───────────
  async function loadDashboardEvents(sb){
    const container = document.getElementById('dashboard-events');
    if (!container) return;
    const today = todayStr();
    const { data, error } = await sb.from('hui_events')
      .select('*').gte('event_date', today).order('event_date', { ascending: true }).limit(3);
    if (!error && data && data.length){
      container.innerHTML = data.map(ev => {
        const d = new Date(ev.event_date + 'T00:00:00');
        const day = String(d.getDate()).padStart(2,'0');
        const mon = MONTHS[d.getMonth()];
        const time = ev.event_time ? fmtTime(ev.event_time) : '';
        return `<div class="event-item">
          <div class="event-date-small">
            <span class="day">${day}</span>
            <span class="month">${mon}</span>
          </div>
          <div class="event-info">
            <strong>${esc(ev.event_name)}</strong>
            <span class="muted">${esc(ev.event_location)}${time ? ' · ' + time : ''}</span>
          </div>
        </div>`;
      }).join('');
    } else {
      container.innerHTML = '<p class="muted small">No upcoming events. <a href="hui.html">Add one →</a></p>';
    }
  }

  // ─── Dashboard (index.html): stats from real tables ───────────
  async function loadDashboardStats(sb){
    const statMembers = document.getElementById('stat-members');
    const statStories = document.getElementById('stat-stories');
    const statPhotos = document.getElementById('stat-photos');
    const statWaiata = document.getElementById('stat-waiata');
    if (!statMembers && !statStories && !statPhotos && !statWaiata) return;

    // Stories count
    if (statStories){
      const { count } = await sb.from('korero_posts').select('id', { count: 'exact', head: true });
      statStories.textContent = count ?? 0;
    }
    // Photos count
    if (statPhotos){
      const { count } = await sb.from('ngatoi_items').select('id', { count: 'exact', head: true });
      statPhotos.textContent = count ?? 0;
    }
    // Waiata count
    if (statWaiata){
      const { count } = await sb.from('waiata_items').select('id', { count: 'exact', head: true });
      statWaiata.textContent = count ?? 0;
    }
    // Members: count unique authors across tables as an approximation
    if (statMembers){
      try {
        const results = await Promise.all([
          sb.from('korero_posts').select('author_id'),
          sb.from('ngatoi_items').select('author'),
          sb.from('waiata_items').select('created_by')
        ]);
        const ids = new Set();
        (results[0].data || []).forEach(r => { if(r.author_id) ids.add(r.author_id); });
        (results[1].data || []).forEach(r => { if(r.author) ids.add(r.author); });
        (results[2].data || []).forEach(r => { if(r.created_by) ids.add(r.created_by); });
        statMembers.textContent = ids.size || 0;
      } catch { statMembers.textContent = '0'; }
    }
  }

  // ─── Dashboard (index.html): recent activity from real data ───
  async function loadDashboardActivity(sb){
    const feed = document.getElementById('activity-feed');
    if (!feed) return;

    const items = [];
    // Recent stories
    try {
      const { data } = await sb.from('korero_posts').select('id, type, text, created_at').order('created_at', { ascending: false }).limit(5);
      (data || []).forEach(r => items.push({ icon: '📖', label: r.type === 'vlog' ? 'New vlog shared' : 'New story added', detail: r.text ? r.text.slice(0, 60) + (r.text.length > 60 ? '…' : '') : '', time: r.created_at, link: 'korero.html' }));
    } catch {}
    // Recent photos
    try {
      const { data } = await sb.from('ngatoi_items').select('id, title, author, created_at').order('created_at', { ascending: false }).limit(5);
      (data || []).forEach(r => items.push({ icon: '🖼️', label: 'Photo uploaded', detail: r.title || '', time: r.created_at, link: 'nga-toi.html' }));
    } catch {}
    // Recent waiata
    try {
      const { data } = await sb.from('waiata_items').select('id, title, type, created_at').order('created_at', { ascending: false }).limit(5);
      (data || []).forEach(r => items.push({ icon: '🎵', label: `Waiata ${r.type || 'item'} shared`, detail: r.title || '', time: r.created_at, link: 'tauparapara.html' }));
    } catch {}
    // Recent events added
    try {
      const { data } = await sb.from('hui_events').select('id, event_name, created_at').order('created_at', { ascending: false }).limit(5);
      (data || []).forEach(r => items.push({ icon: '📅', label: 'New event added', detail: r.event_name || '', time: r.created_at, link: 'hui.html' }));
    } catch {}

    // Sort by time descending, take top 5
    items.sort((a, b) => new Date(b.time) - new Date(a.time));
    const top = items.slice(0, 5);

    if (top.length === 0){
      feed.innerHTML = '<p class="muted small">No recent activity yet. Be the first to contribute!</p>';
      return;
    }

    feed.innerHTML = top.map(it => {
      const ago = timeAgo(it.time);
      return `<div class="activity-item">
        <div class="activity-icon">${it.icon}</div>
        <div class="activity-content">
          <p><strong>${esc(it.label)}</strong></p>
          ${it.detail ? `<span class="muted small">${esc(it.detail)}</span>` : ''}
          <span class="activity-time">${ago}</span>
        </div>
      </div>`;
    }).join('');
  }

  // ─── Landing page: upcoming events ────────────────────────────
  async function loadLandingEvents(sb){
    const list = document.getElementById('events-list');
    if (!list) return;
    const today = todayStr();
    const { data, error } = await sb.from('hui_events')
      .select('*').gte('event_date', today).eq('is_public', true).order('event_date', { ascending: true }).limit(3);
    if (!error && data && data.length){
      list.innerHTML = data.map(ev => {
        const d = new Date(ev.event_date + 'T00:00:00');
        const day = String(d.getDate()).padStart(2,'0');
        const mon = MONTHS[d.getMonth()];
        const time = ev.event_time ? fmtTime(ev.event_time) : '';
        const desc = ev.event_description || '';
        return `<article class="event-card">
          <div class="event-date">
            <span class="day">${day}</span>
            <span class="month">${mon}</span>
          </div>
          <div class="event-details">
            <h3>${esc(ev.event_name)}</h3>
            <p class="muted">${esc(ev.event_location)}${time ? ' · ' + time : ''}</p>
            ${desc ? `<p>${esc(desc)}</p>` : ''}
          </div>
        </article>`;
      }).join('');
    } else {
      list.innerHTML = '<p class="muted">No upcoming events yet. Sign up to add one!</p>';
    }
  }

  // ─── Landing page: sidebar mini-events ────────────────────────
  async function loadLandingSidebarEvents(sb){
    const container = document.getElementById('sidebar-events');
    if (!container) return;
    const today = todayStr();
    const { data } = await sb.from('hui_events')
      .select('event_name, event_date').gte('event_date', today).eq('is_public', true).order('event_date', { ascending: true }).limit(3);
    if (data && data.length){
      container.innerHTML = data.map(ev => {
        const d = new Date(ev.event_date + 'T00:00:00');
        return `<div class="mini-event">
          <span class="mini-date">${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2,'0')}</span>
          <span>${esc(ev.event_name)}</span>
        </div>`;
      }).join('');
    } else {
      container.innerHTML = '<p class="muted small">No upcoming events.</p>';
    }
  }

  // ─── Landing page: real stats ─────────────────────────────────
  async function loadLandingStats(sb){
    const membersEl = document.querySelector('[data-stat="members"]');
    const treesEl = document.querySelector('[data-stat="trees"]');
    const storiesEl = document.querySelector('[data-stat="stories"]');
    if (!membersEl && !treesEl && !storiesEl) return;

    if (storiesEl){
      const { count } = await sb.from('korero_posts').select('id', { count: 'exact', head: true });
      storiesEl.textContent = count ?? 0;
    }
    if (treesEl){
      // Count whakapapa items if table exists, else count ngatoi_items as proxy
      try {
        const { count } = await sb.from('ngatoi_items').select('id', { count: 'exact', head: true });
        treesEl.textContent = count ?? 0;
      } catch { treesEl.textContent = '0'; }
    }
    if (membersEl){
      // Approximate unique contributors
      try {
        const results = await Promise.all([
          sb.from('korero_posts').select('author_id'),
          sb.from('ngatoi_items').select('author'),
          sb.from('waiata_items').select('created_by')
        ]);
        const ids = new Set();
        (results[0].data || []).forEach(r => { if(r.author_id) ids.add(r.author_id); });
        (results[1].data || []).forEach(r => { if(r.author) ids.add(r.author); });
        (results[2].data || []).forEach(r => { if(r.created_by) ids.add(r.created_by); });
        membersEl.textContent = ids.size || 0;
      } catch { membersEl.textContent = '0'; }
    }
  }

  // ─── Landing page: recently joined (from profiles table) ──────
  async function loadLandingRecentMembers(sb){
    const container = document.getElementById('recent-members');
    if (!container) return;
    try {
      const { data, error } = await sb.from('profiles')
        .select('id, full_name, avatar_url, updated_at')
        .order('updated_at', { ascending: false })
        .limit(6);
      if (error || !data || data.length === 0){
        container.innerHTML = '<p class="muted small">No members yet. Be the first!</p>';
        return;
      }
      container.innerHTML = data.map(p => {
        const name = esc(p.full_name || 'Whānau Member');
        const initials = (p.full_name || '?').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
        if (p.avatar_url){
          return `<div class="member-item">
            <img class="member-avatar" src="${esc(p.avatar_url)}" alt="${name}" style="width:36px;height:36px;border-radius:50%;object-fit:cover" />
            <span>${name}</span>
          </div>`;
        }
        return `<div class="member-item">
          <div class="member-avatar">${initials}</div>
          <span>${name}</span>
        </div>`;
      }).join('');
    } catch {
      container.innerHTML = '<p class="muted small">No members yet.</p>';
    }
  }

  // ─── Landing page: most loved (aroha) stories ─────────────
  async function loadMostArohaStories(sb){
    const container = document.getElementById('most-aroha-list');
    if (!container) return;
    try {
      // Get aroha counts per post
      const { data: reactions } = await sb.from('korero_reactions')
        .select('post_id').eq('type', 'aroha');
      const counts = {};
      (reactions || []).forEach(r => { counts[r.post_id] = (counts[r.post_id] || 0) + 1; });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
      if (sorted.length === 0){
        container.innerHTML = '<li class="muted small">No stories with aroha yet.</li>';
        return;
      }
      // Fetch those posts
      const ids = sorted.map(s => s[0]);
      const { data: posts } = await sb.from('korero_posts')
        .select('id, title, text, type').in('id', ids).eq('is_public', true);
      if (!posts || posts.length === 0){
        container.innerHTML = '<li class="muted small">No public stories with aroha yet.</li>';
        return;
      }
      const postMap = {};
      posts.forEach(p => { postMap[p.id] = p; });
      container.innerHTML = sorted
        .filter(([id]) => postMap[id])
        .map(([id, count]) => {
          const p = postMap[id];
          const label = p.title || (p.text ? p.text.slice(0, 40) + (p.text.length > 40 ? '…' : '') : (p.type === 'vlog' ? 'Vlog' : 'Story'));
          return `<li><a href="korero-public.html">💛 ${count} — ${esc(label)}</a></li>`;
        }).join('');
    } catch {
      container.innerHTML = '<li class="muted small">Could not load stories.</li>';
    }
  }

  // ─── Landing page: right sidebar upcoming events ───────────
  async function loadRightSidebarEvents(sb){
    const container = document.getElementById('sidebar-events-right');
    if (!container) return;
    const today = todayStr();
    const { data } = await sb.from('hui_events')
      .select('event_name, event_date').gte('event_date', today).eq('is_public', true).order('event_date', { ascending: true }).limit(3);
    if (data && data.length){
      container.innerHTML = data.map(ev => {
        const d = new Date(ev.event_date + 'T00:00:00');
        return `<div class="mini-event">
          <span class="mini-date">${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2,'0')}</span>
          <span>${esc(ev.event_name)}</span>
        </div>`;
      }).join('');
    } else {
      container.innerHTML = '<p class="muted small">No upcoming events.</p>';
    }
  }

  // ─── Landing page: latest public stories ───────────────────────
  async function loadLandingLatestStories(sb){
    const container = document.getElementById('latest-stories-list');
    if (!container) return;
    try {
      const { data } = await sb.from('korero_posts')
        .select('id, text, title, type, created_at')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(4);
      if (!data || data.length === 0){
        container.innerHTML = '<li class="muted small">No public stories yet.</li>';
        return;
      }
      container.innerHTML = data.map(r => {
        const label = r.title || (r.text ? r.text.slice(0, 50) + (r.text.length > 50 ? '…' : '') : (r.type === 'vlog' ? 'New Vlog' : 'New Story'));
        return `<li><a href="korero-public.html">${esc(label)}</a></li>`;
      }).join('');
    } catch {
      container.innerHTML = '<li class="muted small">Could not load stories.</li>';
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────
  function esc(s){
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function timeAgo(dateStr){
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + ' min ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + (days === 1 ? ' day ago' : ' days ago');
    const months = Math.floor(days / 30);
    return months + (months === 1 ? ' month ago' : ' months ago');
  }

  // ─── Init ─────────────────────────────────────────────────────
  waitForSb(function(sb){
    // Hui page
    initEventForm(sb);
    loadHuiPageEvents(sb);

    // Dashboard (index.html)
    loadDashboardEvents(sb);
    loadDashboardStats(sb);
    loadDashboardActivity(sb);

    // Landing page
    loadLandingEvents(sb);
    loadLandingSidebarEvents(sb);
    loadLandingStats(sb);
    loadLandingRecentMembers(sb);
    loadLandingLatestStories(sb);
    loadMostArohaStories(sb);
    loadRightSidebarEvents(sb);
  });
})();
