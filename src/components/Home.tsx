import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTidal } from '../hooks/useTidal';
import {
  getWithExpiry,
  removeItem,
  setWithExpiry,
} from '../utils/localStorage';
import {
  addArtistsToAlbums,
  AlbumWithArtist,
  fetchAlbumCoverArtUrlsByIds,
  getAllArtistAlbums,
  getAllSavedAlbums,
  SavedAlbum,
  TidalArtist,
  ArtistsType,
  ArtistAttributes,
} from '../utils/tidal';
import ApiCount from './ApiCount';
import CurrentProcess, { ProcessType } from './CurrentProcess';
import LoadingIcon from './LoadingIcon';
import RecentAlbumReleases from './RecentAlbumReleases';
import { parseReleaseDate } from '../utils/releaseDate';

interface AlbumArtistInfo {
  id: string;
  name: string;
}

const SAVED_ALBUMS_STORAGE_KEY = 'tidal_saved_albums';
const ALBUMS_WITH_ARTISTS_STORAGE_KEY = 'tidal_albums_with_artists';
const ARTIST_ALBUMS_STORAGE_KEY = 'tidal_artist_albums';
const RECENT_SAVED_STATUS_STORAGE_KEY = 'tidal_recent_album_saved_status';

const EXCLUDE_ALBUM_NAME_PATTERN =
  /deluxe|live at|\(live\)|th anniversary|instrumentals?|\(remixes\)|soundtrack/i;

/** Hide release dates more than this far ahead of "now" (allows imminent releases). */
const RELEASE_DATE_MAX_AHEAD_MS = 2 * 24 * 60 * 60 * 1000;

type RecentAlbumSavedStatusCache = {
  recentFingerprint: string;
  savedLibraryKey: string;
  statuses: Record<string, boolean>;
};

/**
 * Checks if the required conditions are met for API calls
 */
const canFetch = (
  tidalClient: unknown,
  hasLoggedIn: boolean,
  user: unknown
): boolean => {
  return !!(tidalClient && hasLoggedIn && user);
};

