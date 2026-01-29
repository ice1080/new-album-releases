const MAX_SAVED_ALBUMS = 100;

interface TidalAPIClient {
  GET: (path: string) => Promise<unknown>;
  [key: string]: unknown;
}

interface TidalUser {
  id: string;
  [key: string]: unknown;
}

interface FetchOptions {
  maxRetries?: number;
  initialRetryDelay?: number;
  maxRetryDelay?: number;
  onApiCall?: () => void;
}

interface AlbumAttributes {
  title: string;
  releaseDate: string;
  type: string;
}

export interface SavedAlbum {
  attributes: AlbumAttributes;
  id: string;
}

interface TidalSavedAlbumResponse {
  included?: SavedAlbum[];
  links: { next?: string };
  [key: string]: unknown;
}

interface ErrorResponse {
  error: unknown;
  response?: Response | { status?: number; statusCode?: number };
}

/**
 * Handles 429 rate limit errors with exponential backoff retry logic
 */
const handleRateLimit = async (
  error: unknown,
  retryCount: number,
  options: FetchOptions
): Promise<boolean> => {
  const {
    maxRetries = 5,
    initialRetryDelay = 1000,
    maxRetryDelay = 30000,
  } = options;

  // Check if it's a 429 error - handle various error formats
  const errorObj = error as {
    status?: number;
    statusCode?: number;
    response?: Response | { status?: number; statusCode?: number };
    headers?: { 'retry-after'?: string; get?: (name: string) => string | null };
  };

  // Extract status code from various possible locations
  let statusCode: number | undefined;
  if (errorObj?.status) {
    statusCode = errorObj.status;
  } else if (errorObj?.statusCode) {
    statusCode = errorObj.statusCode;
  } else if (errorObj?.response) {
    // Response could be a fetch Response object or a plain object
    if (errorObj.response instanceof Response) {
      statusCode = errorObj.response.status;
    } else {
      statusCode = errorObj.response.status || errorObj.response.statusCode;
    }
  }

  const isRateLimitError = statusCode === 429;

  if (!isRateLimitError || retryCount >= maxRetries) {
    return false;
  }

  // Calculate exponential backoff delay
  const delay = Math.min(
    initialRetryDelay * Math.pow(2, retryCount),
    maxRetryDelay
  );

  // Check if error has Retry-After header (handle different header formats)
  let retryAfter: string | null = null;
  if (errorObj?.response instanceof Response) {
    // Fetch Response object
    retryAfter = errorObj.response.headers.get('retry-after');
  } else if (errorObj?.headers) {
    if (typeof errorObj.headers.get === 'function') {
      retryAfter = errorObj.headers.get('retry-after');
    } else if (errorObj.headers['retry-after']) {
      retryAfter = errorObj.headers['retry-after'];
    }
  }

  const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;

  console.warn(
    `Rate limit hit (429). Retrying in ${waitTime}ms (attempt ${retryCount + 1}/${maxRetries})`
  );

  await new Promise((resolve) => setTimeout(resolve, waitTime));
  return true;
};

export const getAllSavedAlbums = async (
  tidalClient: TidalAPIClient,
  user: TidalUser,
  options: FetchOptions = {}
): Promise<SavedAlbum[]> => {
  const localSavedAlbums: SavedAlbum[] = [];
  let nextUrl: string | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    let retryCount = 0;
    let success = false;
    let response: TidalSavedAlbumResponse | null = null;

    // Retry loop for handling rate limits
    while (!success && retryCount < (options.maxRetries || 5)) {
      try {
        // Build the URL with cursor if available
        const url =
          nextUrl ||
          `/userCollections/${user.id}/relationships/albums?include=albums`;

        // openapi-fetch returns { data, error, response } - check for errors
        const result = (await tidalClient.GET(url)) as
          | TidalSavedAlbumResponse
          | {
              data?: TidalSavedAlbumResponse;
              error?: unknown;
              response?: Response;
            };

        // Check if result has an error property (openapi-fetch pattern)
        if (result && typeof result === 'object' && 'error' in result) {
          const errorResult = result as ErrorResponse;
          if (errorResult.response?.status === 429) {
            // Extract status from response if available
            const status = errorResult.response?.status;
            const errorWithStatus = {
              ...(typeof errorResult.error === 'object' &&
              errorResult.error !== null
                ? errorResult.error
                : { error: errorResult.error }),
              status,
              statusCode: status,
              response: errorResult.response,
            };

            const shouldRetry = await handleRateLimit(
              errorWithStatus,
              retryCount,
              options
            );
            if (!shouldRetry) {
              // Not a rate limit error or max retries reached
              throw errorResult.error;
            }
            retryCount++;
            continue;
          }
        }

        // If result has data property, use it; otherwise assume result is the data
        if (result && typeof result === 'object' && 'data' in result) {
          const dataResult = result as { data?: TidalSavedAlbumResponse };
          if (dataResult.data) {
            response = dataResult.data;
          } else {
            throw new Error('Response has data property but data is undefined');
          }
        } else {
          response = result as unknown as TidalSavedAlbumResponse;
        }
        success = true;
        options.onApiCall?.();
      } catch (error) {
        console.log('Exception caught:', error);
        const shouldRetry = await handleRateLimit(error, retryCount, options);
        if (!shouldRetry) {
          // Not a rate limit error or max retries reached
          throw error;
        }
        retryCount++;
      }
    }

    if (!response) {
      throw new Error('Failed to fetch albums after retries');
    }

    // Tidal API returns items directly or in a data/items structure
    const items = response.included || [];
    localSavedAlbums.push(...items);

    // Log progress every 100 albums
    if (localSavedAlbums.length % 100 === 0) {
      console.log(`Fetched ${localSavedAlbums.length} albums so far...`);
    }

    // TODO remove this eventually
    // if (localSavedAlbums.length > MAX_SAVED_ALBUMS) {
    //   hasMore = false;
    //   continue;
    // }

    // Check if there are more pages
    // Update cursor from response for next iteration
    const nextCursor = response.links?.next;

    // Stop if we got no items (no more data)
    if (items.length === 0) {
      hasMore = false;
    } else if (nextCursor && nextCursor !== nextUrl) {
      // Continue if we have a new cursor
      nextUrl = nextCursor;
      hasMore = true;
    } else {
      // No cursor or same cursor means we're done
      hasMore = false;
    }
  }

  return localSavedAlbums;
};

