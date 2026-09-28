// $ là tên viết tắt của document.getElementById; lấy sẵn phần tử để dùng lại trong các hàm.
const $ = (id) => document.getElementById(id);
const messages = $('messages');
const messagesArea = $('messages-area');
const results = $('results');
const chatInput = $('chat-input');
const sendButton = $('send-button');
const resultDot = $('result-dot');
const promptSelect = $('prompt-select');
const clearChatButton = $('clear-chat');
const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const defaultGreeting = 'Chào bạn! Hôm nay mình có thể giúp gì?';
// Đây là câu chờ vui cho giao diện, không phải trạng thái kết nối dịch vụ thật.
const loadingMessages = [
	'Đang kết nối tới NASA…',
	'Đang hỏi FPoly…',
	'Đang hỏi Tập Cận Bình…',
	'Đang hỏi Kim Jong Un…',
	'Đang cảm thấy như là Phạm Nhật Vượng…',
	'Cảm thấy như là Phạm Nhật Vượng ye... ye…',
];
const historyKey = 'weatherbot-history-v1';
const maxHistoryMessages = 100;
const maxHistoryCards = 30;

// Hai mảng này là dữ liệu đang dùng trên trang; localStorage giữ bản sao sau khi tải lại.
let conversationHistory = [];
let weatherCardsHistory = [];

// Mã hoá ký tự đặc biệt trước khi ghép vào HTML vì nội dung từ người dùng/API không đáng tin.
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
}[character]));

const timeNow = () => new Date().toLocaleTimeString('vi-VN', {
	hour: '2-digit',
	minute: '2-digit',
});

const iconTone = (icon = '') => {
	if (icon.includes('lightning')) return 'wx-storm';
	if (['rain', 'drizzle', 'snow'].some((name) => icon.includes(name))) return 'wx-rain';
	if (['cloud-sun', 'cloud-moon'].some((name) => icon.includes(name))) return 'wx-partly';
	if (icon.includes('cloud')) return 'wx-cloud';
	if (icon.includes('sun')) return 'wx-sun';
	return '';
};

const formatMeasurement = (measurement, round = false) => {
	// `?.` giúp đọc an toàn khi thiếu số đo; giá trị null được xem là thiếu, không đổi thành số 0.
	if (measurement?.value == null || measurement.value === '' || !Number.isFinite(Number(measurement.value))) {
		return 'Chưa có dữ liệu';
	}
	const value = round ? Math.round(Number(measurement.value)) : measurement.value;
	return `${esc(value)}${esc(measurement.unit || '')}`;
};

// Mỗi tool call tạo một chip; destructuring lấy name và arguments ra khỏi object.
const toolChipsTemplate = (calledFunctions = []) => calledFunctions.map(({ name, arguments: args }) => {
	const argumentSummary = Object.entries(args || {})
		.map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
		.join(' · ');
	const label = argumentSummary ? `${name} · ${argumentSummary}` : name;
	return `
		<span class="tool-chip" title="${esc(label)}">
			<i class="bi bi-check2" aria-hidden="true"></i>
			<span>${esc(label)}</span>
		</span>`;
}).join('');

// Hàm thuần: cùng một tin nhắn luôn tạo cùng HTML, không đọc hay sửa DOM.
function createMessageHtml(message) {
	const chips = message.role === 'bot' ? toolChipsTemplate(message.calledFunctions || []) : '';
	return `
		<article class="message ${message.role}">
			${chips ? `<div class="chips">${chips}</div>` : ''}
			<div class="bubble">${esc(message.text)}</div>
			<span class="message-meta">${esc(message.time)}</span>
		</article>`;
}

function saveHistory() {
	try {
		// localStorage chỉ lưu chuỗi; JSON.stringify đổi object lịch sử thành chuỗi JSON.
		localStorage.setItem(historyKey, JSON.stringify({
			version: 1,
			messages: conversationHistory,
			weatherCards: weatherCardsHistory,
		}));
	} catch (error) {
		console.warn('Không thể lưu lịch sử hội thoại', error);
	}
}

