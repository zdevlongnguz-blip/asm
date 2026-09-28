import ytSearch from 'yt-search';

const youtubeOrigin = 'https://www.youtube.com';

const createYoutubeCard = async (query) => {
	if (typeof query !== 'string') return null;

	const cleanQuery = query.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
	if (!cleanQuery || cleanQuery.length > 120) return null;

	try {
		const searchResult = await ytSearch(cleanQuery);
		const video = searchResult.videos?.[0];
		if (!video?.videoId || !/^[A-Za-z0-9_-]{11}$/.test(video.videoId)) return null;

		const encodedQuery = encodeURIComponent(cleanQuery);
	return {
		card: {
			type: 'youtube',
			title: video.title || cleanQuery,
			videoId: video.videoId,
			embedUrl: `${youtubeOrigin}/embed/${video.videoId}`,
			youtubeUrl: `${youtubeOrigin}/watch?v=${video.videoId}`,
			searchUrl: `${youtubeOrigin}/results?search_query=${encodedQuery}`,
		},
		context: { title: video.title || cleanQuery, videoId: video.videoId },
		};
	} catch (error) {
		return null;
	}
};

export { createYoutubeCard };