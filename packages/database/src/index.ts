/**
 * Single Prisma access point for every workspace.
 *
 * The schema and generated client arrive in PHASE 04; this skeleton fixes the
 * import contract now so later modules never reach around the wrapper.
 */
export { Prisma, PrismaClient } from '@prisma/client';
