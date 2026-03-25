import QuestionMark from '@mui/icons-material/QuestionMark';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useCallback, useMemo } from 'react';
import { AlbumWithArtist } from '../utils/tidal';
import { parseReleaseDate } from '../utils/releaseDate';

interface AlbumArtistInfo {
  id: string;
  name: string;
}

interface RecentAlbumReleasesProps {
  recentAlbums: AlbumWithArtist[];
  albumIdToArtistsMap: Map<string, AlbumArtistInfo[]>;
  /** Album id → cover image URL (batch-fetched for recent releases) */
  coverArtUrlByAlbumId: Map<string, string>;
  /** Per-album saved-to-library status; undefined while loading */
  savedStatusByAlbumId?: Map<string, boolean>;
}

export default function RecentAlbumReleases({
  recentAlbums,
  albumIdToArtistsMap,
  coverArtUrlByAlbumId,
  savedStatusByAlbumId,
}: RecentAlbumReleasesProps) {
  const renderSavedCell = useCallback(
    (album: AlbumWithArtist) => {
      const id = album.id;
      if (!id) return '—';
      if (savedStatusByAlbumId === undefined) {
        return <QuestionMark fontSize="small" />;
      }
      const saved = savedStatusByAlbumId.get(id);
      if (saved === undefined) {
        return <QuestionMark fontSize="small" />;
      }
      return saved ? '✅' : '❌';
    },
    [savedStatusByAlbumId]
  );

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
        id: 'coverImage',
        header: 'Image',
        // Read URLs here, not via accessorFn + getValue(): TanStack Table caches
        // accessor output per row and won't refresh when only coverArtUrlByAlbumId changes.
        cell: ({ row }) => {
          const album = row.original;
          const fromMap = album.id
            ? coverArtUrlByAlbumId.get(album.id)
            : undefined;
          const src =
            fromMap || album.coverArtFiles?.at(-1)?.href || '';
          return <img className={'albumImage'} src={src} alt="" />;
        },
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

          const parsed = parseReleaseDate(releaseDate);
          if (!parsed) return 'Unknown';

          return parsed.toLocaleDateString('en-us', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
          });
        },
      },
      {
        id: 'saved',
        header: 'Saved',
        accessorFn: () => undefined,
        cell: (props) => renderSavedCell(props.row.original),
      },
    ],
    [getArtistName, coverArtUrlByAlbumId, renderSavedCell]
  );

  const sortedRecentAlbums = useMemo(() => {
    if (!recentAlbums) return [];
    return [...recentAlbums].sort((a, b) => {
      // Handle possible missing releaseDate (newest first)
      const dateA = a.attributes?.releaseDate
        ? (parseReleaseDate(a.attributes.releaseDate)?.getTime() ?? 0)
        : 0;
      const dateB = b.attributes?.releaseDate
        ? (parseReleaseDate(b.attributes.releaseDate)?.getTime() ?? 0)
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
