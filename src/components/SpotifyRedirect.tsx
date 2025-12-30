import React, { useEffect } from 'react';
import { useSpotify } from '../hooks/useSpotify';

const SpotifyRedirect = () => {
  const { storeTokenAtRedirect } = useSpotify();

  useEffect(() => {
    storeTokenAtRedirect();
  }, [storeTokenAtRedirect]);

  return <h1>Redirecting...</h1>;
};

export default SpotifyRedirect;
