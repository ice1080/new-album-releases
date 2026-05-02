import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { buildSpotifyQueryString, generateState } from '../utils/spotify';
import SpotifyWebApi from 'spotify-web-api-js';

const spotifyApi = new SpotifyWebApi();

// Environment variables from `.env` file.
let {
  REACT_APP_SPOTIFY_RELEASE_CLIENT_ID,
  REACT_APP_SPOTIFY_RELEASE_REDIRECT_URI,
  REACT_APP_SPOTIFY_RELEASE_SCOPES,
  PORT,
} = process.env;

if (!REACT_APP_SPOTIFY_RELEASE_REDIRECT_URI) {
  // TODO would have to update spotify api page to allow 3006 also
  REACT_APP_SPOTIFY_RELEASE_REDIRECT_URI = `http://127.0.0.1:${PORT || 3000}/spotify-redirect`;
}

if (!REACT_APP_SPOTIFY_RELEASE_SCOPES) {
  REACT_APP_SPOTIFY_RELEASE_SCOPES = 'user-top-read, user-library-read';
}

const BASE_API_URL = 'https://api.spotify.com/v1';

const LS_KEYS = {
  ACCESS_TOKEN: 'SPOTIFY_ACCESS_TOKEN',
  EXP_TIMESTAMP: 'SPOTIFY_TOKEN_EXPIRE_TIMESTAMP',
  TOKEN_TYPE: 'SPOTIFY_TOKEN_TYPE',
};

interface SpotifyUser {
  id: string;
  display_name?: string;
  email?: string;
  [key: string]: unknown;
}

interface SpotifyContextValue {
  user: SpotifyUser | null;
  login: () => void;
  logout: () => void;
  isLoading: boolean;
  hasLoggedIn: boolean;
  hasRedirectedFromValidPopup: boolean;
  storeTokenAtRedirect: () => void;
  spotifyApi: SpotifyWebApi.SpotifyWebApiJs;
  fetchCurrentUserInfo: () => Promise<SpotifyUser>;
  fetchSearchResults: (params: {
    query: string;
    type?: string;
    limit?: number;
  }) => Promise<unknown>;
}

const spotifyContext = createContext<SpotifyContextValue | undefined>(
  undefined
);

interface SpotifyProviderProps {
  children: ReactNode;
}

export const SpotifyProvider = ({ children }: SpotifyProviderProps) => {
  const spotify = useProvideSpotify();

  return (
    <spotifyContext.Provider value={spotify}>
      {children}
    </spotifyContext.Provider>
  );
};

export const useSpotify = (): SpotifyContextValue => {
  const context = useContext(spotifyContext);
  if (context === undefined) {
    throw new Error('useSpotify must be used within a SpotifyProvider');
  }
  return context;
};

interface CallEndpointParams {
  path: string;
  method?: string;
}

