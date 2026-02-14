import QuestionMark from '@mui/icons-material/QuestionMark';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useCallback, useMemo } from 'react';
import { AlbumWithArtist } from '../utils/tidal';

interface AlbumArtistInfo {
  id: string;
  name: string;
}

interface RecentAlbumReleasesProps {
  recentAlbums: AlbumWithArtist[];
  albumIdToArtistsMap: Map<string, AlbumArtistInfo[]>;
}

export default function RecentAlbumReleases({
  recentAlbums,
  albumIdToArtistsMap,
}: RecentAlbumReleasesProps) {
  const getImageHref = useCallback(
    (album: AlbumWithArtist): string => album.coverArtFiles?.at(-1)?.href || '',
    []
  );

  const getSavedCell = () => {
    // TODO handle onClick (first have to determine what albums are saved already)
    // Tidal Album doesn't have isAlbumSaved property, so always show undefined/question mark
    return <QuestionMark />;
  };

  const getArtistName = useCallback(
    (album: AlbumWithArtist): string => {
      if (!album.id) return 'Unknown Album?';

      if (album.artist) {
        return `${album.artist.attributes.name} (${album.artist?.id})`;
      }

      const artists = albumIdToArtistsMap.get(album.id);
      if (artists && artists.length > 0) {
        return artists.map((artist) => artist.name).join(', ');
      }

      // Fallback to IDs if map doesn't have the album
      const artistIds = album.relationships?.artists?.data || [];
      if (artistIds.length > 0) {
        return artistIds.map((artist) => artist.id).join(', ');
      }

      return 'Unknown Artist(s)';
    },
    [albumIdToArtistsMap]
  );

  const columns = useMemo<ColumnDef<AlbumWithArtist>[]>(
    () => [
      {
        header: 'Image',
        accessorFn: getImageHref,
        cell: (props) => (
          <img
            className={'albumImage'}
            src={props.getValue() as string}
            alt=""
          />
        ),
      },
      {
        header: 'Artist',
        accessorFn: getArtistName,
      },
      {
        header: 'Album Name',
        accessorFn: (album) =>
          `${album.attributes?.title} (${album.id})` || 'Unknown',
      },
      {
        header: 'Date Released',
        accessorFn: (album) => album.attributes?.releaseDate || '',
        cell: (props) => {
          const releaseDate = props.getValue() as string;
          if (!releaseDate) return 'Unknown';
          return new Date(Date.parse(releaseDate)).toLocaleDateString('en-us', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
          });
        },
      },
      {
        header: 'Saved',
        accessorFn: () => undefined,
        cell: getSavedCell,
      },
    ],
    [getArtistName, getImageHref]
  );

  const sortedRecentAlbums = useMemo(() => {
    if (!recentAlbums) return [];
    return [...recentAlbums].sort((a, b) => {
      // Handle possible missing releaseDate (newest first)
      const dateA = a.attributes?.releaseDate
        ? new Date(a.attributes.releaseDate).getTime()
        : 0;
      const dateB = b.attributes?.releaseDate
        ? new Date(b.attributes.releaseDate).getTime()
        : 0;
      // Descending: latest first
      return dateB - dateA;
    });
  }, [recentAlbums]);

  const tableOptions = {
    columns,
    data: sortedRecentAlbums,
    getCoreRowModel: getCoreRowModel(),
  };
  const tableInstance = useReactTable(tableOptions);

  return (
    <>
      <h1>Recent Album Releases ({recentAlbums.length} total)</h1>
      {recentAlbums && recentAlbums.length > 0 && (
        <table>
          <thead>
            {tableInstance.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {tableInstance.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
