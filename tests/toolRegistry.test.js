import test from 'node:test';
import assert from 'node:assert/strict';
import { toolDefinitions, executeToolCall } from '../helpers/services/toolRegistry.js';

test('registry đăng ký đủ các tool nghiệp vụ', () => {
	const names = toolDefinitions.map((tool) => tool.function.name);

	assert.deepEqual(names, [
		'get_weather_by_address',
		'get_forecast_by_address',
		'play_youtube_music',
	]);
});

test('dispatcher bỏ qua tool không được đăng ký', async () => {
	assert.equal(await executeToolCall({ function: { name: 'unknown_tool', arguments: {} } }), null);
});

test('dispatcher không tạo card YouTube với query rỗng', async () => {
	assert.equal(await executeToolCall({
		function: {
			name: 'play_youtube_music',
			arguments: { query: '' },
		},
	}), null);
});
