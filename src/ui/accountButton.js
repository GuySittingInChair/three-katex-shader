import { onAuthChange } from '../core/community.js';
import { promptSignIn } from './signIn.js';

// Signed out: opens the sign-in chooser. Signed in: goes to your profile
// (which is where signing out lives).
export function createAccountButton(button, { onOpenProfile }) {
  let username = null;

  onAuthChange((user, profile) => {
    username = user ? profile?.username ?? null : null;
    button.textContent = '';
    if (!user) {
      button.textContent = 'Sign in';
      button.title = 'Sign in to comment, add notes and share sketches';
      return;
    }
    if (profile?.avatar_url) {
      const img = document.createElement('img');
      img.className = 'account-avatar';
      img.src = profile.avatar_url;
      img.alt = '';
      button.append(img);
    }
    const name = document.createElement('span');
    name.className = 'account-name';
    name.textContent = `@${profile?.username ?? 'you'}`;
    button.append(name);
    button.title = 'Your profile';
  });

  button.addEventListener('click', () => {
    if (username) onOpenProfile(username);
    else promptSignIn();
  });
}
