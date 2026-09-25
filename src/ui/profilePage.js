import { getProfileByUsername, updateProfile, onAuthChange, getProfile, signOut } from '../core/community.js';
import { authorOf } from '../core/authors.js';
import { createSketchGrid } from './sketchGrid.js';

// /u/<username>: who someone is and every sketch they've made. On your own
// profile you can edit your name and bio, start a new sketch, or sign out.
export function createProfilePage(container, { onPick, onWriteSketch, onSignedOut }) {
  container.innerHTML = `
    <div class="profile-inner">
      <a class="brand" href="/" data-link>aiship</a>
      <header class="profile-head">
        <div class="profile-avatar"></div>
        <div class="profile-info">
          <h1 class="profile-name"></h1>
          <p class="profile-handle"></p>
          <p class="profile-bio"></p>
          <div class="profile-actions hidden">
            <button type="button" class="btn btn-primary" data-role="write">Write a new sketch</button>
            <button type="button" class="btn btn-ghost" data-role="edit">Edit profile</button>
            <button type="button" class="btn btn-ghost" data-role="signout">Sign out</button>
          </div>
          <form class="profile-edit hidden">
            <label>Display name <input name="display_name" maxlength="60" /></label>
            <label>Bio <textarea name="bio" rows="3" maxlength="500" placeholder="What you like to make, what you're learning…"></textarea></label>
            <div class="profile-edit-actions">
              <button type="submit" class="btn btn-primary">Save</button>
              <button type="button" class="btn btn-ghost" data-role="cancel">Cancel</button>
              <span class="profile-status"></span>
            </div>
          </form>
        </div>
      </header>
      <h2 class="profile-section">Sketches</h2>
      <div class="profile-grid"></div>
    </div>
  `;
  const q = (sel) => container.querySelector(sel);
  const form = q('.profile-edit');
  let username = null;
  let shown = null; // the profile row being shown, if the person has signed in before

  const grid = createSketchGrid(q('.profile-grid'), {
    onPick,
    controls: false,
    filter: (s) => username && authorOf(s).toLowerCase() === username.toLowerCase(),
  });

  const isMine = () => Boolean(shown && getProfile() && shown.id === getProfile().id);

  function renderHeader() {
    const name = shown?.display_name || shown?.username || username;
    q('.profile-name').textContent = name;
    q('.profile-handle').textContent = `@${shown?.username || username}`;
    q('.profile-bio').textContent =
      shown?.bio || (isMine() ? 'No bio yet. Tell people what you like to make.' : '');
    const avatar = q('.profile-avatar');
    avatar.textContent = '';
    if (shown?.avatar_url) {
      const img = document.createElement('img');
      img.src = shown.avatar_url;
      img.alt = '';
      avatar.append(img);
    } else {
      avatar.textContent = (name || '?').slice(0, 1).toUpperCase();
    }
    q('.profile-actions').classList.toggle('hidden', !isMine());
    grid.refresh();
    const empty = q('.profile-grid .grid-empty');
    empty.textContent = isMine() ? "You haven't shared a sketch yet. Write one and press Share." : 'No sketches yet.';
  }

  async function show(name) {
    username = name;
    shown = null;
    form.classList.add('hidden');
    document.title = `@${name} · aiship`;
    renderHeader();
    try {
      shown = await getProfileByUsername(name);
    } catch {
      shown = null;
    }
    if (username !== name) return; // navigated elsewhere meanwhile
    renderHeader();
  }

  q('[data-role="write"]').addEventListener('click', () => onWriteSketch());
  q('[data-role="signout"]').addEventListener('click', async () => {
    await signOut();
    onSignedOut();
  });
  q('[data-role="edit"]').addEventListener('click', () => {
    form.display_name.value = shown?.display_name || '';
    form.bio.value = shown?.bio || '';
    q('.profile-status').textContent = '';
    form.classList.remove('hidden');
    form.display_name.focus();
  });
  q('[data-role="cancel"]').addEventListener('click', () => form.classList.add('hidden'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      shown = await updateProfile({
        display_name: form.display_name.value.trim() || null,
        bio: form.bio.value.trim() || null,
      });
      form.classList.add('hidden');
      renderHeader();
    } catch (err) {
      q('.profile-status').textContent = `Couldn't save: ${err.message}`;
    }
  });

  onAuthChange(() => {
    if (username) show(username);
  });

  return { show, refresh: () => grid.refresh() };
}
