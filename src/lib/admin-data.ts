import type { getAdminData } from './server/experiment';

export type AdminData = Awaited<ReturnType<typeof getAdminData>>;
export type AdminParticipant = AdminData['participants'][number];
export type AdminSession = AdminData['sessions'][number];
export type AdminTrial = AdminData['trials'][number];
export type AdminBreakEvent = AdminData['events'][number];
export type DeletionLogEntry = AdminData['deletions'][number];
