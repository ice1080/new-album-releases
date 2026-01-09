interface TidalAPIClient {
  GET: (path: string) => Promise<unknown>;
  [key: string]: unknown;
}

interface TidalUser {
  id: string;
  [key: string]: unknown;
}

interface Album {
  attributes: unknown;
  title: string;
  releaseDate: string;
  id: string;
  [key: string]: unknown;
}

interface TidalAlbumResponse {
  included?: Album[];
  links: { next?: string };
  [key: string]: unknown;
}

interface GetAllSavedAlbumsOptions {
  maxRetries?: number;
  initialRetryDelay?: number;
  maxRetryDelay?: number;
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
  options: GetAllSavedAlbumsOptions
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

/**
 * Wrapper method to get all saved albums from Tidal with pagination and rate limit handling
 */
export const getAllSavedAlbums = async (
  tidalClient: TidalAPIClient,
  user: TidalUser,
  options: GetAllSavedAlbumsOptions = {}
): Promise<Album[]> => {
  const localSavedAlbums: Album[] = [];
  let nextUrl: string | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    let retryCount = 0;
    let success = false;
    let response: TidalAlbumResponse | null = null;

    // Retry loop for handling rate limits
    while (!success && retryCount < (options.maxRetries || 5)) {
      try {
        // Build the URL with cursor if available
        const url =
          nextUrl ||
          `/userCollections/${user.id}/relationships/albums?include=albums`;

        // openapi-fetch returns { data, error, response } - check for errors
        const result = (await tidalClient.GET(url)) as
          | TidalAlbumResponse
          | { data?: TidalAlbumResponse; error?: unknown; response?: Response };

        // Check if result has an error property (openapi-fetch pattern)
        if (result && typeof result === 'object' && 'error' in result) {
          const errorResult = result as ErrorResponse;
          if (errorResult.response?.status === 429) {
            // if (errorResult.error) {
            // Extract status from response if available
            const status = errorResult.response?.status;
            const errorWithStatus = {
              ...errorResult.error,
              status,
              statusCode: status,
              response: errorResult.response,
            };

            console.log('API error detected:', errorWithStatus);
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
    console.log('response', items[0].attributes.title);
    localSavedAlbums.push(...items);

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
