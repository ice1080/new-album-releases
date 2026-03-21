import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTidal } from '../hooks/useTidal';
import { getWithExpiry, setWithExpiry } from '../utils/localStorage';
import {
  addArtistsToAlbums,
  AlbumWithArtist,
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

interface AlbumArtistInfo {
  id: string;
  name: string;
}

const SAVED_ALBUMS_STORAGE_KEY = 'tidal_saved_albums';
const ALBUMS_WITH_ARTISTS_STORAGE_KEY = 'tidal_albums_with_artists';
const ARTIST_ALBUMS_STORAGE_KEY = 'tidal_artist_albums';

/**
 * Checks if the required conditions are met for API calls
 */
const canFetch = (
  addSavedToQuery: boolean,
  tidalClient: unknown,
  hasLoggedIn: boolean,
  user: unknown
): boolean => {
  return !!(addSavedToQuery && tidalClient && hasLoggedIn && user);
};

export default function Home() {
  // const ARTISTS_VIEW = 'artists';
  // const ALBUMS_VIEW = 'albums';
  // const ARTIST_MIN_SAVED_ALBUM_COUNT = 2;
  const CUTOFF_DAYS_AGO = 250;

  // const [topArtists] = useState<Artist[]>([]);
  // const [savedAlbumArtists, setSavedAlbumArtists] = useState<Artist[]>([]);
  // const [addSavedToQuery, setAddSavedToQuery] = useState(false);
  const [addSavedToQuery, setAddSavedToQuery] = useState<boolean>(true);
  const [showMySavedAlbums, setShowMySavedAlbums] = useState<boolean>(true);
  // const [currentView, setCurrentView] = useState<string>(ALBUMS_VIEW);
  const [isLoadingSavedAlbums, setIsLoadingSavedAlbums] =
    useState<boolean>(false);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState<boolean>(false);
  const [apiCount, setApiCount] = useState<number>(0);
  const [currentProcess, setCurrentProcess] = useState<ProcessType>(
    ProcessType.NONE
  );
  const [albumsWithArtists, setAlbumsWithArtists] = useState<
    Map<string, AlbumWithArtist>
  >(new Map());
  const [artistsWithAlbums, setArtistsWithAlbums] =
    useState<Map<string, AlbumWithArtist[]>>();
  const [artistsMap, setArtistsMap] = useState<Map<string, TidalArtist>>(
    new Map()
  );

  const { tidalClient, user, hasLoggedIn } = useTidal();

  // const getAllTopArtists = () => {
  //   console.log("getAllTopArtists");
  //   setIsLoading(true);
  //   let artistPromises = [];
  //   let artistLimitArray = [50, 50];
  //   artistLimitArray.forEach((limit, i) => {
  //     incrementApiCount();
  //     artistPromises.push(
  //       spotifyApi.getMyTopArtists({
  //         time_range: "long_term",
  //         limit: limit,
  //         offset: i * TOP_ARTISTS_LIMIT,
  //       })
  //     );
  //   });
  //   Promise.all(artistPromises).then((artistsList) => {
  //     let localTopArtists = [];
  //     artistsList.forEach((values) => {
  //       localTopArtists = localTopArtists.concat(values.items);
  //     });
  //     localTopArtists = localTopArtists.sort((a, b) => {
  //       if (a.popularity > b.popularity) return -1;
  //       if (b.popularity < a.popularity) return 1;
  //       return 0;
  //     });
  //     /* console.log("top artists", localTopArtists, localTopArtists.length); */
  //     setTopArtists(localTopArtists);
  //   });
  // };

  const fetchAllSavedAlbums = useCallback(async (): Promise<SavedAlbum[]> => {
    if (addSavedToQuery && tidalClient && hasLoggedIn && user) {
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
  }, [addSavedToQuery, tidalClient, user, hasLoggedIn]);

  const fetchAllAlbumArtistIds = useCallback(
    async (savedAlbums: SavedAlbum[]): Promise<AlbumWithArtist[]> => {
      if (addSavedToQuery && tidalClient && hasLoggedIn && user) {
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
    [addSavedToQuery, hasLoggedIn, tidalClient, user]
  );

  const fetchAllArtistAlbums = useCallback(
    async (
      albumsWithArtists: AlbumWithArtist[]
    ): Promise<{
      artistAlbumsMap: Map<string, AlbumWithArtist[]>;
      artistsMap: Map<string, TidalArtist>;
    }> => {
      if (!canFetch(addSavedToQuery, tidalClient, hasLoggedIn, user)) {
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
    [addSavedToQuery, hasLoggedIn, tidalClient, user]
  );

  // const addSavedAlbums = async () => {
  //   console.log("addSavedAlbums");
  //   await new Promise((r) => setTimeout(r, 5000));
  //   let tempRecentAlbums = { ...recentAlbums };
  //   const albumIds = Object.keys(recentAlbums).filter(
  //     (albumId) => recentAlbums[albumId].isAlbumSaved === undefined
  //   );
  //   if (albumIds.length) {
  //     for (let i = 0; i < albumIds.length; i += SAVED_ALBUMS_LIMIT) {
  //       const tempIds = albumIds.slice(i, i + SAVED_ALBUMS_LIMIT);
  //       incrementApiCount();
  //       await spotifyApi
  //         .containsMySavedAlbums(tempIds)
  //         .then((savedBooleans, err) => {
  //           savedBooleans.forEach((isAlbumSaved, idx) => {
  //             tempRecentAlbums[tempIds[idx]].isAlbumSaved = isAlbumSaved;
  //           });
  //         });
  //     }
  //     setRecentAlbums(tempRecentAlbums);
  //   }
  // };

  // const getAllRecentAlbums = async () => {
  //   console.log("getAllRecentAlbums");
  //   await new Promise((r) => setTimeout(r, 5000));
  //   let allRecentAlbums = {};
  //   let artistAlbumPromises = [];
  //   let allArtists = combineArtistLists();
  //   console.log("allArtists", allArtists.length, allArtists);
  //   let i = 0;
  //   for (const artist of allArtists) {
  //     if (i % 50 === 0) {
  //       await new Promise((r) => setTimeout(r, 5000));
  //     }
  //     /* allArtists.forEach((artist) => { */
  //     // this may be needed once more artists are added (e.g. hundreds)
  //     /* if (!artist.recentAlbums) { */
  //     incrementApiCount();
  //     artistAlbumPromises.push(
  //       spotifyApi.getArtistAlbums(artist.id, {
  //         include_groups: "album",
  //       })
  //     );
  //     /* } */
  //     /* }); */
  //     i++;
  //   }
  //   Promise.all(artistAlbumPromises).then((values) => {
  //     values.forEach((data, i) => {
  //       if (data.items && data.items.length) {
  //         const recentArtistAlbums = data.items
  //           .filter((album) => Date.parse(album.release_date) > getCutoffDate())
  //           .map((album) => {
  //             album.artistName = allArtists[i].name;
  //             return album;
  //           });
  //         if (recentArtistAlbums.length > 0) {
  //           recentArtistAlbums.map((item) => (allRecentAlbums[item.id] = item));
  //         }
  //       }
  //     });
  //     setRecentAlbums(allRecentAlbums);
  //     setIsLoading(false);
  //     /* console.log("done retrieving all recent albums"); */
  //   });
  // };

  // const combineArtistLists = () => {
  //   let combined = {};
  //   topArtists.forEach((artist) => {
  //     combined[artist.id] = artist;
  //   });
  //   if (addSavedToQuery) {
  //     savedAlbumArtists.forEach((artist) => {
  //       if (!combined[artist.id]) {
  //         combined[artist.id] = artist;
  //       }
  //     });
  //   }
  //   return Object.values(combined);
  // };

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

  // TODO remove future albums
  const filterAlbums = useCallback(
    (albums: AlbumWithArtist[]) => {
      // De-dupe albums using `isDuplicateAlbum`
      const dedupedAlbums = albums.filter((album, idx, array) => {
        return (
          array.findIndex((candidate) => isDuplicateAlbum(album, candidate)) ===
          idx
        );
      });

      return dedupedAlbums.sort((a, b) => {
        return (
          new Date(b.attributes.releaseDate).getTime() -
          new Date(a.attributes.releaseDate).getTime()
        );
      });
    },
    [isDuplicateAlbum]
  );

  // useEffect(() => {
  //   /* console.log("topArtists", topArtists); */
  //   /* console.log("savedAlbumArtists", savedAlbumArtists); */
  //   if (
  //     topArtists.length > 0 &&
  //     (savedAlbumArtists.length > 0 || !addSavedToQuery)
  //   ) {
  //     getAllRecentAlbums();
  //   }
  // }, [topArtists, savedAlbumArtists]);

  useEffect(() => {
    const asyncMethod = async () => {
      if (hasLoggedIn && addSavedToQuery) {
        // console.log('retrieving albums');
        const savedAlbums = await fetchAllSavedAlbums();
        // console.log('retrieving album artist ids');
        const _albumsWithArtists = await fetchAllAlbumArtistIds(savedAlbums);
        // TODO at some point need to save artist Ids to artist names somewhere
        console.log('retrieved albumsWithArtists', _albumsWithArtists);
        // console.log('retrieving artist albums');
        const result = await fetchAllArtistAlbums(_albumsWithArtists);
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
    addSavedToQuery,
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
            const albumReleaseDate = new Date(releaseDateValue);
            if (albumReleaseDate >= cutoffDate) {
              const modifiedAlbum = {
                ...album,
                artist: {
                  id: artistId,
                  attributes:
                    artistsMap.get(artistId)?.attributes ||
                    ({} as ArtistAttributes),
                  type: 'artists' as ArtistsType,
                },
                coverArtFiles: albumsWithArtists.get(album.id)?.coverArtFiles,
              };
              output.push(modifiedAlbum);
            }
          }
        });
      }
    });

    return filterAlbums(output);
  }, [
    filterAlbums,
    artistsWithAlbums,
    cutoffDate,
    albumsWithArtists,
    artistsMap,
  ]);

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

  // useEffect(() => {
  //   if (showMySavedAlbums && Object.keys(recentAlbums).length > 0) {
  //     addSavedAlbums();
  //   }
  // }, [recentAlbums, showMySavedAlbums]);

  const renderCurrentView = () => {
    // if (currentView === 'artists') {
    //   return <TopArtists topArtists={topArtists} />;
    // } else if (currentView === 'albums') {
    return (
      <>
        <label>
          Add all saved albums to list of artists to query for new releases:
          <input
            type={'checkbox'}
            onChange={() => setAddSavedToQuery(!addSavedToQuery)}
            checked={addSavedToQuery}
          />
        </label>
        <br />
        <label>
          Show My Saved Albums:
          <input
            type={'checkbox'}
            onChange={() => setShowMySavedAlbums(!showMySavedAlbums)}
            checked={showMySavedAlbums}
          />
        </label>

        <RecentAlbumReleases
          recentAlbums={recentAlbums}
          albumIdToArtistsMap={albumIdToArtistsMap}
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
