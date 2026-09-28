import winston from 'winston';

const logger = winston.createLogger({
	level: 'info',
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.errors({ stack: true }),
		winston.format.json(),
	),
	transports: [
		new winston.transports.Console(),
		new winston.transports.File({
			filename: 'logs/app.log',
			maxsize: 5 * 1024 * 1024,
			maxFiles: 5,
		}),
	],
});

export { logger };