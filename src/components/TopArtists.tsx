import React from 'react';

interface Artist {
  name: string;
  id?: string;
  [key: string]: unknown;
}

interface TopArtistsProps {
  topArtists: Artist[];
}

export default function TopArtists({ topArtists }: TopArtistsProps) {
  return (
    <>
      <h1>Your Top Artists ({topArtists.length})</h1>
      <ul>
        {topArtists.map((artist, i) => {
          return <li key={i}>{artist.name}</li>;
        })}
      </ul>
    </>
  );
}
