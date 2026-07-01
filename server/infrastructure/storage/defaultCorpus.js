import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { FileCorpus } from './FileCorpus.js';

/**
 * Default CorpusPort instance wired to the project's user/ directory.
 * Composition-root wiring (infrastructure layer): computes the path and
 * instantiates the already-tested FileCorpus. Imported by business code so
 * it depends on the port, not on fs/path directly.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const USER_DIR = resolve(__dirname, '..', '..', '..', 'user');

export const defaultCorpus = new FileCorpus(USER_DIR);
