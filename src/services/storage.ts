import { GameItem, SaveState } from '../types/rom';

const DB_NAME = 'RecompStation_DB';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('games')) {
        const gameStore = db.createObjectStore('games', { keyPath: 'id' });
        gameStore.createIndex('title', 'title', { unique: false });
        gameStore.createIndex('platform', 'platform', { unique: false });
      }

      if (!db.objectStoreNames.contains('saves')) {
        const saveStore = db.createObjectStore('saves', { keyPath: 'id' });
        saveStore.createIndex('gameId', 'gameId', { unique: false });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function saveGameToLibrary(game: GameItem): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('games', 'readwrite');
    const store = tx.objectStore('games');
    const req = store.put(game);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllGamesFromLibrary(): Promise<GameItem[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('games', 'readonly');
    const store = tx.objectStore('games');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteGameFromLibrary(id: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['games', 'saves'], 'readwrite');
    tx.objectStore('games').delete(id);
    // Also delete associated saves
    const saveStore = tx.objectStore('saves');
    const index = saveStore.index('gameId');
    const range = IDBKeyRange.only(id);
    index.openCursor(range).onsuccess = (e: any) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateGameCover(gameId: string, coverUrl: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('games', 'readwrite');
  const store = tx.objectStore('games');
  const req = store.get(gameId);

  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      const game: GameItem = req.result;
      if (game) {
        game.coverUrl = coverUrl;
        store.put(game);
        resolve();
      } else {
        reject(new Error('Game not found'));
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveGameState(state: SaveState): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('saves', 'readwrite');
    const store = tx.objectStore('saves');
    const req = store.put(state);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getGameSaveStates(gameId: string): Promise<SaveState[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('saves', 'readonly');
    const store = tx.objectStore('saves');
    const index = store.index('gameId');
    const req = index.getAll(IDBKeyRange.only(gameId));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteGameState(id: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('saves', 'readwrite');
    const store = tx.objectStore('saves');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

