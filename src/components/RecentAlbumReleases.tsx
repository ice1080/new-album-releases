import React, { useMemo, useCallback } from 'react';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  ColumnDef,
} from '@tanstack/react-table';
import QuestionMark from '@mui/icons-material/QuestionMark';
import { Album } from '../utils/tidal';

interface AlbumArtistInfo {
  id: string;
  name: string;
}

interface RecentAlbumReleasesProps {
  recentAlbums: Album[];
  albumToArtistsMap: Map<string, AlbumArtistInfo[]>;
}

export default function RecentAlbumReleases({
  recentAlbums,
  albumToArtistsMap,
}: RecentAlbumReleasesProps) {
  const getImageHref = (): string | undefined => {
    // Tidal Album doesn't have images property, return undefined
    return undefined;
  };

  const getSavedCell = () => {
    // todo handle onClick
    // Tidal Album doesn't have isAlbumSaved property, so always show undefined/question mark
    return <QuestionMark />;
  };

  const getArtistNameMemo = useCallback(
    (album: Album): string => {
      if (!album.id) return 'Unknown Artist';

      const artists = albumToArtistsMap.get(album.id);
      if (artists && artists.length > 0) {
        return artists.map((artist) => artist.name).join(', ');
      }

      // Fallback to IDs if map doesn't have the album
      const artistIds = album.relationships?.artists?.data || [];
      if (artistIds.length > 0) {
        return artistIds.map((artist) => artist.id).join(', ');
      }

      return 'Unknown Artist';
    },
    [albumToArtistsMap]
  );

  const columns = useMemo<ColumnDef<Album>[]>(
    () => [
      {
        header: 'Image',
        accessorFn: getImageHref,
        cell: () => (
          <div
            className={'albumImage'}
            style={{ width: '64px', height: '64px', backgroundColor: '#ccc' }}
          >
            {/* Tidal Album doesn't have images */}
          </div>
        ),
      },
      {
        header: 'Artist',
        accessorFn: getArtistNameMemo,
      },
      {
        header: 'Album Name',
        accessorFn: (album) => album.attributes?.title || 'Unknown',
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
    [getArtistNameMemo]
  );

  const tableOptions = {
    columns,
    data: recentAlbums,
    getCoreRowModel: getCoreRowModel(),
  };
  const tableInstance = useReactTable(tableOptions);

  /* recentAlbums && */
  /* recentAlbums.length && */
  /* console.log("recent albums render:", recentAlbums); */
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