interface AlbumRelationships {
  artists: {
    data: {
      id: string;
    }[];
  };
}

export interface Album {
  id: string;
  attributes: AlbumAttributes;
  relationships: AlbumRelationships;
}

interface TidalAlbumResponse {
  data?: Album[];
  included?: string[];
  links: { next?: string };
  [key: string]: unknown;
}

export const getAllAlbumArtistIds = async (
  tidalClient: TidalAPIClient,
  savedAlbums: SavedAlbum[],
  options: FetchOptions = {}
): Promise<Map<string, number>> => {
  const localAlbums: Album[] = [];
  const artistCountMap = new Map<string, number>();

  const allAlbumIds = savedAlbums.map((album) => album.id);

  // Split allAlbumIds into chunks of 20
  const chunkSize = 20;
  const chunks: string[][] = [];
  for (let i = 0; i < allAlbumIds.length; i += chunkSize) {
    chunks.push(allAlbumIds.slice(i, i + chunkSize));
  }

  console.log(
    `Processing ${allAlbumIds.length} albums in ${chunks.length} chunks of up to ${chunkSize}...`
  );

  // Process each chunk synchronously
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    let retryCount = 0;
    let success = false;
    let response: TidalAlbumResponse | null = null;

    // Retry loop for handling rate limits
    while (!success && retryCount < (options.maxRetries || 5)) {
      try {
        // Build the URL with the chunk of album IDs
        const url = `/albums?filter[id]=${chunk.join(',')}&include=artists`;

        // openapi-fetch returns { data, error, response } - check for errors
        const result = (await tidalClient.GET(url)) as
          | TidalAlbumResponse
          | {
              data?: TidalAlbumResponse;
              error?: unknown;
              response?: Response;
            };

        // Check if result has an error property (openapi-fetch pattern)
        if (result && typeof result === 'object' && 'error' in result) {
          const errorResult = result as ErrorResponse;
          if (errorResult.response?.status === 429) {
            // Extract status from response if available
            const status = errorResult.response?.status;
            const errorWithStatus = {
              ...(typeof errorResult.error === 'object' &&
              errorResult.error !== null
                ? errorResult.error
                : { error: errorResult.error }),
              status,
              statusCode: status,
              response: errorResult.response,
            };

            const shouldRetry = await handleRateLimit(
              errorWithStatus,
              retryCount,
              options
            );
            if (!shouldRetry) {
              // Not a rate limit error or max retries reached
              throw errorResult.error;
            }
            retryCount++;
            continue;
          }
        }

        // If result has data property, use it; otherwise assume result is the data
        if (result && typeof result === 'object' && 'data' in result) {
          const dataResult = result as { data?: TidalAlbumResponse };
          if (dataResult.data) {
            response = dataResult.data;
          } else {
            throw new Error('Response has data property but data is undefined');
          }
        } else {
          response = result as unknown as TidalAlbumResponse;
        }
        success = true;
        options.onApiCall?.();
      } catch (error) {
        console.log('Exception caught:', error);
        const shouldRetry = await handleRateLimit(error, retryCount, options);
        if (!shouldRetry) {
          // Not a rate limit error or max retries reached
          throw error;
        }
        retryCount++;
      }
    }

    if (!response) {
      throw new Error('Failed to fetch albums after retries');
    }

    // Tidal API returns items directly or in a data/items structure
    const items = response.data || [];
    localAlbums.push(...items);

    // Log progress every 100 albums
    if (localAlbums.length % 100 === 0) {
      console.log(`Fetched ${localAlbums.length} albums so far...`);
    }
  }

  // Count albums per artist ID
  for (const album of localAlbums) {
    const artistIds = album.relationships?.artists?.data || [];
    for (const artist of artistIds) {
      const artistId = artist.id;
      const currentCount = artistCountMap.get(artistId) || 0;
      artistCountMap.set(artistId, currentCount + 1);
    }
  }

  return artistCountMap;
};

