const MAX_SAVED_ALBUMS = 200;
const CHUNK_SIZE = 20;

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
  albumType: string;
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

export type ArtistsType = 'artists';

/**
 * Splits an array into chunks of a specified size
 */
const chunkArray = <T>(array: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

/**
 * Parses the openapi-fetch response format and extracts the data
 * Throws an error with status information if it's a 429 error
 */
const parseApiResponse = <T>(result: unknown): T => {
  if (result && typeof result === 'object' && 'error' in result) {
    const errorResult = result as ErrorResponse;
    if (errorResult.response?.status === 429) {
      // Extract status from response if availabxle
      const status = errorResult.response?.status;
      const errorWithStatus = {
        ...(typeof errorResult.error === 'object' && errorResult.error !== null
          ? errorResult.error
          : { error: errorResult.error }),
        status,
        statusCode: status,
        response: errorResult.response,
      };
      throw errorWithStatus;
    }
    throw errorResult.error;
  }

  // If result has data property, use it; otherwise assume result is the data
  if (result && typeof result === 'object' && 'data' in result) {
    const dataResult = result as { data?: T };
    if (dataResult.data) {
      return dataResult.data;
    } else {
      throw new Error('Response has data property but data is undefined');
    }
  } else {
    return result as T;
  }
};

/**
 * Makes an API call with retry logic for rate limiting
 */
const makeApiCallWithRetry = async <T>(
  tidalClient: TidalAPIClient,
  url: string,
  options: FetchOptions = {}
): Promise<T> => {
  let retryCount = 0;
  const maxRetries = options.maxRetries || 5;

  while (retryCount < maxRetries) {
    try {
      const result = await tidalClient.GET(url);
      const data = parseApiResponse<T>(result);
      options.onApiCall?.();
      return data;
    } catch (error) {
      const shouldRetry = await handleRateLimit(error, retryCount, options);
      if (!shouldRetry) {
        throw error;
      }
      retryCount++;
    }
  }

  throw new Error(`Failed to fetch after ${maxRetries} retries`);
};

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

  // console.warn(
  //   `Rate limit hit (429). Retrying in ${waitTime}ms (attempt ${retryCount + 1}/${maxRetries})`
  // );

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
    // Build the URL with cursor if available
    const url: string =
      nextUrl ||
      `/userCollections/${user.id}/relationships/albums?include=albums`;

    const response: TidalSavedAlbumResponse =
      await makeApiCallWithRetry<TidalSavedAlbumResponse>(
        tidalClient,
        url,
        options
      );

    // Tidal API returns items directly or in a data/items structure
    const items = response.included || [];
    localSavedAlbums.push(...items);

    // Log progress every 100 albums
    if (localSavedAlbums.length % 100 === 0) {
      console.log(`Fetched ${localSavedAlbums.length} albums so far...`);
    }

    // TODO remove this eventually or set to Infinity
    if (localSavedAlbums.length > MAX_SAVED_ALBUMS) {
      hasMore = false;
      continue;
    }

    // Check if there are more pages
    // Update cursor from response for next iteration
    const nextCursor: string | undefined = response.links?.next;

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
  coverArt: {
    data: {
      id: string;
    }[];
    links: {
      self: string;
    };
  };
}

interface CoverArtFile {
  href: string;
  meta: {
    width: number;
    height: number;
  };
}

export interface Album {
  id: string;
  coverArtFiles?: CoverArtFile[];
  attributes: AlbumAttributes;
  relationships: AlbumRelationships;
}

export interface AlbumWithArtist extends Album {
  artist?: IncludedArtist;
}

export interface IncludedArtist {
  id: string;
  type: ArtistsType;
  attributes: ArtistAttributes;
}

export interface IncludedCoverArt {
  id: string;
  type: 'artworks';
  attributes: {
    files: CoverArtFile[];
  };
}

interface TidalAlbumResponse {
  data?: Album[];
  included?: (IncludedCoverArt | IncludedArtist)[];
  links: { next?: string };
  [key: string]: unknown;
}

