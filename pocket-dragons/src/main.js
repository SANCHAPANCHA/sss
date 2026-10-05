import './style.css';
import { api } from './api.js';
import { setUser } from './state.js';
import { initAuth } from './auth.js';
import { initFeed } from './feed.js';
import { initChat } from './chat.js';
import { initHoard } from './hoard.js';
import { initAma } from './ama.js';
import { socket } from './socket.js';

initAuth();
initFeed();
initChat();
initHoard();
initAma();

api('/me')
  .then(({ user }) => setUser(user))
  .catch(() => setUser(null))
  .finally(() => socket.connect());

const canvas = document.getElementById('egg');
const hasWebGL = (() => {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
})();
const noEgg = () => canvas.closest('.hero-visual').classList.add('no-webgl');
if (hasWebGL) {
  import('./egg3d.js')
    .then((m) => m.mountEgg(canvas))
    .catch((err) => {
      console.warn('3D egg disabled:', err);
      noEgg();
    });
} else {
  noEgg();
}