interface TidalArtistRelationships {
  albums?: {
    data?: {
      id: string;
    }[];
    links?: {
      self: string;
      next?: string;
    }
  };
}

interface TidalArtist {
  id: string;
  relationships?: TidalArtistRelationships;
  [key: string]: unknown;
}

interface TidalArtistsResponse {
  data?: TidalArtist[];
  included?: Album[];
}

export const getAllArtistAlbums = async (
  tidalClient: TidalAPIClient,
  artistIds: string[],
  options: FetchOptions = {}
): Promise<Map<string, Album[]>> => {
  const artistAlbumsMap = new Map<string, Album[]>();

  // Split artistIds into chunks of 20
  const chunkSize = 20;
  const chunks: string[][] = [];
  for (let i = 0; i < artistIds.length; i += chunkSize) {
    chunks.push(artistIds.slice(i, i + chunkSize));
  }

  console.log(
    `Processing ${artistIds.length} artists in ${chunks.length} chunks of up to ${chunkSize}...`
  );

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    let retryCount = 0;
    let success = false;
    let response: TidalArtistsResponse | null = null;

    // Retry loop for handling rate limits
    while (!success && retryCount < (options.maxRetries || 5)) {
      try {
        const url = `/artists?filter[id]=${chunk.join(',')}&include=albums`;

        const result = (await tidalClient.GET(url)) as
          | TidalArtistsResponse
          | {
              data?: TidalArtistsResponse;
              error?: unknown;
              response?: Response;
            };

        // Check if result has an error property (openapi-fetch pattern)
        if (result && typeof result === 'object' && 'error' in result) {
          const errorResult = result as ErrorResponse;
          if (errorResult.response?.status === 429) {
            // Extract status from response if available
            const status = errorResult.response?.status;
            const errorWithStatus = {
              ...(typeof errorResult.error === 'object' &&
              errorResult.error !== null
                ? errorResult.error
                : { error: errorResult.error }),
              status,
              statusCode: status,
              response: errorResult.response,
            };

            const shouldRetry = await handleRateLimit(
              errorWithStatus,
              retryCount,
              options
            );
            if (!shouldRetry) {
              // Not a rate limit error or max retries reached
              throw errorResult.error;
            }
            retryCount++;
            continue;
          }
        }

        // If result has data property, use it; otherwise assume result is the data
        if (result && typeof result === 'object' && 'data' in result) {
          const dataResult = result as { data?: TidalArtistsResponse };
          if (dataResult.data) {
            response = dataResult.data;
          } else {
            throw new Error('Response has data property but data is undefined');
          }
        } else {
          response = result as unknown as TidalArtistsResponse;
        }
        success = true;
        options.onApiCall?.();
      } catch (error) {
        console.log('Exception caught:', error);
        const shouldRetry = await handleRateLimit(error, retryCount, options);
        if (!shouldRetry) {
          // Not a rate limit error or max retries reached
          throw error;
        }
        retryCount++;
      }
    }

    if (!response) {
      throw new Error('Failed to fetch artists after retries');
    }

    const artists = response.data || [];
    if (chunkIndex === 0) {
      console.log('full artist response', response);
    }

    // Log progress every 100 albums
    if (artistAlbumsMap.keys.length % 100 === 0) {
      console.log(`Fetched ${artistAlbumsMap.keys.length} artists' albums so far...`);
    }

    const allResponseAlbumsMap = new Map<string, Album>();
    for (const album of response.included || []) {
      if (album.id) {
        allResponseAlbumsMap.set(album.id, album);
      }
    }

    for (const artist of artists) {
      if (artist.relationships?.albums?.links?.next) {
        // todo this artist has more albums to retrieve
      }
      const albumsData = artist.relationships?.albums?.data || [];
      const albumIds = albumsData.map((album) => album.id);

      // TODO instead of getting all albums for the artist, just get the ones in the release date range that we care about
      const albumsForArtist = albumIds
        .map((id) => allResponseAlbumsMap.get(id))
        .filter((album): album is Album => !!album);

      // Remove each of those albums from the allResponseAlbumsMap since they're no longer needed
      for (const album of albumsForArtist) {
        if (album && album.id) {
          allResponseAlbumsMap.delete(album.id);
        }
      }

      if (!artistAlbumsMap.has(artist.id)) {
        artistAlbumsMap.set(artist.id, albumsForArtist);
      } else {
        const existing = artistAlbumsMap.get(artist.id) ?? [];
        artistAlbumsMap.set(artist.id, [...existing, ...albumsForArtist]);
      }
    }
  }

  return artistAlbumsMap;
};
