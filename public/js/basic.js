const form = document.getElementById('basic-form');
const addressInput = document.getElementById('basic-address');
const status = document.getElementById('basic-status');
const results = document.getElementById('basic-results');
const suggestionButtons = document.querySelectorAll('.basic-suggestion-btn');
const submitButton = form.querySelector('button[type="submit"]');
let isLoading = false;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const measurement = (value, fallback = '--') => value?.value == null ? fallback : `${esc(value.value)}${esc(value.unit || '')}`;

function renderCurrent(card) {
  const icon = esc(card.icon || 'bi bi-cloud');
  const poem = card.meme ? `<p class="card-note poem">“${esc(card.meme)}”</p>` : '';
  return `
    <article class="basic-card glass">
      <div class="basic-card-heading">
        <h2><i class="bi bi-geo-alt-fill" aria-hidden="true"></i> Hiện tại · ${esc(card.location)}</h2>
        <span class="card-meta">${esc(card.condition || '')}</span>
      </div>
      <div class="basic-current">
        <div>
          <strong>${measurement(card.current?.temperature)}</strong>
          <span>${esc(card.condition || 'Chưa rõ tình trạng')}</span>
        </div>
        <i class="${icon} weather-icon" aria-hidden="true"></i>
      </div>
      <div class="basic-stats">
        <span><small>Độ ẩm</small>${measurement(card.current?.humidity)}</span>
        <span><small>Gió</small>${measurement(card.current?.windSpeed)}</span>
      </div>
      ${poem}
    </article>`;
}

function renderForecast(card) {
  const days = Array.isArray(card.days) ? card.days : [];
  return `
    <article class="basic-card glass">
      <div class="basic-card-heading">
        <h2><i class="bi bi-calendar3" aria-hidden="true"></i> Dự báo · ${esc(card.location)}</h2>
        <span class="card-meta">${days.length} ngày</span>
      </div>
      <div class="basic-forecast">
        ${days.map((day, index) => `
          <div class="basic-day ${index === 0 ? 'today' : ''}">
            <strong>${index === 0 ? 'Hôm nay' : esc(day.date)}</strong>
            <i class="${esc(day.icon || 'bi bi-cloud')}" aria-hidden="true"></i>
            <span>${esc(day.condition || 'Chưa rõ')}</span>
            <b>${measurement(day.temperatureMax)} / ${measurement(day.temperatureMin)}</b>
            <small>Mưa ${measurement(day.rainProbability, '--')}</small>
          </div>`).join('')}
      </div>
    </article>`;
}

function renderCards(cards) {
  return cards.map((card) => card.type === 'current' ? renderCurrent(card) : renderForecast(card)).join('');
}

suggestionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const city = button.dataset.city || '';
    if (!city) return;
    addressInput.value = city;
    addressInput.focus();
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isLoading) return;

  const address = addressInput.value.trim();
  if (!address) return;

  isLoading = true;
  status.textContent = 'Đang lấy dữ liệu thời tiết…';
  submitButton.disabled = true;

  try {
    const response = await fetch('/basic/weather', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) throw new Error(json?.message || 'Không lấy được dữ liệu.');

    results.innerHTML = renderCards(json.data.weatherCards);
    status.textContent = `Đã cập nhật thời tiết cho ${address}.`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    isLoading = false;
    submitButton.disabled = false;
  }
});
