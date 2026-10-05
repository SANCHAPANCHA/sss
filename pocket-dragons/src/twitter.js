import { h } from './dom.js';

let loader;

function loadWidgets() {
  loader ??= new Promise((resolve, reject) => {
    if (window.twttr?.widgets) return resolve(window.twttr);
    const s = document.createElement('script');
    s.src = 'https://platform.twitter.com/widgets.js';
    s.async = true;
    s.onload = () => (window.twttr?.ready ? window.twttr.ready(resolve) : reject(new Error('X widgets unavailable')));
    s.onerror = () => reject(new Error('X widgets blocked'));
    document.head.append(s);
  });
  return loader;
}

const fallback = (url) =>
  h(
    'a',
    { class: 'tweet-fallback', href: url, target: '_blank', rel: 'noopener noreferrer' },
    h('span', { class: 'x-logo' }, '𝕏'),
    h('span', {}, 'Preview unavailable — open the post on X ↗'),
  );

export async function embedTweet(slot) {
  const { tweetId, url } = slot.dataset;
  try {
    const twttr = await loadWidgets();
    const holder = h('div', { class: 'tweet-embed' });
    slot.append(holder);
    const el = await twttr.widgets.createTweet(tweetId, holder, {
      theme: 'dark',
      dnt: true,
      conversation: 'none',
      align: 'center',
    });
    if (!el) throw new Error('Post unavailable');
    slot.querySelector('.tweet-skeleton')?.remove();
  } catch {
    slot.replaceChildren(fallback(url));
  }
}