export const addArtistsToAlbums = async (
  tidalClient: TidalAPIClient,
  savedAlbums: SavedAlbum[],
  options: FetchOptions = {}
): Promise<AlbumWithArtist[]> => {
  const localAlbums: AlbumWithArtist[] = [];
  const allAlbumIds = savedAlbums.map((album) => album.id);

  // Split allAlbumIds into chunks
  const chunks = chunkArray(allAlbumIds, CHUNK_SIZE);

  console.log(
    `Processing ${allAlbumIds.length} albums in ${chunks.length} chunks of up to ${CHUNK_SIZE}...`
  );

  // Process each chunk synchronously
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    const url = `/albums?filter[id]=${chunk.join(',')}&include=artists,coverArt`;

    const response = await makeApiCallWithRetry<TidalAlbumResponse>(
      tidalClient,
      url,
      options
    );

    const items = response.data || [];
    const included = response.included || [];
    if (chunkIndex === 0) {
      console.log(
        'full response',
        response,
        included,
        included.find(
          (item) => item.id === items[0].relationships.artists.data[0]?.id
        )
      );
    }

    // TODO figure out how to remove duplicates - perhaps same name by same artist? - prefer explicit if it exists
    // TODO change this to list of artists perhaps? how do we find out which is the primary artist of an album?
    localAlbums.push(
      ...items.map((album) => {
        return {
          ...album,
          artist: included.find(
            (item) =>
              item.type === 'artists' &&
              item.id === album.relationships.artists.data[0]?.id
          ),
          coverArtFiles:
            included.find(
              (item) =>
                item.type === 'artworks' &&
                item.id === album.relationships.coverArt.data[0]?.id
            )?.attributes?.files || [],
        } as AlbumWithArtist; // TOOD would be nice if I didn't have to manually type this
      })
    );

    // Log progress every 100 albums
    if (localAlbums.length % 100 === 0) {
      console.log(`Fetched ${localAlbums.length} albums so far...`);
    }

    // TODO remove this eventually
    if (localAlbums.length > MAX_SAVED_ALBUMS) {
      break;
    }
  }

  return localAlbums;
};

export interface ArtistAttributes {
  name: string;
  [key: string]: unknown;
}

interface TidalArtistRelationships {
  albums?: {
    data?: {
      id: string;
    }[];
    links?: {
      self: string;
      next?: string;
    };
  };
}

export interface TidalArtist {
  id: string;
  attributes?: ArtistAttributes;
  relationships?: TidalArtistRelationships;
  [key: string]: unknown;
}

interface TidalArtistsResponse {
  data?: TidalArtist[];
  included?: Album[];
}

export interface ArtistAlbumsResult {
  artistAlbumsMap: Map<string, AlbumWithArtist[]>;
  artistsMap: Map<string, TidalArtist>;
}

export const getAllArtistAlbums = async (
  tidalClient: TidalAPIClient,
  artistIds: string[],
  options: FetchOptions = {}
): Promise<ArtistAlbumsResult> => {
  const artistAlbumsMap = new Map<string, AlbumWithArtist[]>();
  const artistsMap = new Map<string, TidalArtist>();

  // Split artistIds into chunks
  const chunks = chunkArray(artistIds, CHUNK_SIZE);

  console.log(
    `Processing ${artistIds.length} artists in ${chunks.length} chunks of up to ${CHUNK_SIZE}...`
  );

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    const url = `/artists?filter[id]=${chunk.join(',')}&include=albums`;

    const response = await makeApiCallWithRetry<TidalArtistsResponse>(
      tidalClient,
      url,
      options
    );

    const artists = response.data || [];
    if (chunkIndex === 0) {
      console.log('full artist response', response);
    }

    // Log progress every 100 albums
    if (artistAlbumsMap.size % 100 === 0) {
      console.log(`Fetched ${artistAlbumsMap.size} artists' albums so far...`);
    }

    const allResponseAlbumsMap = new Map<string, AlbumWithArtist>();
    for (const album of response.included || []) {
      if (album.id) {
        allResponseAlbumsMap.set(album.id, album);
      }
    }

    for (const artist of artists) {
      artistsMap.set(artist.id, artist);

      if (artist.relationships?.albums?.links?.next) {
        // todo this artist has more albums to retrieve
      }
      const albumsData = artist.relationships?.albums?.data || [];
      const albumIds = albumsData.map((album) => album.id);

      // TODO instead of getting all albums for the artist, just get the ones in the release date range that we care about
      const albumsForArtist = albumIds
        .map((id) => allResponseAlbumsMap.get(id))
        .filter(
          (album): album is Album =>
            !!album && album.attributes.albumType === 'ALBUM'
        );

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

  return { artistAlbumsMap, artistsMap };
};
