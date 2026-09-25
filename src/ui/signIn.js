import { getEnabledProviders, signIn } from '../core/community.js';
import { icon } from './icons.js';

// "Sign in with …" chooser. Only providers switched on in Supabase are listed;
// with just one, it goes straight there.
let dialog = null;

function build() {
  dialog = document.createElement('div');
  dialog.className = 'signin-backdrop hidden';
  dialog.innerHTML = `
    <div class="signin-dialog" role="dialog" aria-modal="true" aria-labelledby="signin-title">
      <button type="button" class="panel-close" aria-label="Close">${icon('close')}</button>
      <h2 id="signin-title">Sign in to aiship</h2>
      <p>Comment, add notes to explanations, and share your own sketches.</p>
      <div class="signin-options"></div>
      <p class="signin-status"></p>
    </div>
  `;
  document.body.append(dialog);
  const close = () => dialog.classList.add('hidden');
  dialog.querySelector('.panel-close').addEventListener('click', close);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

async function go(provider, status) {
  const { error } = await signIn(provider);
  if (error && status) status.textContent = `Couldn't start sign-in: ${error.message}`;
}

export async function promptSignIn() {
  const providers = await getEnabledProviders();
  if (providers.length <= 1) return go(providers[0]?.id ?? 'github');

  if (!dialog) build();
  const options = dialog.querySelector('.signin-options');
  const status = dialog.querySelector('.signin-status');
  status.textContent = '';
  options.textContent = '';
  for (const p of providers) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn btn-ghost signin-${p.id}`;
    b.textContent = `Continue with ${p.label}`;
    b.addEventListener('click', () => go(p.id, status));
    options.append(b);
  }
  dialog.classList.remove('hidden');
}
