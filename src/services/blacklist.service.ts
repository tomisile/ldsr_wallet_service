import * as blacklistRepository from '../repositories/blacklist.repository';

export interface BlacklistService {
  isBlacklisted(identifier: string): Promise<boolean>;
}

export class TableBlacklistService implements BlacklistService {
  async isBlacklisted(identifier: string): Promise<boolean> {
    const match = await blacklistRepository.findByIdentifier(identifier.trim().toLowerCase());
    return match !== undefined;
  }
}

let instance: BlacklistService = new TableBlacklistService();

export function getBlacklistService(): BlacklistService {
  return instance;
}
export function setBlacklistService(next: BlacklistService): void {
  instance = next;
}
