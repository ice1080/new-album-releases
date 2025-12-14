import React, { useEffect, useState, useRef, useCallback } from "react";
import { useDeezer } from "../hooks/useDeezer";
import { useTidal } from "../hooks/useTidal";
import RecentAlbumReleases from "./RecentAlbumReleases";
import TopArtists from "./TopArtists";
import LoadingIcon from "./LoadingIcon";
import ApiCount from "./ApiCount";

export default function Home() {
  const ARTISTS_VIEW = "artists";
  const ALBUMS_VIEW = "albums";
  const CUTOFF_DAYS_AGO = 250;
  const MAX_ARTISTS_LIMIT = 101;
  const MAX_SAVED_ALBUMS = 2000;
  const TOP_ARTISTS_LIMIT = 49;
  const SAVED_ALBUMS_LIMIT = 50;
  const ARTIST_MIN_SAVED_ALBUM_COUNT = 2;
  let CUTOFF_DATE;

  const [topArtists, setTopArtists] = useState([]);
  const [savedAlbumArtists, setSavedAlbumArtists] = useState([]);
  const [recentAlbums, setRecentAlbums] = useState([]);
  // const [addSavedToQuery, setAddSavedToQuery] = useState(false);
  const [addSavedToQuery, setAddSavedToQuery] = useState(true);
  const [showMySavedAlbums, setShowMySavedAlbums] = useState(true);
  const [currentView, setCurrentView] = useState(ALBUMS_VIEW);
  const [isLoading, setIsLoading] = useState(true);
  const [apiCount, setApiCount] = useState(0);

  const { tidalClient, user, hasLoggedIn } = useTidal();

  const incrementApiCount = useCallback(() => {
    setApiCount((prevCount) => prevCount + 1);
  }, []);

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

  const getAllSavedAlbums = useCallback(() => {
    if (addSavedToQuery && tidalClient && hasLoggedIn) {
      console.log("getAllSavedAlbums");
      // TODO add sleep here?
      setIsLoading(true);
      let albumPromises = [];
      const maxLimit = MAX_SAVED_ALBUMS / 50;
      albumPromises.push(
        tidalClient.GET(`/userCollections/${user.id}?include=albums`)
      );
      // for (let i = 0; i < maxLimit; i++) {
      //   incrementApiCount();
      //   const offset = i * SAVED_ALBUMS_LIMIT;
      //   const limit = 50;
      //   // Tidal API endpoint for favorite albums with pagination
      // }
      Promise.all(albumPromises).then((albumsList) => {
        let localSavedAlbums = [];
        albumsList.forEach((values) => {
          // Tidal API returns items directly or in a data/items structure
          const items = values.items || values.data?.items || values || [];
          localSavedAlbums = localSavedAlbums.concat(
            items.map((el) => el.album || el)
          );
        });
        let artistSavedAlbumCount = {};
        let minSavedCountArtists = new Set();
        localSavedAlbums.forEach((album) => {
          // Tidal API may have artists in different structure
          const artists = album.artists || album.artist || [];
          artists.forEach((artist) => {
            const artistName = artist.name || artist;
            let newCount = 1;
            if (artistSavedAlbumCount[artistName]) {
              newCount = artistSavedAlbumCount[artistName].count + 1;
              artistSavedAlbumCount[artistName].count = newCount;
            } else {
              artistSavedAlbumCount[artistName] = {
                count: newCount,
                artist: artist,
              };
            }
            if (newCount === ARTIST_MIN_SAVED_ALBUM_COUNT) {
              minSavedCountArtists.add(artist);
            }
          });
        });
        /* const filteredTest = Object.keys(artistSavedAlbumCount)
         *   .filter(
         *     (artistName) =>
         *       artistSavedAlbumCount[artistName].count >=
         *       ARTIST_MIN_SAVED_ALBUM_COUNT
         *   )
         *   .reduce(
         *     (res, key) =>
         *       Object.assign(res, { [key]: artistSavedAlbumCount[key] }),
         *     {}
         *   ); */

        /* console.log("localSavedAlbums", localSavedAlbums); */
        /* console.log(
         *   "artistSavedAlbumCount",
         *   artistSavedAlbumCount,
         *   Object.keys(artistSavedAlbumCount).length
         * ); */
        /* console.log(
         *   `artists with more than ${ARTIST_MIN_SAVED_ALBUM_COUNT} saved albums`,
         *   filteredTest,
         *   Object.keys(filteredTest).length
         * ); */
        console.log(
          "savedAlbumArtists",
          minSavedCountArtists,
          minSavedCountArtists.size
        );
        setSavedAlbumArtists(Array.from(minSavedCountArtists));
      }).catch((error) => {
        console.error("Error fetching saved albums from Tidal:", error);
        setIsLoading(false);
      });
    }
  }, [addSavedToQuery, tidalClient, user]);

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

  // const getCutoffDate = () => {
  //   if (!CUTOFF_DATE) {
  //     let d = new Date();
  //     d.setDate(d.getDate() - CUTOFF_DAYS_AGO);
  //     CUTOFF_DATE = d;
  //   }
  //   return CUTOFF_DATE;
  // };

  // const isDuplicateAlbum = (album1, album2) => {
  //   // todo figure out a better way to display duplicate albums
  //   return (
  //     album1.id === album2.id
  //     /* || */
  //     /* (album1.name === album2.name && album1.artistName === album2.artistName) */
  //   );
  // };

  // const filterAlbums = (albums) => {
  //   if (albums) {
  //     return (
  //       Object.values(albums)
  //         /* .filter((albumId, idx, array) => {
  //          *   return (
  //          *     array.findIndex((arrayEl) =>
  //          *       isDuplicateAlbum(albums[arrayEl], albums[albumId])
  //          *     ) === idx
  //          *   );
  //          * }) */
  //         .sort((a, b) => {
  //           return new Date(b.release_date) - new Date(a.release_date);
  //         })
  //     );
  //   } else {
  //     return [];
  //   }
  // };

  // useEffect(() => {
  //   if (hasLoggedIn) {
  //     getAllTopArtists();
  //     getAllSavedAlbums();
  //   }
  // }, [getAllSavedAlbums, getAllTopArtists, hasLoggedIn]);

  useEffect(() => {
    console.log('home - hasLoggedIn change', hasLoggedIn);
    if (hasLoggedIn) {
      getAllSavedAlbums();
    }
  }, [getAllSavedAlbums, hasLoggedIn]);

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
    if (addSavedToQuery && savedAlbumArtists.length === 0) {
      getAllSavedAlbums();
    }
  }, [addSavedToQuery, savedAlbumArtists.length, getAllSavedAlbums]);

  // useEffect(() => {
  //   if (showMySavedAlbums && Object.keys(recentAlbums).length > 0) {
  //     addSavedAlbums();
  //   }
  // }, [recentAlbums, showMySavedAlbums]);

  const renderCurrentView = () => {
    if (currentView === "artists") {
      return <TopArtists topArtists={topArtists} />;
    } else if (currentView === "albums") {
      return (
        <>
          <label>
            Add all saved albums to list of artists to query for new releases:
            <input
              type={"checkbox"}
              onChange={() => setAddSavedToQuery(!addSavedToQuery)}
              checked={addSavedToQuery}
            />
          </label>
          <br />
          <label>
            Show My Saved Albums:
            <input
              type={"checkbox"}
              onChange={() => setShowMySavedAlbums(!showMySavedAlbums)}
              checked={showMySavedAlbums}
            />
          </label>

          {/* <RecentAlbumReleases recentAlbums={filterAlbums(recentAlbums)} /> */}
        </>
      );
    }
  };

  const renderViewSelector = () => {
    return (
      <>
        <button onClick={() => setCurrentView(ALBUMS_VIEW)}>
          Recent Albums
        </button>
        <button onClick={() => setCurrentView(ARTISTS_VIEW)}>
          Top Artists
        </button>
        <br />
      </>
    );
  };

  return (
    <>
      {renderViewSelector()}
      <LoadingIcon isLoading={isLoading} />
      <ApiCount apiCount={apiCount} />
      {renderCurrentView()}
    </>
  );
}