function loadHistory() {
	try {
		// JSON.parse có thể lỗi nếu dữ liệu hỏng, nên đọc trong try/catch để trang vẫn chạy được.
		const stored = JSON.parse(localStorage.getItem(historyKey) || 'null');
		if (stored?.version !== 1) return;
		// filter bỏ dữ liệu sai, slice giới hạn độ dài, map chỉ giữ các trường giao diện cần dùng.
		conversationHistory = (Array.isArray(stored.messages) ? stored.messages : [])
			// filter() giữ lại phần tử thỏa điều kiện, tương tự WHERE trong SQL.
			.filter((entry) => ['user', 'bot'].includes(entry?.role) && typeof entry.text === 'string')
			// slice(-maxHistoryMessages) lấy tối đa N phần tử cuối cùng để không lỡ dữ liệu mới nhất.
			.slice(-maxHistoryMessages)
			// map() biến mỗi phần tử thành object mới, ở đây là chuẩn hóa dữ liệu mới.
			.map((entry) => {
				// Đổi lời chào mặc định cũ sang nội dung đa năng, nhưng giữ nguyên các tin nhắn khác.
				const oldGreeting = 'Chào bạn! Bạn muốn xem thời tiết ở đâu?';
				return {
					role: entry.role,
					text: entry.text === oldGreeting ? defaultGreeting : entry.text,
					time: typeof entry.time === 'string' ? entry.time : '',
					calledFunctions: Array.isArray(entry.calledFunctions) ? entry.calledFunctions : [],
				};
			});
		weatherCardsHistory = (Array.isArray(stored.weatherCards) ? stored.weatherCards : [])
			// filter() đảm bảo chỉ giữ card hợp lệ, bỏ card không có type hoặc null.
			.filter((card) => card && ['current', 'forecast', 'youtube'].includes(card.type))
			// slice(0, maxHistoryCards) giữ phần đầu, tức là card mới nhất nhất.
			.slice(0, maxHistoryCards)
			// map() làm sạch dữ liệu lưu cũ trước khi hiển thị lại.
			.map((card) => {
				// Bỏ localFlavor cũ và không hiển thị meme một dòng từ card đã lưu trước khi đổi sang thơ.
				const cleanedCard = { ...card };
				delete cleanedCard.localFlavor;
				if (cleanedCard.type === 'current'
					&& typeof cleanedCard.meme === 'string'
					&& cleanedCard.meme.split('\n').length !== 4) {
					cleanedCard.meme = null;
				}
				return cleanedCard;
			});
	} catch (error) {
		console.warn('Không thể đọc lịch sử hội thoại', error);
	}
}

// map() tạo HTML cho từng tin nhắn; join('') ghép các đoạn lại mà không chèn dấu phẩy.
function createConversationHtml(history) {
	// map() tạo ra một mảng string HTML cho từng tin nhắn.
	// join('') gộp chúng lại thành một chuỗi duy nhất để gán vào innerHTML một lần.
	return history.map(createMessageHtml).join('');
}

function showConversation() {
	messages.innerHTML = createConversationHtml(conversationHistory);
}

function addConversationMessage(role, text, calledFunctions = []) {
	const entry = { role, text, time: timeNow(), calledFunctions };
	conversationHistory.push(entry);
	// slice(-maxHistoryMessages) nghĩa là "lấy N phần tử cuối cùng".
	// Ví dụ: [a,b,c,d].slice(-2) => [c,d], giúp giữ lịch sử gần nhất và bỏ phần cũ.
	conversationHistory = conversationHistory.slice(-maxHistoryMessages);
	saveHistory();
	showConversation();
	scrollMessages();
}

function scrollMessages() {
	messagesArea.scrollTop = messagesArea.scrollHeight;
}

function addUserMessage(text) {
	addConversationMessage('user', text);
}

