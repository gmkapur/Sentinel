import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

const log = logger.child({ component: 'DB' });

const prisma = new PrismaClient({
    log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
    ],
});

prisma.$on('warn', (e) => log.warn({ message: e.message }, 'Prisma warning'));
prisma.$on('error', (e) => log.error({ message: e.message, target: e.target }, 'Prisma error'));

export async function disconnectDb(): Promise<void> {
    log.info('Disconnecting from database');
    await prisma.$disconnect();
}

export default prisma;