const useProvideSpotify = (): SpotifyContextValue => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenExp, setTokenExp] = useState<number | null>(null);

  const navigate = useNavigate();

  const callEndpoint = async ({
    path,
    method = 'GET',
  }: CallEndpointParams): Promise<unknown> => {
    if (hasTokenExpired()) {
      invalidateToken();

      throw new Error('Token has expired.');
    }

    return await (
      await fetch(`${BASE_API_URL}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        method,
      })
    ).json();
  };

  const fetchCurrentUserInfo = async (): Promise<SpotifyUser> => {
    return (await callEndpoint({ path: '/me' })) as SpotifyUser;
  };

  const fetchSearchResults = async ({
    query,
    type = 'album,artist,playlist,track,show,episode',
    limit = 20,
  }: {
    query: string;
    type?: string;
    limit?: number;
  }): Promise<unknown> => {
    const qs = buildSpotifyQueryString({
      q: query,
      type,
      limit,
    });

    return await callEndpoint({ path: `/search?${qs}` });
  };

  const login = (): void => {
    const popup = window.open(
      `https://accounts.spotify.com/authorize?client_id=${REACT_APP_SPOTIFY_RELEASE_CLIENT_ID}&redirect_uri=${encodeURIComponent(
        REACT_APP_SPOTIFY_RELEASE_REDIRECT_URI || ''
      )}&scope=${encodeURIComponent(
        REACT_APP_SPOTIFY_RELEASE_SCOPES || ''
      )}&response_type=token&state=${generateState(16)}&show_dialog=true`,
      'Login with Spotify',
      'width=600,height=800'
    );

    (
      window as Window & {
        spotifyAuthCallback?: (
          accessToken: string,
          expTimestamp: number
        ) => void;
      }
    ).spotifyAuthCallback = async (
      accessToken: string,
      expTimestamp: number
    ) => {
      popup?.close();

      setToken(accessToken);
      setTokenExp(expTimestamp);
      spotifyApi.setAccessToken(accessToken);
    };
  };

  const storeTokenAtRedirect = (): void => {
    const searchParams = new URLSearchParams(window.location.hash.substring(1));

    try {
      const accessToken = searchParams.get('access_token');
      const expiresIn = parseInt(searchParams.get('expires_in') || '0', 10);
      const tokenType = searchParams.get('token_type');

      const expTimestamp = Math.floor(Date.now() / 1000 + expiresIn); // In seconds.

      window.localStorage.setItem(LS_KEYS.ACCESS_TOKEN, accessToken || '');
      window.localStorage.setItem(LS_KEYS.EXP_TIMESTAMP, String(expTimestamp));
      window.localStorage.setItem(LS_KEYS.TOKEN_TYPE, tokenType || '');

      const opener = window.opener as
        | (Window & {
            spotifyAuthCallback?: (
              accessToken: string,
              expTimestamp: number
            ) => void;
          })
        | null;
      if (opener?.spotifyAuthCallback && accessToken) {
        opener.spotifyAuthCallback(accessToken, expTimestamp);
      }
    } catch (err) {
      console.error(err);

      throw new Error(`Could not store token information in local storage.`);
    }
  };

  const invalidateToken = (): void => {
    try {
      Object.values(LS_KEYS).forEach((key) => {
        window.localStorage.removeItem(key);
      });
    } catch (err) {
      console.error(err);
    }

    setUser(null);
    setToken(null);
    setTokenExp(null);
  };

  const logout = (): void => {
    invalidateToken();

    window.location.reload();
  };

  const hasTokenExpired = (): boolean => {
    try {
      const accessToken =
        token || window.localStorage.getItem(LS_KEYS.ACCESS_TOKEN);
      const expTimestamp =
        tokenExp ||
        parseInt(window.localStorage.getItem(LS_KEYS.EXP_TIMESTAMP) || '0', 10);

      if (!accessToken || !expTimestamp || isNaN(expTimestamp)) {
        return false;
      }

      return Date.now() / 1000 > expTimestamp;
    } catch (err) {
      console.error(err);

      return true;
    }
  };

  const hasLoggedIn = (): boolean => {
    return !!token && !!user && !hasTokenExpired();
  };

  const hasRedirectedFromValidPopup = (): boolean => {
    if (window.opener === null) {
      return false;
    }

    try {
      const { hostname: openerHostname } = new URL(window.opener.location.href);
      const { hostname } = new URL(window.location.href);

      const opener = window.opener as Window & {
        spotifyAuthCallback?: (
          accessToken: string,
          expTimestamp: number
        ) => void;
      };
      return (
        window.opener &&
        window.opener !== window &&
        !!opener.spotifyAuthCallback &&
        openerHostname === hostname &&
        window.history.length >= 2 // todo test this out
      );
    } catch {
      return false;
    }
  };

  const loadCurrentUser = async (): Promise<void> => {
    try {
      const user = await fetchCurrentUserInfo();

      setUser(user);
    } catch (err) {
      console.error(err);

      navigate('/');
    }
  };

  useEffect(() => {
    try {
      const accessToken = window.localStorage.getItem(LS_KEYS.ACCESS_TOKEN);
      const expTimestamp = parseInt(
        window.localStorage.getItem(LS_KEYS.EXP_TIMESTAMP) || '0',
        10
      );

      if (accessToken && expTimestamp && Number.isInteger(expTimestamp)) {
        setToken(accessToken);
        setTokenExp(expTimestamp);
        spotifyApi.setAccessToken(accessToken);
      } else {
        setIsLoading(false);
      }
    } catch (err) {
      console.error(err);

      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token && tokenExp) {
      if (!user) {
        void loadCurrentUser();
      } else {
        setIsLoading(false);
      }
    }
  }, [token, tokenExp, user]);

  return {
    user,
    login,
    logout,
    isLoading,
    get hasLoggedIn() {
      return hasLoggedIn();
    },
    get hasRedirectedFromValidPopup() {
      return hasRedirectedFromValidPopup();
    },
    storeTokenAtRedirect,
    spotifyApi,
    fetchCurrentUserInfo,
    fetchSearchResults,
  };
};