export default function Home() {
  // const ARTISTS_VIEW = 'artists';
  // const ALBUMS_VIEW = 'albums';
  // const ARTIST_MIN_SAVED_ALBUM_COUNT = 2;
  const CUTOFF_DAYS_AGO = 250;
  const DEFAULT_MAX_SAVED_ALBUMS = 500;

  const [maxSavedAlbumsInfinity, setMaxSavedAlbumsInfinity] =
    useState<boolean>(true);
  const [maxSavedAlbumsNumber, setMaxSavedAlbumsNumber] = useState<number>(
    DEFAULT_MAX_SAVED_ALBUMS
  );

  // const [currentView, setCurrentView] = useState<string>(ALBUMS_VIEW);
  const [isLoadingSavedAlbums, setIsLoadingSavedAlbums] =
    useState<boolean>(false);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState<boolean>(false);
  const [apiCount, setApiCount] = useState<number>(0);
  const [currentProcess, setCurrentProcess] = useState<ProcessType>(
    ProcessType.NONE
  );
  const fetchRunIdRef = useRef(0);
  const [albumsWithArtists, setAlbumsWithArtists] = useState<
    Map<string, AlbumWithArtist>
  >(new Map());
  const [artistsWithAlbums, setArtistsWithAlbums] =
    useState<Map<string, AlbumWithArtist[]>>();
  const [artistsMap, setArtistsMap] = useState<Map<string, TidalArtist>>(
    new Map()
  );
  const [savedAlbumIds, setSavedAlbumIds] = useState<Set<string>>(
    () => new Set()
  );
  const [recentAlbumSavedStatus, setRecentAlbumSavedStatus] = useState<
    Map<string, boolean> | undefined
  >(undefined);
  const [recentAlbumCoverArtUrlById, setRecentAlbumCoverArtUrlById] = useState<
    Map<string, string>
  >(() => new Map());
  const coverArtFetchRunIdRef = useRef(0);

  const { tidalClient, user, hasLoggedIn } = useTidal();

  const maxSavedAlbums = useMemo(() => {
    return maxSavedAlbumsInfinity ? Infinity : maxSavedAlbumsNumber;
  }, [maxSavedAlbumsInfinity, maxSavedAlbumsNumber]);

  const clearSavedAlbumCaches = useCallback(() => {
    if (!user) return;

    removeItem(`${SAVED_ALBUMS_STORAGE_KEY}_${user.id}`);
    removeItem(`${ALBUMS_WITH_ARTISTS_STORAGE_KEY}_${user.id}`);
    removeItem(`${ARTIST_ALBUMS_STORAGE_KEY}_${user.id}`);
    removeItem(`${RECENT_SAVED_STATUS_STORAGE_KEY}_${user.id}`);
    setRecentAlbumSavedStatus(undefined);
  }, [user]);

  const fetchAllSavedAlbums = useCallback(async (): Promise<SavedAlbum[]> => {
    if (tidalClient && hasLoggedIn && user) {
      // Check for cached albums first
      const cachedAlbums = getWithExpiry<SavedAlbum[]>(
        `${SAVED_ALBUMS_STORAGE_KEY}_${user.id}`
      );

      if (cachedAlbums) {
        console.log('Using cached saved albums:', cachedAlbums.length);
        console.log(
          'retrieved saved albums',
          cachedAlbums.map((album) => album.attributes?.title)
        );
        return cachedAlbums;
      }

      setIsLoadingSavedAlbums(true);
      setCurrentProcess(ProcessType.FETCHING_SAVED_ALBUMS);
      setApiCount(0); // Reset count at start

      try {
        const localSavedAlbums = await getAllSavedAlbums(tidalClient, user, {
          onApiCall: () => setApiCount((prev) => prev + 1),
          maxSavedAlbums,
        });

        // Store albums in localStorage with expiry
        setWithExpiry(
          `${SAVED_ALBUMS_STORAGE_KEY}_${user.id}`,
          localSavedAlbums
        );

        console.log(
          'retrieved saved albums, titles:',
          localSavedAlbums.map((album) => album.attributes?.title)
        );

        return localSavedAlbums;
      } catch (error) {
        console.error('Error fetching saved albums from Tidal:', error);
      } finally {
        setIsLoadingSavedAlbums(false);
        setCurrentProcess(ProcessType.NONE);
      }
    }
    return [];
  }, [tidalClient, user, hasLoggedIn, maxSavedAlbums]);

  const fetchAllAlbumArtistIds = useCallback(
    async (savedAlbums: SavedAlbum[]): Promise<AlbumWithArtist[]> => {
      if (tidalClient && hasLoggedIn && user) {
        // Check for cached artist counts first
        const cachedArtistCountsArray = getWithExpiry<AlbumWithArtist[]>(
          `${ALBUMS_WITH_ARTISTS_STORAGE_KEY}_${user.id}`
        );

        if (cachedArtistCountsArray) {
          console.log(
            'Using cached albums with artists:',
            cachedArtistCountsArray.length
          );
          return cachedArtistCountsArray;
        }

        setIsLoadingAlbums(true);
        setCurrentProcess(ProcessType.FETCHING_ALBUMS);

        try {
          const albumsWithArtists = await addArtistsToAlbums(
            tidalClient,
            savedAlbums,
            {
              onApiCall: () => setApiCount((prev) => prev + 1),
              maxSavedAlbums,
            }
          );

          // Store albums with artists in localStorage
          setWithExpiry(
            `${ALBUMS_WITH_ARTISTS_STORAGE_KEY}_${user.id}`,
            albumsWithArtists
          );

          console.log(
            'retrieved albums with artists:',
            albumsWithArtists.length
          );
          return albumsWithArtists;
        } catch (error) {
          console.error('Error fetching album artist IDs from Tidal:', error);
          return [];
        } finally {
          setIsLoadingAlbums(false);
          setCurrentProcess(ProcessType.NONE);
        }
      }
      return [];
    },
    [hasLoggedIn, tidalClient, user, maxSavedAlbums]
  );

  const fetchAllArtistAlbums = useCallback(
    async (
      albumsWithArtists: AlbumWithArtist[]
    ): Promise<{
      artistAlbumsMap: Map<string, AlbumWithArtist[]>;
      artistsMap: Map<string, TidalArtist>;
    }> => {
      if (!canFetch(tidalClient, hasLoggedIn, user)) {
        return {
          artistAlbumsMap: new Map<string, AlbumWithArtist[]>(),
          artistsMap: new Map<string, TidalArtist>(),
        };
      }

      const artistCountMap = new Map<string, number>();
      for (const album of albumsWithArtists) {
        const artistIds = album.relationships?.artists?.data || [];
        for (const artist of artistIds) {
          const artistId = artist.id;
          const currentCount = artistCountMap.get(artistId) || 0;
          artistCountMap.set(artistId, currentCount + 1);
        }
      }

      const artistIdsWithMultipleAlbums = Array.from(artistCountMap.entries())
        .filter(([, count]) => count > 1)
        .map(([artistId]) => artistId);

      if (artistIdsWithMultipleAlbums.length === 0) {
        console.log('No artists with multiple saved albums found.');
        return {
          artistAlbumsMap: new Map<string, AlbumWithArtist[]>(),
          artistsMap: new Map<string, TidalArtist>(),
        };
      }

      // Check for cached artist albums first
      const artistAlbumsCacheKey = `${ARTIST_ALBUMS_STORAGE_KEY}_${(user as { id: string }).id}`;
      const cachedArtistAlbums = getWithExpiry<{
        artistAlbumsEntries: [string, AlbumWithArtist[]][];
        artistsEntries: [string, TidalArtist][];
      }>(artistAlbumsCacheKey);

      if (cachedArtistAlbums) {
        const cachedArtistAlbumsMap = new Map<string, AlbumWithArtist[]>(
          cachedArtistAlbums.artistAlbumsEntries
        );
        const cachedArtistsMap = new Map<string, TidalArtist>(
          cachedArtistAlbums.artistsEntries
        );

        console.log(
          'Using cached artist albums:',
          cachedArtistAlbumsMap.size,
          'artists'
        );
        return {
          artistAlbumsMap: cachedArtistAlbumsMap,
          artistsMap: cachedArtistsMap,
        };
      }

      setIsLoadingAlbums(true);
      setCurrentProcess(ProcessType.FETCHING_ALBUMS);

      try {
        const result = await getAllArtistAlbums(
          tidalClient!,
          artistIdsWithMultipleAlbums,
          {
            onApiCall: () => setApiCount((prev) => prev + 1),
          }
        );

        console.log('retrieved artist albums', result.artistAlbumsMap);
        console.log('retrieved artists', result.artistsMap);

        // Cache artist albums and artist info
        setWithExpiry(artistAlbumsCacheKey, {
          artistAlbumsEntries: Array.from(result.artistAlbumsMap.entries()),
          artistsEntries: Array.from(result.artistsMap.entries()),
        });

        return result;
      } catch (error) {
        console.error('Error fetching artist albums from Tidal:', error);
        return {
          artistAlbumsMap: new Map<string, AlbumWithArtist[]>(),
          artistsMap: new Map<string, TidalArtist>(),
        };
      } finally {
        setIsLoadingAlbums(false);
        setCurrentProcess(ProcessType.NONE);
      }
    },
    [hasLoggedIn, tidalClient, user]
  );

  const cutoffDate = useMemo(() => {
    let date = new Date();
    date.setDate(date.getDate() - CUTOFF_DAYS_AGO);
    return date;
  }, []);

  const isDuplicateAlbum = useCallback(
    (album1: AlbumWithArtist, album2: AlbumWithArtist) => {
      return (
        album1.id === album2.id ||
        (album1.attributes.title === album2.attributes.title &&
          album1.artist?.id === album2.artist?.id)
      );
    },
    []
  );

  const filterAlbums = useCallback(
    (albums: AlbumWithArtist[]) => {
      const maxReleaseTime = Date.now() + RELEASE_DATE_MAX_AHEAD_MS;

      // De-dupe albums using `isDuplicateAlbum`
      const dedupedAlbums = albums.filter((album, idx, array) => {
        return (
          array.findIndex((candidate) => isDuplicateAlbum(album, candidate)) ===
          idx
        );
      });

      const otherFiltered = dedupedAlbums.filter((album) => {
        const releaseDate = parseReleaseDate(album.attributes.releaseDate);
        const albumName = album.attributes?.title;

        const nameMatchesExcluded = EXCLUDE_ALBUM_NAME_PATTERN.test(albumName);

        // Filter out if it matches keywords OR if it's too far in the future
        if (nameMatchesExcluded) return false;
        if (!releaseDate) return true;
        return releaseDate.getTime() <= maxReleaseTime;
      });

      return otherFiltered.sort((a, b) => {
        const dateB = parseReleaseDate(b.attributes.releaseDate)?.getTime();
        const dateA = parseReleaseDate(a.attributes.releaseDate)?.getTime();
        return (dateB ?? 0) - (dateA ?? 0);
      });
    },
    [isDuplicateAlbum]
  );

  useEffect(() => {
    const asyncMethod = async () => {
      if (hasLoggedIn) {
        const runId = ++fetchRunIdRef.current;
        // console.log('retrieving albums');
        const savedAlbums = await fetchAllSavedAlbums();
        setSavedAlbumIds(
          new Set(savedAlbums.map((a) => a.id).filter(Boolean) as string[])
        );
        // console.log('retrieving album artist ids');
        const _albumsWithArtists = await fetchAllAlbumArtistIds(savedAlbums);
        // TODO at some point need to save artist Ids to artist names somewhere
        console.log('retrieved albumsWithArtists', _albumsWithArtists);
        // console.log('retrieving artist albums');
        const result = await fetchAllArtistAlbums(_albumsWithArtists);

        // If another fetch started while we were waiting on the network,
        // ignore these stale results.
        if (runId !== fetchRunIdRef.current) return;

        setAlbumsWithArtists(
          new Map(
            _albumsWithArtists
              .filter((album) => album.id)
              .map((album) => [album.id, album])
          )
        );
        console.log('retrieved artistsWithAlbums', result.artistAlbumsMap);
        setArtistsWithAlbums(result.artistAlbumsMap);
        setArtistsMap(result.artistsMap);
      }
    };
    void asyncMethod();
  }, [
    hasLoggedIn,
    fetchAllSavedAlbums,
    fetchAllAlbumArtistIds,
    fetchAllArtistAlbums,
  ]);

  const recentAlbums: AlbumWithArtist[] = useMemo(() => {
    let output: AlbumWithArtist[] = [];

    artistsWithAlbums?.forEach((albums, artistId) => {
      if (Array.isArray(albums)) {
        albums.forEach((album) => {
          let releaseDateValue = album.attributes?.releaseDate;
          if (releaseDateValue) {
            const albumReleaseDate = parseReleaseDate(releaseDateValue);
            if (albumReleaseDate && albumReleaseDate >= cutoffDate) {
              const modifiedAlbum = {
                ...album,
                artist: {
                  id: artistId,
                  attributes:
                    artistsMap.get(artistId)?.attributes ||
                    ({} as ArtistAttributes),
                  type: 'artists' as ArtistsType,
                },
              };
              output.push(modifiedAlbum);
            }
          }
        });
      }
    });

    return filterAlbums(output);
  }, [filterAlbums, artistsWithAlbums, cutoffDate, artistsMap]);

  const recentAlbumsFingerprint = useMemo(() => {
    const ids = Array.from(
      new Set(recentAlbums.map((a) => a.id).filter(Boolean) as string[])
    ).sort();
    return ids.join(',');
  }, [recentAlbums]);

  const savedLibraryKey = useMemo(() => {
    const sorted = Array.from(savedAlbumIds).sort();
    return `${savedAlbumIds.size}:${sorted.join(',')}`;
  }, [savedAlbumIds]);

  useEffect(() => {
    if (!user || recentAlbums.length === 0) {
      return;
    }

    const recentIds = Array.from(
      new Set(recentAlbums.map((a) => a.id).filter(Boolean) as string[])
    ).sort();

    const cacheKey = `${RECENT_SAVED_STATUS_STORAGE_KEY}_${user.id}`;
    const cached = getWithExpiry<RecentAlbumSavedStatusCache>(cacheKey);

    if (
      cached &&
      cached.recentFingerprint === recentAlbumsFingerprint &&
      cached.savedLibraryKey === savedLibraryKey
    ) {
      setRecentAlbumSavedStatus(new Map(Object.entries(cached.statuses)));
      return;
    }

    if (savedAlbumIds.size === 0) {
      return;
    }

    const statuses: Record<string, boolean> = {};
    for (const id of recentIds) {
      statuses[id] = savedAlbumIds.has(id);
    }
    setRecentAlbumSavedStatus(new Map(Object.entries(statuses)));
    setWithExpiry(cacheKey, {
      recentFingerprint: recentAlbumsFingerprint,
      savedLibraryKey,
      statuses,
    });
  }, [
    user,
    recentAlbums,
    recentAlbumsFingerprint,
    savedLibraryKey,
    savedAlbumIds,
  ]);

  useEffect(() => {
    if (!canFetch(tidalClient, hasLoggedIn, user)) {
      setRecentAlbumCoverArtUrlById(new Map());
      return;
    }

    const ids = Array.from(
      new Set(recentAlbums.map((a) => a.id).filter(Boolean) as string[])
    );
    if (ids.length === 0) {
      setRecentAlbumCoverArtUrlById(new Map());
      return;
    }

    const runId = ++coverArtFetchRunIdRef.current;
    void (async () => {
      try {
        const map = await fetchAlbumCoverArtUrlsByIds(tidalClient!, ids, {
          onApiCall: () => setApiCount((c) => c + 1),
        });
        if (runId !== coverArtFetchRunIdRef.current) {
          console.log("run id didn't match");
          return;
        }
        console.log('album cover art map', map);
        setRecentAlbumCoverArtUrlById(map);
      } catch (error) {
        console.error('Error fetching recent album cover art:', error);
        if (runId === coverArtFetchRunIdRef.current) {
          setRecentAlbumCoverArtUrlById(new Map());
        }
      }
    })();
  }, [tidalClient, hasLoggedIn, user, recentAlbums]);

  const albumIdToArtistsMap: Map<string, AlbumArtistInfo[]> = useMemo(() => {
    const reverseMap = new Map<string, AlbumArtistInfo[]>();

    artistsWithAlbums?.forEach((albums, artistId) => {
      albums.forEach((album) => {
        if (!album.id) return;

        // Get all artist IDs from the album's relationships
        const albumArtistIds =
          albumsWithArtists.get(album.id)?.relationships?.artists?.data || [];

        // Build artist info for all artists associated with this album
        const artistsForAlbum: AlbumArtistInfo[] = [];

        albumArtistIds.forEach(({ id: relatedArtistId }) => {
          // Check if we have this artist in our artistsMap
          const artist = artistsMap.get(relatedArtistId);
          if (artist) {
            artistsForAlbum.push({
              id: artist.id,
              name: artist.attributes?.name || `Artist ${artist.id}`,
            });
          } else {
            // Artist not in map, but still add it with ID as fallback
            artistsForAlbum.push({
              id: relatedArtistId,
              name: `Artist ${relatedArtistId}`,
            });
          }
        });

        // Update the map, avoiding duplicates
        const existingArtists = reverseMap.get(album.id) || [];
        const existingIds = new Set(existingArtists.map((a) => a.id));

        const newArtists = artistsForAlbum.filter(
          (artist) => !existingIds.has(artist.id)
        );

        if (newArtists.length > 0) {
          reverseMap.set(album.id, [...existingArtists, ...newArtists]);
        } else if (existingArtists.length === 0) {
          // If no artists found, at least set an empty array
          reverseMap.set(album.id, artistsForAlbum);
        }
      });
    });

    return reverseMap;
  }, [artistsWithAlbums, artistsMap, albumsWithArtists]);

  const renderCurrentView = () => {
    // if (currentView === 'artists') {
    //   return <TopArtists topArtists={topArtists} />;
    // } else if (currentView === 'albums') {
    return (
      <>
        <label>
          Max saved albums:
          <input
            type="number"
            min={0}
            step={1}
            disabled={maxSavedAlbumsInfinity}
            value={maxSavedAlbumsNumber}
            onChange={(e) => {
              const parsed = Math.floor(Number(e.target.value));
              if (!Number.isNaN(parsed) && parsed >= 0) {
                setMaxSavedAlbumsNumber(parsed);
                clearSavedAlbumCaches();
              }
            }}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={maxSavedAlbumsInfinity}
            onChange={(e) => {
              clearSavedAlbumCaches();
              setMaxSavedAlbumsInfinity(e.target.checked);
            }}
          />
          Infinity
        </label>
        <br />
        <RecentAlbumReleases
          recentAlbums={recentAlbums}
          albumIdToArtistsMap={albumIdToArtistsMap}
          coverArtUrlByAlbumId={recentAlbumCoverArtUrlById}
          savedStatusByAlbumId={recentAlbumSavedStatus}
        />
      </>
    );
    // }
    // return null;
  };

  // const renderViewSelector = () => {
  //   return (
  //     <>
  //       <button onClick={() => setCurrentView(ALBUMS_VIEW)}>
  //         Recent Albums
  //       </button>
  //       <button onClick={() => setCurrentView(ARTISTS_VIEW)}>
  //         Top Artists
  //       </button>
  //       <br />
  //     </>
  //   );
  // };

  const isLoading = useMemo(() => {
    return isLoadingSavedAlbums || isLoadingAlbums;
  }, [isLoadingSavedAlbums, isLoadingAlbums]);

  return (
    <>
      {/* {renderViewSelector()} */}
      <LoadingIcon isLoading={isLoading} />
      <ApiCount apiCount={apiCount} />
      <CurrentProcess process={currentProcess} />
      {renderCurrentView()}
    </>
  );
}
