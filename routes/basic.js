import express from 'express';
import { getWeatherByAddress, getForecastByAddress } from '../helpers/services/weather.js';
import { createWeatherCard } from '../helpers/services/weatherCard.js';

const router = express.Router();

// Mảng này là danh sách gợi ý hiển thị trên giao diện.
// Giữ đơn giản, dễ đọc và dễ sửa cho người mới học code.
const suggestionCities = [
	'Hà Nội',
	'Tuyên Quang',
	'Cao Bằng',
	'Lạng Sơn',
	'Thái Nguyên',
	'Điện Biên',
	'Thanh Hóa',
	'Nghệ An',
	'Huế',
	'Đà Nẵng',
	'Quảng Ngãi',
	'Khánh Hòa',
	'Đồng Nai',
	'Vĩnh Phúc',
	'Hồ Chí Minh',
	'Vĩnh Long',
	'Cần Thơ',
	'Seoul',
	'Tokyo',
];

router.get('/', (req, res) => {
	res.render('layout/master', {
		title: 'Tra cứu thời tiết',
		page: '../pages/basic',
		active: 'basic',
		bodyClass: 'page-scroll',
		suggestions: suggestionCities,
	});
});

router.post('/weather', async (req, res) => {
	const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
	if (!address) {
		return res.status(400).json({ success: false, message: 'Vui lòng nhập địa điểm.' });
	}

	// Promise.all(...) chạy đồng thời 2 request thời tiết thay vì chờ từng cái.
	const [currentData, forecastData] = await Promise.all([
		getWeatherByAddress(address),
		getForecastByAddress(address),
	]);
	// Mảng này chứa 2 phần tử: current card và forecast card.
	// filter(Boolean) bỏ các phần tử null/undefined, chỉ giữ những dữ liệu thật sự có.
	const weatherCards = [
		currentData ? createWeatherCard(address, currentData, 'current')?.card : null,
		forecastData ? createWeatherCard(address, forecastData, 'forecast')?.card : null,
	].filter(Boolean);

	if (!weatherCards.length) {
		return res.status(502).json({ success: false, message: 'Không lấy được dữ liệu thời tiết.' });
	}

	return res.json({ success: true, data: { weatherCards } });
});

export default router;
