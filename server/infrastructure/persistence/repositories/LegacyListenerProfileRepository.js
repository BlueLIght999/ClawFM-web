import { getUserProfile, setUserProfile } from '../../../db/history.js';

/**
 * Wraps legacy user_profile KV helpers behind ListenerProfileRepository.
 *
 * @param {{getUserProfile: () => object|null, setUserProfile: (key: string, value: unknown) => void}=} legacy
 */
export function createLegacyListenerProfileRepository(legacy = {
  getUserProfile,
  setUserProfile,
}) {
  return {
    get() {
      return legacy.getUserProfile() || {};
    },
    set(key, value) {
      legacy.setUserProfile(key, value);
    },
  };
}

export const legacyListenerProfileRepository = createLegacyListenerProfileRepository();
