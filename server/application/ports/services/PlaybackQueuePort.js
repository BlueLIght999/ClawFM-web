/**
 * @typedef {object} Song
 * @property {string} id
 * @property {string} title
 * @property {string} artist
 *
 * @typedef {object} PlaybackQueuePort
 * @property {Song[]} upcomingSongs — read-only snapshot of queued songs
 * @property {string} mode — current queue mode (e.g. 'shuffle')
 * @property {number} length — number of songs in queue
 * @property {() => void} init — initialize the queue
 * @property {() => Song|null} peek — preview the next song without removing it
 * @property {() => void} clear — remove all songs from the queue
 * @property {(songs: Song[]) => void} addSongs — append songs to the queue
 * @property {() => boolean} needsMore — whether the queue needs more songs
 */

export {};
