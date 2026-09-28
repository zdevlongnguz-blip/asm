import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import axios from 'axios';
import app from '../app.js';

let server;
let baseUrl;

before(async () => {
	server = app.listen(0);
	await once(server, 'listening');
	baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
	await new Promise((resolve) => server.close(resolve));
});

test('các trang chính render đúng layout và asset', async () => {
	const pageResponse = await fetch(baseUrl);
	const page = await pageResponse.text();
	const chatResponse = await fetch(`${baseUrl}/chat`);
	const chatPage = await chatResponse.text();
	const basicResponse = await fetch(`${baseUrl}/basic`);
	const basicPage = await basicResponse.text();
	const cssResponse = await fetch(`${baseUrl}/css/weatherbot.css`);

	assert.equal(pageResponse.status, 200);
	assert.match(page, /WeatherBot/);
	assert.match(page, /href="\/basic"/);
	assert.match(page, /href="\/chat"/);
	assert.equal(chatResponse.status, 200);
	assert.match(chatPage, /id="clear-chat"/);
	assert.match(chatPage, /\/js\/weatherbot\.js/);
	assert.equal(basicResponse.status, 200);
	assert.match(basicPage, /Tra cứu thời tiết/);
	assert.match(basicPage, /\/js\/basic\.js/);
	assert.match(basicPage, /Vĩnh Phúc/);
	assert.equal(cssResponse.status, 200);
});

test('POST /basic/weather trả cả current và forecast', async (context) => {
	const getMock = context.mock.method(axios, 'get', async (url, options) => {
		if (options.params.current) {
			return {
				data: {
					current_units: { temperature_2m: '°C', relative_humidity_2m: '%', wind_speed_10m: 'km/h' },
					current: { temperature_2m: 25, relative_humidity_2m: 70, wind_speed_10m: 8, weather_code: 0 },
				},
			};
		}
		return {
			data: {
				daily_units: { temperature_2m_max: '°C', temperature_2m_min: '°C', precipitation_probability_max: '%' },
				daily: {
					time: ['2026-09-28'],
					temperature_2m_max: [30],
					temperature_2m_min: [24],
					precipitation_probability_max: [10],
					weather_code: [0],
				},
			},
		};
	});
	const response = await fetch(`${baseUrl}/basic/weather`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ address: 'Hà Nội' }),
	});
	const body = await response.json();

	assert.equal(response.status, 200);
	assert.equal(body.data.weatherCards.length, 2);
	assert.deepEqual(body.data.weatherCards.map((card) => card.type), ['current', 'forecast']);
	assert.equal(getMock.mock.callCount(), 2);
});

test('POST /ai/chat trả lời prompt hợp lệ', async (context) => {
	let requestBody;
	const postMock = context.mock.method(axios, 'post', async (url, body) => {
		requestBody = body;
		return { data: { message: { content: 'Thời tiết hiện tại có nắng.' } } };
	});
	const response = await fetch(`${baseUrl}/ai/chat`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			prompt: 'Bạn khỏe không?',
			history: [
				{ role: 'user', text: 'Xin chào' },
				{ role: 'bot', text: 'Chào bạn, mình có thể giúp gì?' },
			],
		}),
	});
	const body = await response.json();

	assert.equal(response.status, 200);
	assert.equal(body.data.answer, 'Thời tiết hiện tại có nắng.');
	assert.deepEqual(body.data.weatherCards, []);
	assert.equal(postMock.mock.callCount(), 1);
	assert.deepEqual(requestBody.messages.slice(-3), [
		{ role: 'user', content: 'Xin chào' },
		{ role: 'assistant', content: 'Chào bạn, mình có thể giúp gì?' },
		{ role: 'user', content: 'Bạn khỏe không?' },
	]);
});

test('POST /ai/chat từ chối prompt rỗng', async () => {
	const response = await fetch(`${baseUrl}/ai/chat`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ prompt: '   ' }),
	});

	assert.equal(response.status, 400);
});