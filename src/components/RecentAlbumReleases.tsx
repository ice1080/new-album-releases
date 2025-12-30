import React, { useMemo } from "react";
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import Favorite from "@mui/icons-material/Favorite";
import FavoriteBorder from "@mui/icons-material/FavoriteBorder";
import QuestionMark from "@mui/icons-material/QuestionMark";

interface AlbumImage {
  url: string;
  height?: number;
  width?: number;
}

interface AlbumArtist {
  name: string;
  id?: string;
  [key: string]: unknown;
}

interface Album {
  images?: AlbumImage[];
  artistName?: string;
  name: string;
  release_date: string;
  isAlbumSaved?: boolean;
  id?: string;
  [key: string]: unknown;
}

interface RecentAlbumReleasesProps {
  recentAlbums: Album[];
}

export default function RecentAlbumReleases({ recentAlbums }: RecentAlbumReleasesProps) {
  const getImageHref = (info: Album): string | undefined => {
    if (info.images && info.images.length) {
      return info.images[0].url;
    }
    return undefined;
  };

  const getSavedCell = (props: { getValue: () => unknown }) => {
    // todo handle onClick
    const value = props.getValue() as boolean | undefined;
    /* console.log("value", value); */
    const sx = { color: "green" };
    if (value === undefined) {
      return <QuestionMark />;
    } else if (value) {
      return <Favorite sx={sx} />;
    } else {
      return <FavoriteBorder sx={sx} />;
    }
  };

  const columns = useMemo<ColumnDef<Album>[]>(() => [
    {
      header: "Image",
      accessorFn: getImageHref,
      cell: (props) => <img className={"albumImage"} src={props.getValue() as string} alt="" />,
    },
    {
      header: "Artist",
      accessorKey: "artistName",
    },
    {
      header: "Album Name",
      accessorKey: "name",
    },
    {
      header: "Date Released",
      accessorKey: "release_date",
      cell: (props) =>
        new Date(Date.parse(props.getValue() as string)).toLocaleDateString("en-us", {
          year: "numeric",
          month: "short",
          day: "2-digit",
        }),
    },
    {
      header: "Saved",
      accessorKey: "isAlbumSaved",
      cell: getSavedCell,
    },
  ], []);
  
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

