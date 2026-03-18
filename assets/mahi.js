// Mahi projects: CRUD, members with avatars, updates feed — all from Supabase
(function(){
  const STATUS_EMOJI = { active: '🟢', paused: '🟡', completed: '✅' };
  const STATUS_LABEL = { active: 'Active', paused: 'Paused', completed: 'Completed' };

  function waitForSb(cb, tries){
    tries = tries || 0;
    if (window.sb) return cb(window.sb);
    if (tries > 30) return;
    setTimeout(() => waitForSb(cb, tries + 1), 100);
  }

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

  // ─── Auth: show/hide form ──────────────────────────────────────
  function initMahiAuth(sb){
    const formSection = document.getElementById('mahi-form-section');
    const loginPrompt = document.getElementById('mahi-login-prompt');
    if (!formSection && !loginPrompt) return;

    const updateUI = (user) => {
      if (user) {
        if (formSection) formSection.style.display = '';
        if (loginPrompt) loginPrompt.style.display = 'none';
      } else {
        if (formSection) formSection.style.display = 'none';
        if (loginPrompt) loginPrompt.style.display = '';
      }
      // Show/hide join buttons and update forms based on auth
      document.querySelectorAll('.mahi-join-btn, .mahi-update-form').forEach(el => {
        el.style.display = user ? '' : 'none';
      });
    };

    sb.auth.getSession().then(({ data }) => {
      updateUI(data.session?.user || null);
    }).catch(() => updateUI(null));

    sb.auth.onAuthStateChange((_event, session) => {
      updateUI(session?.user || null);
    });
  }

  // ─── Form submission ───────────────────────────────────────────
  function initMahiForm(sb){
    const form = document.getElementById('mahi-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('mahi-form-msg');
      const fd = new FormData(form);
      const { data: sessionData } = await sb.auth.getSession();
      const user = sessionData.session?.user;
      if (!user){ if(msg) msg.textContent = 'Please log in first.'; return; }

      const payload = {
        project_name: fd.get('project_name'),
        project_description: fd.get('project_description') || null,
        status: fd.get('status') || 'active',
        is_public: !!fd.get('is_public'),
        created_by: user.id
      };
      const { data, error } = await sb.from('mahi_projects').insert(payload).select().single();
      if (error){
        if(msg){ msg.textContent = 'Error: ' + error.message; msg.style.color = 'var(--danger, red)'; }
        return;
      }
      // Auto-join the creator as a member
      if (data) {
        await sb.from('mahi_members').insert({ project_id: data.id, user_id: user.id });
      }
      if(msg){ msg.textContent = 'Mahi added successfully!'; msg.style.color = 'var(--accent)'; }
      form.reset();
      loadProjects(sb);
    });
  }

  // ─── Fetch profiles for a set of user IDs ─────────────────────
  async function fetchProfiles(sb, userIds){
    if (!userIds.length) return {};
    const { data } = await sb.from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds);
    const map = {};
    (data || []).forEach(p => { map[p.id] = p; });
    return map;
  }

  // ─── Render avatar stack ───────────────────────────────────────
  function renderAvatarStack(members, profileMap){
    if (!members || !members.length) return '<span class="muted small">No members yet</span>';
    const MAX_SHOW = 5;
    const shown = members.slice(0, MAX_SHOW);
    const extra = members.length - MAX_SHOW;

    const avatars = shown.map(m => {
      const p = profileMap[m.user_id];
      const name = esc(p?.full_name || 'Whānau');
      const initials = (p?.full_name || '?').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
      if (p?.avatar_url) {
        return `<img class="mahi-avatar" src="${esc(p.avatar_url)}" alt="${name}" title="${name}" />`;
      }
      return `<div class="mahi-avatar mahi-avatar-initials" title="${name}">${initials}</div>`;
    }).join('');

    const overflow = extra > 0 ? `<div class="mahi-avatar mahi-avatar-more" title="${extra} more">+${extra}</div>` : '';
    return `<div class="mahi-avatar-stack">${avatars}${overflow}</div>`;
  }

  // ─── Render creator badge ───────────────────────────────────────
  function renderCreatorBadge(creatorId, profileMap){
    const p = profileMap[creatorId];
    const name = esc(p?.full_name || 'Whānau');
    const initials = (p?.full_name || '?').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
    const avatarHtml = p?.avatar_url
      ? `<img class="mahi-creator-avatar" src="${esc(p.avatar_url)}" alt="${name}" />`
      : `<div class="mahi-creator-avatar mahi-avatar-initials">${initials}</div>`;
    return `<div class="mahi-creator">${avatarHtml}<span class="small">Created by <strong>${name}</strong></span></div>`;
  }

  // ─── Render a project card ─────────────────────────────────────
  function renderProjectCard(project, members, profileMap, isCompleted, currentUserId){
    const statusEmoji = STATUS_EMOJI[project.status] || '';
    const statusLabel = STATUS_LABEL[project.status] || project.status;
    const desc = project.project_description || '';
    const avatarHtml = renderAvatarStack(members, profileMap);
    const ago = timeAgo(project.updated_at || project.created_at);
    const isMember = currentUserId && members.some(m => m.user_id === currentUserId);
    const isOwner = currentUserId && project.created_by === currentUserId;

    // Join/Leave button — text depends on membership
    const joinLabel = isMember ? 'Wehe / Leave' : 'Uru mai / Join';
    const joinClass = isMember ? 'btn small mahi-join-btn mahi-leave' : 'btn outline small mahi-join-btn';

    // Status changer — only for the project owner
    const statusSelect = isOwner
      ? `<select class="mahi-status-select" data-project="${project.id}">
          <option value="active"${project.status === 'active' ? ' selected' : ''}>🟢 Active</option>
          <option value="paused"${project.status === 'paused' ? ' selected' : ''}>🟡 Paused</option>
          <option value="completed"${project.status === 'completed' ? ' selected' : ''}>✅ Completed</option>
        </select>`
      : `<span class="mahi-status tag ${project.status}">${statusEmoji} ${statusLabel}</span>`;

    // Creator info
    const creatorHtml = project.created_by ? renderCreatorBadge(project.created_by, profileMap) : '';

    // Delete button — owner only
    const deleteBtn = isOwner
      ? `<button class="btn small mahi-delete-btn" data-project="${project.id}" title="Mukua / Delete project">🗑️ Mukua</button>`
      : '';

    return `<article class="mahi-card${isCompleted ? ' completed' : ''}" data-project-id="${project.id}">
      <div class="mahi-card-header">
        <h3>${esc(project.project_name)}</h3>
        ${statusSelect}
      </div>
      ${desc ? `<p class="mahi-card-desc">${esc(desc)}</p>` : ''}
      ${creatorHtml}
      <div class="mahi-card-meta">
        <span class="muted small">Updated ${ago}</span>
        <span class="muted small">👥 ${members.length} member${members.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="mahi-card-members">
        <span class="mahi-members-label small">Whānau:</span>
        ${avatarHtml}
      </div>
      <div class="mahi-card-actions mahi-auth-action" style="display:none">
        <button class="${joinClass}" data-project="${project.id}">${joinLabel}</button>
        ${deleteBtn}
      </div>
    </article>`;
  }

  // ─── Load projects ─────────────────────────────────────────────
  async function loadProjects(sb){
    const activeGrid = document.getElementById('active-projects-grid');
    const pausedGrid = document.getElementById('paused-projects-grid');
    const completedGrid = document.getElementById('completed-projects-grid');
    if (!activeGrid && !pausedGrid && !completedGrid) return;

    // Get current user
    const { data: sessionData } = await sb.auth.getSession();
    const currentUserId = sessionData.session?.user?.id || null;

    // Fetch all projects
    const { data: projects, error } = await sb.from('mahi_projects')
      .select('*').order('updated_at', { ascending: false });

    if (error || !projects) {
      if (activeGrid) activeGrid.innerHTML = '<p class="muted">Could not load projects.</p>';
      if (completedGrid) completedGrid.innerHTML = '<p class="muted">Could not load projects.</p>';
      return;
    }

    // Fetch all members
    const projectIds = projects.map(p => p.id);
    let allMembers = [];
    if (projectIds.length) {
      const { data: membersData } = await sb.from('mahi_members')
        .select('*').in('project_id', projectIds);
      allMembers = membersData || [];
    }

    // Fetch profiles for all member user IDs + project creators
    const creatorIds = projects.map(p => p.created_by).filter(Boolean);
    const memberUserIds = allMembers.map(m => m.user_id);
    const userIds = [...new Set([...memberUserIds, ...creatorIds])];
    const profileMap = await fetchProfiles(sb, userIds);

    // Group members by project
    const membersByProject = {};
    allMembers.forEach(m => {
      if (!membersByProject[m.project_id]) membersByProject[m.project_id] = [];
      membersByProject[m.project_id].push(m);
    });

    // Split into active, paused, completed
    const active = projects.filter(p => p.status === 'active');
    const paused = projects.filter(p => p.status === 'paused');
    const completed = projects.filter(p => p.status === 'completed');

    if (activeGrid) {
      if (active.length) {
        activeGrid.innerHTML = active.map(p =>
          renderProjectCard(p, membersByProject[p.id] || [], profileMap, false, currentUserId)
        ).join('');
      } else {
        activeGrid.innerHTML = '<p class="muted">Kāore he mahi kei te haere. / No active projects yet.</p>';
      }
    }

    if (pausedGrid) {
      if (paused.length) {
        pausedGrid.innerHTML = paused.map(p =>
          renderProjectCard(p, membersByProject[p.id] || [], profileMap, false, currentUserId)
        ).join('');
      } else {
        pausedGrid.innerHTML = '<p class="muted">Kāore he mahi kua tārewa. / No paused projects.</p>';
      }
    }

    if (completedGrid) {
      if (completed.length) {
        completedGrid.innerHTML = completed.map(p =>
          renderProjectCard(p, membersByProject[p.id] || [], profileMap, true, currentUserId)
        ).join('');
      } else {
        completedGrid.innerHTML = '<p class="muted">Kāore he mahi kua oti. / No completed projects yet.</p>';
      }
    }

    // Attach interactive handlers
    setupJoinButtons(sb);
    setupStatusChanges(sb);
    setupDeleteButtons(sb);

    // Show auth-gated actions if logged in
    if (currentUserId) {
      document.querySelectorAll('.mahi-auth-action').forEach(el => {
        el.style.display = '';
      });
    }
  }

  // ─── Join / Leave button logic ──────────────────────────────────
  function setupJoinButtons(sb){
    document.querySelectorAll('.mahi-join-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const projectId = btn.getAttribute('data-project');
        const { data: sessionData } = await sb.auth.getSession();
        const user = sessionData.session?.user;
        if (!user) return;

        btn.disabled = true;
        const isLeaving = btn.classList.contains('mahi-leave');

        if (isLeaving) {
          await sb.from('mahi_members').delete().eq('project_id', projectId).eq('user_id', user.id);
        } else {
          await sb.from('mahi_members').insert({ project_id: projectId, user_id: user.id });
        }
        // Reload to reflect new membership + avatars
        loadProjects(sb);
      });
    });
  }

  // ─── Status change logic (owner only) ──────────────────────────
  function setupStatusChanges(sb){
    document.querySelectorAll('.mahi-status-select').forEach(select => {
      select.addEventListener('change', async () => {
        const projectId = select.getAttribute('data-project');
        const newStatus = select.value;
        select.disabled = true;

        const { error } = await sb.from('mahi_projects')
          .update({ status: newStatus })
          .eq('id', projectId);

        if (error) {
          alert('Could not update status: ' + error.message);
          select.disabled = false;
          return;
        }
        // Reload so the card moves between active/completed sections
        loadProjects(sb);
      });
    });
  }

  // ─── Delete project logic (owner only) ─────────────────────────
  function setupDeleteButtons(sb){
    document.querySelectorAll('.mahi-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const projectId = btn.getAttribute('data-project');
        if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;

        btn.disabled = true;
        btn.textContent = 'Deleting…';

        const { error } = await sb.from('mahi_projects')
          .delete()
          .eq('id', projectId);

        if (error) {
          alert('Could not delete: ' + error.message);
          btn.disabled = false;
          btn.textContent = '🗑️ Mukua';
          return;
        }
        loadProjects(sb);
        loadUpdates(sb);
      });
    });
  }

  // ─── Load updates feed ─────────────────────────────────────────
  async function loadUpdates(sb){
    const feed = document.getElementById('mahi-updates-feed');
    if (!feed) return;

    const { data: updates, error } = await sb.from('mahi_updates')
      .select('*, mahi_projects(project_name)')
      .order('created_at', { ascending: false })
      .limit(15);

    if (error || !updates || !updates.length) {
      feed.innerHTML = '<p class="muted">Kāore he whakahōutanga. / No updates yet.</p>';
      return;
    }

    // Fetch author profiles
    const authorIds = [...new Set(updates.map(u => u.created_by).filter(Boolean))];
    const profileMap = await fetchProfiles(sb, authorIds);

    feed.innerHTML = updates.map(u => {
      const author = profileMap[u.created_by];
      const authorName = esc(author?.full_name || 'Whānau');
      const initials = (author?.full_name || '?').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
      const projectName = esc(u.mahi_projects?.project_name || 'Unknown project');
      const ago = timeAgo(u.created_at);

      const avatarHtml = author?.avatar_url
        ? `<img class="mahi-update-avatar" src="${esc(author.avatar_url)}" alt="${authorName}" />`
        : `<div class="mahi-update-avatar mahi-avatar-initials">${initials}</div>`;

      return `<div class="mahi-update-item">
        ${avatarHtml}
        <div class="mahi-update-content">
          <p><strong>${authorName}</strong> on <strong>${projectName}</strong></p>
          <p>${esc(u.update_text)}</p>
          <span class="mahi-update-time muted small">${ago}</span>
        </div>
      </div>`;
    }).join('');

    // Add the inline update form if user is logged in
    setupUpdateForm(sb);
  }

  // ─── Inline update posting ─────────────────────────────────────
  async function setupUpdateForm(sb){
    const feed = document.getElementById('mahi-updates-feed');
    if (!feed) return;

    const { data: sessionData } = await sb.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return;

    // Fetch projects the user is a member of
    const { data: memberships } = await sb.from('mahi_members')
      .select('project_id, mahi_projects(id, project_name)')
      .eq('user_id', user.id);

    if (!memberships || !memberships.length) return;

    const options = memberships.map(m => {
      const p = m.mahi_projects;
      return `<option value="${p.id}">${esc(p.project_name)}</option>`;
    }).join('');

    const formHtml = `<div class="mahi-update-compose">
      <h4>📝 Post an Update</h4>
      <form id="mahi-update-form" class="form">
        <select name="project_id" required>${options}</select>
        <textarea name="update_text" rows="2" required placeholder="Share progress on this mahi…"></textarea>
        <button type="submit" class="btn small">Tuku / Post</button>
        <span class="muted small" id="mahi-update-msg"></span>
      </form>
    </div>`;

    feed.insertAdjacentHTML('afterbegin', formHtml);

    const updateForm = document.getElementById('mahi-update-form');
    if (updateForm) {
      updateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(updateForm);
        const msg = document.getElementById('mahi-update-msg');
        const { error } = await sb.from('mahi_updates').insert({
          project_id: fd.get('project_id'),
          update_text: fd.get('update_text'),
          created_by: user.id
        });
        if (error) {
          if (msg) { msg.textContent = 'Error: ' + error.message; msg.style.color = 'var(--danger, red)'; }
          return;
        }
        updateForm.reset();
        if (msg) { msg.textContent = 'Update posted!'; msg.style.color = 'var(--accent)'; }
        loadUpdates(sb);
      });
    }
  }

  // ─── Init ──────────────────────────────────────────────────────
  waitForSb(function(sb){
    initMahiAuth(sb);
    initMahiForm(sb);
    loadProjects(sb);
    loadUpdates(sb);
  });
})();