function showPendingMessage() {
	// Spinner chỉ tạm thời, không lưu vào lịch sử; khi API trả lời, nó được thay bằng tin nhắn bot.
	messages.innerHTML += `
		<article class="message bot" aria-live="polite">
			<div class="bubble d-flex align-items-center gap-2">
				<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
				<span class="loading-status">${esc(loadingMessages[0])}</span>
			</div>
		</article>`;
	scrollMessages();

	let messageIndex = 0;
	const loadingStatus = messages.querySelector('.loading-status');
	return setInterval(() => {
		messageIndex = (messageIndex + 1) % loadingMessages.length;
		loadingStatus.textContent = loadingMessages[messageIndex];
	}, 900);
}

function addBotResponse(data) {
	const calledFunctions = Array.isArray(data.calledFunctions) ? data.calledFunctions : [];
	const answer = data.answer || 'Mình chưa tìm được thông tin phù hợp. Bạn thử hỏi lại nhé.';
	addConversationMessage('bot', answer, calledFunctions);
}

function addBotError(text) {
	addConversationMessage('bot', text);
}

// Hàm thuần dựng khung dùng chung cho cả card thời tiết hiện tại và dự báo.
function createCardShell(title, body, receivedAt) {
	return `
		<article class="result-card glass">
			<div class="card-top">
				<h3 class="card-title">${title}</h3>
				<span class="card-meta">${esc(receivedAt || '')}</span>
			</div>
			${body}
		</article>`;
}

function createCurrentCardHtml(card) {
	const current = card.current || {};
	const temperature = formatMeasurement(current.temperature, true);
	const icon = esc(card.icon || 'bi bi-cloud');
	const stats = [
		['Độ ẩm', current.humidity],
		['Gió', current.windSpeed],
	].map(([label, measurement]) => `
		<div class="col">
			<div class="stat">
				<div class="stat-label">${label}</div>
				<div class="stat-value">${formatMeasurement(measurement)}</div>
			</div>
		</div>`).join('');
	const poem = card.meme
		? `<p class="card-note poem">“${esc(card.meme)}”</p>`
		: '';

	return createCardShell(
		`<i class="bi bi-geo-alt-fill me-1" aria-hidden="true"></i>${esc(card.location || 'Thời tiết hiện tại')}`,
		`<div class="current-summary">
			<div>
				<div class="temperature">${temperature}</div>
				<div class="condition">${esc(card.condition || 'Chưa rõ tình trạng thời tiết')}</div>
			</div>
			<i class="${icon} weather-icon ${iconTone(card.icon)}" aria-hidden="true"></i>
		</div>
		<div class="row row-cols-2 g-2 stats">${stats}</div>
		${poem}`,
		card.receivedAt,
	);
}

function getDayName(date, index) {
	if (index === 0) return 'Hôm nay';
	const parts = String(date || '').split('-').map(Number);
	if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return 'Ngày';
	return dayNames[new Date(parts[0], parts[1] - 1, parts[2]).getDay()];
}

function createForecastCardHtml(card) {
	const days = Array.isArray(card.days) ? card.days : [];
	if (!days.length) return '';
	// Mỗi ngày tạo một ô dự báo; join('') ghép các ô thành nội dung của dải cuộn ngang.
	const tiles = days.map((day, index) => {
		const icon = esc(day.icon || 'bi bi-cloud');
		const rain = day.rainProbability?.value;
		return `
			<div class="forecast-day ${index === 0 ? 'today' : ''}">
				<div class="forecast-day-name">${esc(getDayName(day.date, index))}</div>
				<i class="${icon} ${iconTone(day.icon)} forecast-icon" aria-hidden="true"></i>
				<div class="dim small">${esc(day.condition || 'Chưa rõ')}</div>
				<div class="fw-semibold">${formatMeasurement(day.temperatureMax, true)} / ${formatMeasurement(day.temperatureMin, true)}</div>
				<div class="forecast-rain">${rain == null ? 'Mưa: --' : `Mưa ${esc(rain)}${esc(day.rainProbability?.unit || '%')}`}</div>
			</div>`;
	}).join('');

	return createCardShell(
		`<i class="bi bi-calendar3 me-1" aria-hidden="true"></i>Dự báo ${days.length} ngày, ${esc(card.location || '')}`,
		`<div class="forecast-row">${tiles}</div>`,
		card.receivedAt,
	);
}

