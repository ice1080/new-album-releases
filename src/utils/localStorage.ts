interface StoredItem<T> {
  value: T;
  expiry: number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Store an item in localStorage with an expiry time
 * @param key - The key to store the item under
 * @param value - The value to store
 * @param ttl - Time to live in milliseconds (default: 24 hours)
 */
export const setWithExpiry = <T>(
  key: string,
  value: T,
  ttl: number = DEFAULT_TTL_MS
): void => {
  const now = new Date().getTime();
  const item: StoredItem<T> = {
    value,
    expiry: now + ttl,
  };

  try {
    localStorage.setItem(key, JSON.stringify(item));
  } catch (error) {
    console.error(`Error storing item with key "${key}":`, error);
  }
};

/**
 * Retrieve an item from localStorage and check if it has expired
 * @param key - The key to retrieve the item for
 * @returns The stored value if it exists and hasn't expired, null otherwise
 */
export const getWithExpiry = <T>(key: string): T | null => {
  try {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) {
      return null;
    }

    const item: StoredItem<T> = JSON.parse(itemStr);
    const now = new Date().getTime();

    // Check if item has expired
    if (now > item.expiry) {
      // Item has expired, remove it from localStorage
      localStorage.removeItem(key);
      return null;
    }

    return item.value;
  } catch (error) {
    console.error(`Error retrieving item with key "${key}":`, error);
    return null;
  }
};

/**
 * Remove an item from localStorage
 * @param key - The key to remove
 */
export const removeItem = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error removing item with key "${key}":`, error);
  }
};
