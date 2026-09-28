import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import {
	getVietnamProvinceCoordinates,
	getCoordinatesByAddress,
	getWeatherByCoordinates,
	getWeatherByAddress,
	getForecastByCoordinates,
	getForecastByAddress,
} from '../helpers/services/weather.js';

const mockResponse = (context, data) => {
	return context.mock.method(axios, 'get', async () => ({ data }));
};

test('lấy tọa độ Thanh Hóa từ danh sách JSON', async () => {
	assert.deepEqual(getVietnamProvinceCoordinates('Tỉnh Thanh Hóa'), {
		lat: 19.8067,
		lon: 105.7852,
	});
	assert.equal(getVietnamProvinceCoordinates('Địa điểm không có'), null);
});

test('dùng JSON cục bộ trước khi gọi OpenStreetMap', async (context) => {
	const getMock = context.mock.method(axios, 'get', async () => {
		throw new Error('Network error');
	});

	assert.deepEqual(await getCoordinatesByAddress(' thanh hoa '), {
		lat: 19.8067,
		lon: 105.7852,
	});
	assert.equal(getMock.mock.callCount(), 0);
});

test('trả về null khi OpenStreetMap không tìm thấy địa điểm ngoài dữ liệu cục bộ', async (context) => {
	const getMock = mockResponse(context, []);

	assert.equal(await getCoordinatesByAddress('Địa điểm không tồn tại'), null);
	assert.equal(getMock.mock.callCount(), 1);
});

test('ưu tiên tọa độ OpenStreetMap khi API tìm thấy địa điểm', async (context) => {
	const getMock = mockResponse(context, [{ lat: '18.5', lon: '105.2' }]);

	assert.deepEqual(await getCoordinatesByAddress('Địa điểm quốc tế'), {
		lat: 18.5,
		lon: 105.2,
	});
	assert.equal(getMock.mock.callCount(), 1);
});

test('tìm tọa độ và dùng lại địa chỉ đã lưu trong cache', async (context) => {
	const address = `cache-address-${Date.now()}`;
	const getMock = mockResponse(context, [{ lat: '21.03', lon: '105.85' }]);

	const coordinates = await getCoordinatesByAddress(address);
	const cachedCoordinates = await getCoordinatesByAddress(` ${address.toUpperCase()} `);

	assert.deepEqual(coordinates, { lat: 21.03, lon: 105.85 });
	assert.deepEqual(cachedCoordinates, coordinates);
	assert.equal(getMock.mock.callCount(), 1);
});

test('trả về null khi không tìm thấy địa chỉ', async (context) => {
	const address = `missing-address-${Date.now()}`;
	mockResponse(context, []);

	assert.equal(await getCoordinatesByAddress(address), null);
});

test('lấy thời tiết hiện tại và dùng lại dữ liệu trong cache', async (context) => {
	const lat = 12.34567;
	const lon = 98.76543;
	const weatherData = { current: { temperature_2m: 25 } };
	const getMock = mockResponse(context, weatherData);

	assert.deepEqual(await getWeatherByCoordinates(lat, lon), weatherData);
	assert.deepEqual(await getWeatherByCoordinates(lat, lon), weatherData);
	assert.equal(getMock.mock.callCount(), 1);
});

test('lấy dự báo 7 ngày và dùng lại dữ liệu trong cache', async (context) => {
	const lat = 13.45678;
	const lon = 97.65432;
	const forecastData = { daily: { time: ['2026-09-28'] } };
	const getMock = mockResponse(context, forecastData);

	assert.deepEqual(await getForecastByCoordinates(lat, lon), forecastData);
	assert.deepEqual(await getForecastByCoordinates(lat, lon), forecastData);
	assert.equal(getMock.mock.callCount(), 1);
});

test('lấy thời tiết và dự báo theo địa chỉ', async (context) => {
	const address = `weather-address-${Date.now()}`;
	const weatherData = { current: { temperature_2m: 24 } };
	const forecastData = { daily: { temperature_2m_max: [28] } };
	const getMock = context.mock.method(axios, 'get', async (url, options) => {
		if (options.params.format === 'json') {
			return { data: [{ lat: '20.5', lon: '105.5' }] };
		}

		if (options.params.current) return { data: weatherData };
		return { data: forecastData };
	});

	assert.deepEqual(await getWeatherByAddress(address), weatherData);
	assert.deepEqual(await getForecastByAddress(address), forecastData);
	assert.equal(getMock.mock.callCount(), 3);
});

test('trả về null khi API thời tiết gặp lỗi', async (context) => {
	const getMock = context.mock.method(axios, 'get', async () => {
		throw new Error('Network error');
	});

	assert.equal(await getWeatherByCoordinates(14.56789, 96.54321), null);
	assert.equal(await getForecastByCoordinates(15.67891, 95.43210), null);
	assert.equal(getMock.mock.callCount(), 2);
});