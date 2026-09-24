import { onAuthChange, signIn, signOut } from '../core/community.js';

export function createAccountButton(button, { toast }) {
  let signedIn = false;

  onAuthChange((user, profile) => {
    signedIn = Boolean(user);
    button.textContent = '';
    if (!user) {
      button.textContent = 'Sign in';
      button.title = 'Sign in with GitHub to comment, add notes and share sketches';
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
    button.title = 'Signed in. Click to sign out.';
  });

  button.addEventListener('click', async () => {
    if (!signedIn) {
      const { error } = await signIn();
      if (error) toast(`Sign-in failed: ${error.message}`);
      return;
    }
    if (window.confirm('Sign out?')) await signOut();
  });
}
