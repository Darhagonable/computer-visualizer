import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { init, app } from './mock/store.svelte';

// Build the mock machine and start ticking before the first render.
init();

// Running inside the native shell (Tauri)? Ask it what we're on — this is the only
// IPC call in M1 and exists to prove the Rust ↔ UI bridge works.
if ('__TAURI_INTERNALS__' in window) {
  import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke<{ os: string; arch: string; mock: boolean }>('platform_info'))
    .then((info) => {
      const os = info.os === 'windows' ? 'Windows' : info.os === 'linux' ? 'Linux' : info.os === 'macos' ? 'macOS' : info.os;
      app.native = `${os} ${info.arch}`;
    })
    .catch(() => {
      app.native = null;
    });
}

export default mount(App, {
  target: document.getElementById('app')!,
});
