import { AMA } from './config.js';

function nextAma(now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), AMA.hour, AMA.minute));
  d.setUTCDate(d.getUTCDate() + ((AMA.weekday - d.getUTCDay() + 7) % 7));
  if (d.getTime() + AMA.durationMin * 60_000 <= now.getTime()) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

export function initAma() {
  const $ = (n) => document.querySelector(`[data-ama="${n}"]`);
  const timer = $('timer');
  const badge = $('badge');
  const when = $('when');
  $('link').href = AMA.url;

  const unit = (v, label) => `<div class="ama-unit"><b>${String(v).padStart(2, '0')}</b><span>${label}</span></div>`;
  const tick = () => {
    const now = new Date();
    const start = nextAma(now);
    const ms = start - now;
    when.textContent = `Next one: ${start.toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} (your time)`;
    const live = ms <= 0;
    badge.textContent = live ? '● Live now' : 'Weekly AMA';
    badge.classList.toggle('is-live', live);
    if (live) {
      timer.innerHTML = '<div class="ama-live">The AMA is live — jump in!</div>';
      return;
    }
    const s = Math.floor(ms / 1000);
    timer.innerHTML =
      unit(Math.floor(s / 86400), 'days') + unit(Math.floor((s % 86400) / 3600), 'hrs') + unit(Math.floor((s % 3600) / 60), 'min') + unit(s % 60, 'sec');
  };
  tick();
  setInterval(tick, 1000);
}
