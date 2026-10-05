import QRCode from 'qrcode';

const urlInput = document.getElementById('url');
const countInput = document.getElementById('count');
const grid = document.getElementById('grid');

// Default: the menu page next to this one
urlInput.value = new URL('./', location.href).href;

async function generate() {
  const base = urlInput.value.trim();
  const count = Math.max(1, Math.min(200, Number(countInput.value) || 1));
  grid.innerHTML = '';
  for (let n = 1; n <= count; n++) {
    const url = new URL(base);
    url.searchParams.set('table', n);
    const src = await QRCode.toDataURL(url.href, {
      width: 400, margin: 1, errorCorrectionLevel: 'M',
      color: { dark: '#1a0d05', light: '#ffffff' },
    });
    const card = document.createElement('div');
    card.className = 'qr-card';
    card.innerHTML = `<div class="brand">BURGER<span>LAB</span></div>
      <img src="${src}" alt="QR стол ${n}" />
      <div class="tbl">Стол №${n}</div>
      <small>Наведите камеру — откроется меню</small>`;
    grid.appendChild(card);
  }
}

document.getElementById('gen').addEventListener('click', () => generate().catch((e) => alert(e.message)));
document.getElementById('print').addEventListener('click', () => window.print());
generate();
