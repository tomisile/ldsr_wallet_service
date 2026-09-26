/**
 * Blacklist checking, behind an interface.
 *
 * The brief calls for users to be checked against a blacklist without
 * specifying the source. A local table is used here, reached through this
 * interface so that substituting the Lendsqr Adjutor Karma API is a second
 * implementation and a change of wiring, not a change to the registration flow.
 * It also gives tests something to stub without a network call.
 */
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

/*
 * An Adjutor-backed implementation would live here and satisfy the same
 * interface. Note that the call would have to happen before the database
 * transaction opens: holding a row lock for the duration of someone else's HTTP
 * timeout is how one slow dependency becomes an outage.
 */

let instance: BlacklistService = new TableBlacklistService();

export function getBlacklistService(): BlacklistService {
  return instance;
}

/** Test seam, so a suite can run without depending on blacklist table state. */
export function setBlacklistService(next: BlacklistService): void {
  instance = next;
}