function createYoutubeCardHtml(card) {
	if (typeof card.videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(card.videoId)) return '';
	const embedUrl = `https://www.youtube.com/embed/${encodeURIComponent(card.videoId)}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;

	return createCardShell(
		`<i class="bi bi-youtube me-1" aria-hidden="true"></i>${esc(card.title || 'YouTube')}`,
		`<div class="youtube-frame">
			<iframe
				src="${embedUrl}"
				title="Phát ${esc(card.title || 'video YouTube')}"
				loading="lazy"
				allow="autoplay; encrypted-media; picture-in-picture"
				allowfullscreen></iframe>
		</div>
		<a class="youtube-link" href="${esc(card.youtubeUrl || 'https://www.youtube.com') }" target="_blank" rel="noreferrer">
			<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>Mở trên YouTube
		</a>`,
		card.receivedAt,
	);
}

const cardRenderers = {
	current: createCurrentCardHtml,
	forecast: createForecastCardHtml,
	youtube: createYoutubeCardHtml,
};

// Hàm thuần chuyển mảng card thành HTML; dữ liệu rỗng thì tạo trạng thái hướng dẫn.
function createWeatherCardsHtml(cards) {
	const markup = cards.map((card) => {
		const renderCard = cardRenderers[card.type];
		return renderCard ? renderCard(card) : '';
	}).join('');
	return markup || `
		<div class="empty-state" id="empty-state">
			<i class="bi bi-cloud-sun" aria-hidden="true"></i>
			<p>Chưa có kết quả</p>
			<span>Kết quả chi tiết từ công cụ sẽ hiển thị ở đây.</span>
		</div>`;
}

function showWeatherCards() {
	results.innerHTML = createWeatherCardsHtml(weatherCardsHistory);
}

function pauseYoutubeIframes() {
	// iframe khác origin nên chỉ được điều khiển qua giao thức postMessage của YouTube.
	const pauseMessage = JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] });
	results.querySelectorAll('.youtube-frame iframe').forEach((iframe) => {
		// enablejsapi=1 trong src cho phép iframe nhận lệnh pauseVideo từ parent page.
		iframe.contentWindow?.postMessage(pauseMessage, 'https://www.youtube.com');
	});
}

function addWeatherCards(cards) {
	if (!Array.isArray(cards) || cards.length === 0) return;
	const supportedCards = cards.filter((card) => card && cardRenderers[card.type]);
	if (!supportedCards.length) return;
	// Spread (...) sao chép các trường JSON vào object mới rồi thêm thời gian nhận card ở phía trình duyệt.
	const newCards = supportedCards.map((card) => ({ ...card, receivedAt: timeNow() }));
	const newestYoutube = newCards.some((card) => card.type === 'youtube');
	// concat() nối mảng mới lên đầu mảng cũ, sau đó slice(0, N) giữ lại N card mới nhất nhất.
	// Điều này giống như "đẩy phần mới lên đầu" nhưng giới hạn số lượng để không vượt quá lịch sử.
	weatherCardsHistory = newCards.concat(weatherCardsHistory).slice(0, maxHistoryCards);
	saveHistory();
	if (newestYoutube) {
		// Dừng bài đang phát nhưng không xóa card cũ khỏi giao diện hoặc lịch sử.
		pauseYoutubeIframes();
	}
	// Chỉ thêm card mới vào đầu DOM để iframe YouTube cũ không bị hủy và dừng phát.
	$('empty-state')?.remove();
	const newMarkup = newCards.map((card) => cardRenderers[card.type](card)).join('');
	results.insertAdjacentHTML('afterbegin', newMarkup);
	// Giới hạn số node hiển thị theo cùng giới hạn history để DOM không phình theo thời gian.
	Array.from(results.querySelectorAll('.result-card'))
		.slice(maxHistoryCards)
		.forEach((card) => card.remove());
	if (window.matchMedia('(max-width: 767.98px)').matches && $('panel-chat').classList.contains('active')) {
		resultDot.hidden = false;
	}
}

async function callChat(prompt, history) {
	// Đây là hàm có side effect: gửi câu hỏi tới Express rồi đọc JSON trong response.
	const response = await fetch('/ai/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		// { prompt } là cách viết ngắn của { prompt: prompt } trong object JavaScript.
		body: JSON.stringify({ prompt, history }),
	});
	// Một số lỗi có thể không trả JSON hợp lệ; khi đó json nhận null thay vì làm hỏng luồng.
	const json = await response.json().catch(() => null);
	if (!response.ok || !json?.success) {
		const error = new Error(json?.message || `HTTP ${response.status}`);
		error.status = response.status;
		throw error;
	}
	return json.data;
}

async function handleChatSubmit(event) {
	event.preventDefault();
	const prompt = chatInput.value.trim();
	if (!prompt || sendButton.disabled) return;

	addUserMessage(prompt);
	chatInput.value = '';
	sendButton.disabled = true;
	clearChatButton.disabled = true;
	const loadingTimer = showPendingMessage();

	try {
		const history = conversationHistory.slice(0, -1);
		const data = await callChat(prompt, history);
		addBotResponse(data);
		addWeatherCards(data.weatherCards);
	} catch (error) {
		// catch chạy khi gọi mạng/API thất bại để hiện thông báo thân thiện trong chat.
		console.error('Không thể gửi yêu cầu', error);
		const message = error.status === 502
			? 'Trợ lý AI đang không phản hồi, bạn thử lại sau nhé.'
			: 'Không nhận được phản hồi. Kiểm tra kết nối rồi gửi lại nhé.';
		addBotError(message);
	} finally {
		// finally luôn chạy dù thành công hay lỗi: mở lại nút và đưa con trỏ về ô nhập.
		clearInterval(loadingTimer);
		sendButton.disabled = false;
		clearChatButton.disabled = false;
		chatInput.focus();
		scrollMessages();
	}
}

// Event listener nối thao tác submit của form với luồng gửi câu hỏi ở trên.
$('chat-form').addEventListener('submit', handleChatSubmit);

function handleClearChat() {
	conversationHistory = [{
		role: 'bot',
		text: defaultGreeting,
		time: timeNow(),
		calledFunctions: [],
	}];
	chatInput.value = '';
	promptSelect.value = '';
	saveHistory();
	showConversation();
	scrollMessages();
}

clearChatButton.addEventListener('click', handleClearChat);

function handleClearResults() {
	weatherCardsHistory = [];
	saveHistory();
	showWeatherCards();
	resultDot.hidden = true;
}

$('clear-results').addEventListener('click', handleClearResults);

function handlePromptSelection() {
	if (!promptSelect.value) return;
	chatInput.value = promptSelect.value;
	promptSelect.value = '';
	chatInput.focus();
}

// Chọn câu mẫu chỉ điền input; người dùng vẫn chủ động bấm Gửi.
promptSelect.addEventListener('change', handlePromptSelection);

function handleTabSelection(button) {
	const target = button.dataset.target;
	document.querySelectorAll('.tab-btn').forEach((tab) => {
		const selected = tab === button;
		tab.classList.toggle('active', selected);
		tab.setAttribute('aria-selected', String(selected));
	});
	document.querySelectorAll('.panel').forEach((panel) => {
		panel.classList.toggle('active', panel.id === target);
	});
	if (target === 'panel-results') resultDot.hidden = true;
}

// Mỗi nút tab gọi chung một hàm, thay vì lặp cùng logic cho Chat và Kết quả.
document.querySelectorAll('.tab-btn').forEach((button) => {
	button.addEventListener('click', () => {
		handleTabSelection(button);
	});
});

loadHistory();
if (!conversationHistory.length) {
	conversationHistory.push({
		role: 'bot',
		text: defaultGreeting,
		time: timeNow(),
		calledFunctions: [],
	});
}
showConversation();
showWeatherCards();
saveHistory();
scrollMessages();