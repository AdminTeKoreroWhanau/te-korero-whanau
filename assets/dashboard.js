// Dashboard data loading — runs only on index.html (dashboard page)
(function(){
  const sb = window.sb;
  if (!sb) return;
  // Only run on dashboard (check for a dashboard-specific element)
  if (!document.getElementById('stat-members')) return;

  const esc = (s) => (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ─── Stats ───
  async function loadStats(){
    try {
      const wid = typeof window.getMyWhanauId === 'function' ? await window.getMyWhanauId() : null;

      // Members
      const { count: memberCount } = await sb.from('whanau_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('whanau_id', wid);
      const el1 = document.getElementById('stat-members');
      if (el1) el1.textContent = memberCount ?? '--';

      // Stories
      const { count: storyCount } = await sb.from('korero_posts')
        .select('id', { count: 'exact', head: true })
        .eq('whanau_id', wid);
      const el2 = document.getElementById('stat-stories');
      if (el2) el2.textContent = storyCount ?? '--';

      // Photos (ngatoi_items)
      const { count: photoCount } = await sb.from('ngatoi_items')
        .select('id', { count: 'exact', head: true })
        .eq('whanau_id', wid);
      const el3 = document.getElementById('stat-photos');
      if (el3) el3.textContent = photoCount ?? '--';

      // Waiata
      const { count: waiataCount } = await sb.from('waiata_items')
        .select('id', { count: 'exact', head: true })
        .eq('whanau_id', wid)
        .eq('category', 'waiata');
      const el4 = document.getElementById('stat-waiata');
      if (el4) el4.textContent = waiataCount ?? '--';

      // Whakapapa people
      const { count: whakapapaCount } = await sb.from('whakapapa_people')
        .select('id', { count: 'exact', head: true })
        .eq('whanau_id', wid);
      const el5 = document.getElementById('stat-whakapapa');
      if (el5) el5.textContent = whakapapaCount ?? '--';

      // Tauparapara
      const { count: taupCount } = await sb.from('waiata_items')
        .select('id', { count: 'exact', head: true })
        .eq('whanau_id', wid)
        .in('category', ['tauparapara','karakia']);
      const el6 = document.getElementById('stat-tauparapara');
      if (el6) el6.textContent = taupCount ?? '--';
    } catch(e){ console.error('Stats error', e); }
  }

  // ─── Upcoming Birthdays ───
  async function loadBirthdays(){
    const root = document.getElementById('dashboard-birthdays');
    if (!root) return;
    try {
      const wid = typeof window.getMyWhanauId === 'function' ? await window.getMyWhanauId() : null;
      if (!wid) { root.innerHTML = '<p class="muted small">Join a whānau to see birthdays.</p>'; return; }

      // Get whānau member IDs
      const { data: members } = await sb.from('whanau_members')
        .select('user_id')
        .eq('whanau_id', wid);
      if (!members || !members.length) { root.innerHTML = '<p class="muted small">No members found.</p>'; return; }
      const uids = members.map(m => m.user_id);

      // Get profiles with DOB
      const { data: profiles } = await sb.from('profiles')
        .select('id, full_name, avatar_url, date_of_birth')
        .in('id', uids)
        .not('date_of_birth', 'is', null);
      if (!profiles || !profiles.length) { root.innerHTML = '<p class="muted small">No birthdays recorded yet. Add yours in your profile!</p>'; return; }

      const today = new Date();
      const thisYear = today.getFullYear();

      // Calculate next birthday for each person
      const upcoming = profiles.map(p => {
        const dob = new Date(p.date_of_birth + 'T00:00:00');
        let next = new Date(thisYear, dob.getMonth(), dob.getDate());
        if (next < today) next = new Date(thisYear + 1, dob.getMonth(), dob.getDate());
        const daysAway = Math.ceil((next - today) / (1000*60*60*24));
        const age = next.getFullYear() - dob.getFullYear();
        return { ...p, next, daysAway, age };
      }).filter(p => p.daysAway <= 90) // Next 90 days
        .sort((a,b) => a.daysAway - b.daysAway)
        .slice(0, 5);

      if (!upcoming.length) { root.innerHTML = '<p class="muted small">No birthdays in the next 90 days.</p>'; return; }

      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      root.innerHTML = '';
      upcoming.forEach(p => {
        const d = p.next;
        const isToday = p.daysAway === 0;
        const label = isToday ? '<strong style="color:var(--accent)">Today! 🎉</strong>'
          : p.daysAway === 1 ? 'Tomorrow'
          : `in ${p.daysAway} days`;
        const row = document.createElement('div');
        row.className = 'birthday-item';
        row.innerHTML = `<div class="birthday-date"><span class="day">${d.getDate()}</span><span class="month">${months[d.getMonth()]}</span></div>`
          + `<div class="birthday-info"><strong>${esc(p.full_name || 'Whānau')}</strong><br><span class="muted small">${label}</span></div>`;
        root.appendChild(row);
      });
    } catch(e){ console.error('Birthdays error', e); root.innerHTML = '<p class="muted small">Could not load birthdays.</p>'; }
  }

  // ─── Recently Joined Members ───
  async function loadRecentMembers(){
    const root = document.getElementById('dashboard-recent-members');
    if (!root) return;
    try {
      const wid = typeof window.getMyWhanauId === 'function' ? await window.getMyWhanauId() : null;
      if (!wid) { root.innerHTML = '<p class="muted small">Join a whānau first.</p>'; return; }

      const { data } = await sb.from('whanau_members')
        .select('user_id, joined_at')
        .eq('whanau_id', wid)
        .order('joined_at', { ascending: false })
        .limit(5);
      if (!data || !data.length) { root.innerHTML = '<p class="muted small">No members yet.</p>'; return; }

      const uids = data.map(m => m.user_id);
      const { data: profiles } = await sb.from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', uids);
      const profileMap = {};
      (profiles || []).forEach(p => profileMap[p.id] = p);

      root.innerHTML = '';
      data.forEach(m => {
        const p = profileMap[m.user_id] || {};
        const name = p.full_name || 'Whānau';
        const initials = name.split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase();
        const timeAgo = relativeTime(m.joined_at);
        const row = document.createElement('div');
        row.className = 'recent-member';
        if (p.avatar_url) {
          row.innerHTML = `<img src="${esc(p.avatar_url)}" alt="" class="rm-avatar" />`
            + `<div><strong>${esc(name)}</strong><br><span class="muted small">${timeAgo}</span></div>`;
        } else {
          row.innerHTML = `<div class="rm-avatar-placeholder">${esc(initials)}</div>`
            + `<div><strong>${esc(name)}</strong><br><span class="muted small">${timeAgo}</span></div>`;
        }
        root.appendChild(row);
      });
    } catch(e){ console.error('Recent members error', e); root.innerHTML = '<p class="muted small">Could not load.</p>'; }
  }

  // ─── Latest Kōrero ───
  async function loadLatestKorero(){
    const root = document.getElementById('dashboard-latest-korero');
    if (!root) return;
    try {
      const { data } = await sb.from('korero_posts')
        .select('id, title, excerpt, content, featured_image, created_at')
        .order('created_at', { ascending: false })
        .limit(3);
      if (!data || !data.length) { root.innerHTML = '<p class="muted small">No stories yet. <a href="korero.html">Share one!</a></p>'; return; }

      root.innerHTML = '';
      data.forEach(post => {
        const snippet = post.excerpt || (post.content || '').slice(0, 120) + ((post.content || '').length > 120 ? '…' : '');
        const item = document.createElement('a');
        item.href = 'korero.html';
        item.className = 'korero-preview';
        item.innerHTML = (post.featured_image ? `<img src="${esc(post.featured_image)}" alt="" class="kp-thumb" />` : '')
          + `<div class="kp-text"><strong>${esc(post.title || 'Untitled')}</strong><p class="muted small">${esc(snippet)}</p></div>`;
        root.appendChild(item);
      });
    } catch(e){ console.error('Korero error', e); root.innerHTML = '<p class="muted small">Could not load stories.</p>'; }
  }

  // ─── Recent Photos ───
  async function loadRecentPhotos(){
    const root = document.getElementById('dashboard-photos');
    if (!root) return;
    try {
      const { data } = await sb.from('ngatoi_items')
        .select('id, title, media_url')
        .order('created_at', { ascending: false })
        .limit(6);
      if (!data || !data.length) { root.innerHTML = '<p class="muted small">No photos yet.</p>'; return; }

      root.innerHTML = '';
      data.forEach(item => {
        if (!item.media_url) return;
        const img = document.createElement('a');
        img.href = 'nga-toi.html';
        img.innerHTML = `<img src="${esc(item.media_url)}" alt="${esc(item.title || '')}" />`;
        root.appendChild(img);
      });
    } catch(e){ console.error('Photos error', e); root.innerHTML = '<p class="muted small">Could not load photos.</p>'; }
  }

  // ─── Maramataka (Māori Lunar Calendar) ───
  function renderMaramataka(){
    const root = document.getElementById('dashboard-maramataka');
    if (!root) return;

    // 30 nights of the Māori lunar month
    const nights = [
      { name: 'Whiro',       meaning: 'Not a favourable day. Rest and plan.', energy: 'low' },
      { name: 'Tirea',       meaning: 'Energy begins to build. Good for preparation.', energy: 'low' },
      { name: 'Hoata',       meaning: 'A good day for planting and new beginnings.', energy: 'rising' },
      { name: 'Ōue',         meaning: 'Favourable for fishing and gathering.', energy: 'rising' },
      { name: 'Okoro',       meaning: 'Good for inland activities and cultivation.', energy: 'rising' },
      { name: 'Tamatea-āngana', meaning: 'Unsettled energy. Be cautious and reflective.', energy: 'low' },
      { name: 'Tamatea-āio',    meaning: 'Calmer than yesterday but still take care.', energy: 'low' },
      { name: 'Tamatea-aituatahi', meaning: 'Winds and change. Not ideal for planting.', energy: 'low' },
      { name: 'Tamatea-whakapau', meaning: 'Last of the Tamatea days. Energy shifts.', energy: 'low' },
      { name: 'Huna',        meaning: 'A hidden day. Good for reflection and rest.', energy: 'low' },
      { name: 'Ariroa',      meaning: 'Energy is building again. Plan ahead.', energy: 'rising' },
      { name: 'Hotu',        meaning: 'Productive day. Good for work and gathering.', energy: 'high' },
      { name: 'Ōtāne',       meaning: 'Excellent for planting, fishing, and gathering.', energy: 'high' },
      { name: 'Ōrongonui',   meaning: 'Very productive. A great day for all activities.', energy: 'high' },
      { name: 'Mawharu',     meaning: 'Full energy. Good for community and whānau.', energy: 'high' },
      { name: 'Ōmutu',       meaning: 'Energy begins to wane. Complete tasks.', energy: 'falling' },
      { name: 'Mutuwhenua',  meaning: 'Low light. Time for rest and quiet reflection.', energy: 'low' },
      { name: 'Whiro (Hilo)', meaning: 'New moon approaches. A time of renewal.', energy: 'low' },
      { name: 'Tūrua',       meaning: 'New moon. New beginnings and fresh starts.', energy: 'rising' },
      { name: 'Rākaunui',    meaning: 'The fullest night. Excellent for all activities.', energy: 'high' },
      { name: 'Rākaumatohi', meaning: 'Still very productive. Good for fishing.', energy: 'high' },
      { name: 'Takirau',     meaning: 'Abundant energy. Good for gathering food.', energy: 'high' },
      { name: 'Ōike',        meaning: 'Good energy continues. Community activities.', energy: 'high' },
      { name: 'Korekore-tūrua',         meaning: 'Energy fading. Focus on finishing tasks.', energy: 'falling' },
      { name: 'Korekore-piri-ki-Tangaroa', meaning: 'Sea energy rises. Good for ocean activities.', energy: 'rising' },
      { name: 'Tangaroa-ā-mua',  meaning: 'Excellent for fishing and ocean gathering.', energy: 'high' },
      { name: 'Tangaroa-ā-roto', meaning: 'Strong ocean energy. Fish and gather.', energy: 'high' },
      { name: 'Tangaroa-whakapau', meaning: 'Last of the Tangaroa days. Use the energy.', energy: 'falling' },
      { name: 'Ōtāne (late)',    meaning: 'Good energy. Planting and cultivation.', energy: 'rising' },
      { name: 'Ōrongonui (late)', meaning: 'Month draws to a close. Reflect and prepare.', energy: 'falling' }
    ];

    // Calculate approximate lunar day (synodic month ≈ 29.53 days)
    // Known new moon: Jan 6 2000 18:14 UTC
    const knownNew = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
    const now = new Date();
    const daysSince = (now - knownNew) / (1000*60*60*24);
    const lunarAge = ((daysSince % 29.53) + 29.53) % 29.53;
    const nightIndex = Math.floor(lunarAge / 29.53 * 30) % 30;
    const night = nights[nightIndex];

    const energyColors = { low: '#e74c3c', rising: '#f39c12', high: '#2ecc71', falling: '#3498db' };
    const energyLabels = { low: 'Pāpaku / Low', rising: 'Piki ana / Rising', high: 'Tiketike / High', falling: 'Heke ana / Falling' };
    const moonPhase = lunarAge < 1.85 ? '🌑' : lunarAge < 7.38 ? '🌒' : lunarAge < 11.07 ? '🌓' : lunarAge < 14.76 ? '🌔' : lunarAge < 16.61 ? '🌕' : lunarAge < 22.14 ? '🌖' : lunarAge < 25.83 ? '🌗' : '🌘';

    root.innerHTML = `
      <div class="maramataka-display">
        <div class="mara-moon">${moonPhase}</div>
        <div class="mara-info">
          <div class="mara-night">${esc(night.name)}</div>
          <p class="mara-meaning">${esc(night.meaning)}</p>
          <span class="mara-energy" style="background:${energyColors[night.energy]}">
            ${esc(energyLabels[night.energy])}
          </span>
        </div>
      </div>`;
  }

  // ─── Kupu o te Rā (Word of the Day) ───
  function renderKupu(){
    const root = document.getElementById('dashboard-kupu');
    if (!root) return;

    const kupu = [
      { word: 'Aroha', meaning: 'Love, compassion, empathy', example: 'He aroha nui tōku ki a koe — I have great love for you.' },
      { word: 'Whānau', meaning: 'Family, extended family', example: 'Ko tōku whānau tōku kaha — My family is my strength.' },
      { word: 'Manaakitanga', meaning: 'Hospitality, kindness, generosity', example: 'He manaakitanga tō mātou marae — Our marae has great hospitality.' },
      { word: 'Whakapapa', meaning: 'Genealogy, lineage, identity', example: 'Ko wai koe? He aha tō whakapapa? — Who are you? What is your lineage?' },
      { word: 'Kaitiakitanga', meaning: 'Guardianship, stewardship of the environment', example: 'He kaitiaki mātou mō te whenua — We are guardians of the land.' },
      { word: 'Tūrangawaewae', meaning: 'A place to stand, home ground', example: 'Ko Rotorua tōku tūrangawaewae — Rotorua is where I belong.' },
      { word: 'Kotahitanga', meaning: 'Unity, togetherness', example: 'Kia kotahi tātou — Let us be united.' },
      { word: 'Rangatiratanga', meaning: 'Sovereignty, self-determination, leadership', example: 'He rangatira ia — They are a leader.' },
      { word: 'Wairua', meaning: 'Spirit, soul', example: 'Kia ora te wairua — May the spirit be well.' },
      { word: 'Whenua', meaning: 'Land, placenta, country', example: 'Ko te whenua te tūāpapa o te iwi — The land is the foundation of the people.' },
      { word: 'Tangata', meaning: 'Person, people', example: 'He tangata pai ia — They are a good person.' },
      { word: 'Tamariki', meaning: 'Children', example: 'E noho ngā tamariki ki te kura — The children are at school.' },
      { word: 'Atua', meaning: 'God, supernatural being', example: 'Ko Tāne te atua o te ngahere — Tāne is the god of the forest.' },
      { word: 'Mauri', meaning: 'Life force, vital essence', example: 'Kia ora te mauri o te awa — May the life force of the river be well.' },
      { word: 'Tikanga', meaning: 'Custom, practice, protocol', example: 'He tikanga tō te marae — The marae has its protocols.' },
      { word: 'Kōrero', meaning: 'Speak, story, narrative', example: 'Kōrero mai tō kōrero — Tell your story.' },
      { word: 'Tika', meaning: 'Correct, right, fair', example: 'He mea tika tēnā — That is the right thing.' },
      { word: 'Pono', meaning: 'True, genuine, honest', example: 'He tangata pono ia — They are an honest person.' },
      { word: 'Mana', meaning: 'Prestige, authority, spiritual power', example: 'He mana tō te kuia — The elder woman has great mana.' },
      { word: 'Ngākau', meaning: 'Heart, spirit, desire', example: 'He ngākau māhaki tōna — They have a kind heart.' },
      { word: 'Maunga', meaning: 'Mountain', example: 'Ko Taranaki tōku maunga — Taranaki is my mountain.' },
      { word: 'Awa', meaning: 'River', example: 'Ko Waikato tōku awa — Waikato is my river.' },
      { word: 'Moana', meaning: 'Sea, ocean', example: 'He nui te moana — The ocean is vast.' },
      { word: 'Rā', meaning: 'Sun, day', example: 'He rā ātaahua tēnei — This is a beautiful day.' },
      { word: 'Marama', meaning: 'Moon, month, clear', example: 'He marama ātaahua te pō nei — The moon is beautiful tonight.' },
      { word: 'Whetu', meaning: 'Star', example: 'E titi ana ngā whetu — The stars are shining.' },
      { word: 'Kai', meaning: 'Food, eat', example: 'Haere mai ki te kai — Come and eat.' },
      { word: 'Wai', meaning: 'Water', example: 'He wai māori — Fresh water.' },
      { word: 'Taonga', meaning: 'Treasure, prized possession', example: 'He taonga tuku iho — A treasure passed down.' },
      { word: 'Hui', meaning: 'Gathering, meeting', example: 'Kei te haere mātou ki te hui — We are going to the meeting.' },
      { word: 'Karakia', meaning: 'Prayer, incantation', example: 'Me karakia tātou — Let us pray together.' }
    ];

    // Pick word based on day of year
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now - start) / (1000*60*60*24));
    const k = kupu[dayOfYear % kupu.length];

    root.innerHTML = `
      <div class="kupu-display">
        <div class="kupu-word">${esc(k.word)}</div>
        <div class="kupu-meaning">${esc(k.meaning)}</div>
        <div class="kupu-example muted small" style="margin-top:.5rem;font-style:italic">${esc(k.example)}</div>
      </div>`;
  }

  // ─── Helpers ───
  function relativeTime(dateStr){
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + 'd ago';
    return d.toLocaleDateString();
  }

  // ─── Init all dashboard data ───
  async function initDashboard(){
    // Wait for sb and session
    try {
      const { data } = await sb.auth.getSession();
      if (!data.session?.user) return;
    } catch { return; }

    // Fire all in parallel
    await Promise.allSettled([
      loadStats(),
      loadBirthdays(),
      loadRecentMembers(),
      loadLatestKorero(),
      loadRecentPhotos()
    ]);
    // These are synchronous / client-side only
    renderMaramataka();
    renderKupu();
  }

  // Small delay to ensure whanau.js cache is warm
  setTimeout(initDashboard, 200);
})();
