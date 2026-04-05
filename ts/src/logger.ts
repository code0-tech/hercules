import pino from 'pino';

export const logger = pino({
    redact: ["config.authToken"],
    level: process.env.LOG_LEVEL || "debug",
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true
        }
    }
});