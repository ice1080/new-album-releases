import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as auth from '@tidal-music/auth';
import { createAPIClient } from '@tidal-music/api';

interface TidalUser {
  id: string;
  [key: string]: unknown;
}

interface TidalCredentials {
  token: string;
  expires?: number;
}

interface TidalAPIClient {
  GET: (path: string) => Promise<unknown>;
  [key: string]: unknown;
}

interface UseTidalReturn {
  user: TidalUser | null;
  login: () => Promise<void>;
  isLoading: boolean;
  hasLoggedIn: boolean;
  storeTokenAtRedirect: () => Promise<void>;
  tidalClient: TidalAPIClient | null;
}

let {
  REACT_APP_TIDAL_CLIENT_ID,
  REACT_APP_TIDAL_REDIRECT_URI,
  REACT_APP_TIDAL_SCOPES: envScopes,
  PORT,
} = process.env;

if (!REACT_APP_TIDAL_REDIRECT_URI) {
  REACT_APP_TIDAL_REDIRECT_URI = `http://localhost:${PORT || 3000}/tidal-redirect`;
}

const REACT_APP_TIDAL_SCOPES: string[] = envScopes
  ? Array.isArray(envScopes)
    ? envScopes
    : [envScopes]
  : [
      'collection.read',
      'playlists.read',
      'recommendations.read',
      'search.read',
    ];

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'TIDAL_ACCESS_TOKEN',
  EXP_TIMESTAMP: 'TIDAL_TOKEN_EXPIRE_TIMESTAMP',
  REFRESH_TOKEN: 'TIDAL_REFRESH_TOKEN',
};

let initDone = false;

export const useTidal = (): UseTidalReturn => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [user, setUser] = useState<TidalUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenExp, setTokenExp] = useState<number | null>(null);
  const [finalizeDone, setFinalizeDone] = useState<boolean>(false);

  const navigate = useNavigate();

  // Create API client once and reuse it
  const tidalClient = useMemo<TidalAPIClient | null>(() => {
    try {
      return createAPIClient(
        auth.credentialsProvider
      ) as unknown as TidalAPIClient;
    } catch (err) {
      console.error('Failed to create Tidal API client:', err);
      return null;
    }
  }, []);

  const initializeAuth = useCallback(async () => {
    try {
      if (!initDone) {
        initDone = true;
        await auth.init({
          clientId: REACT_APP_TIDAL_CLIENT_ID || '',
          credentialsStorageKey: 'authorizationCode',
          scopes: REACT_APP_TIDAL_SCOPES,
        });
      }
    } catch (err) {
      console.error('Failed to initialize Tidal auth:', err);
    }
  }, []);

  const hasTokenExpired = useCallback((): boolean => {
    try {
      const accessToken =
        token || localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      const expTimestamp =
        tokenExp ||
        (localStorage.getItem(STORAGE_KEYS.EXP_TIMESTAMP)
          ? parseInt(
              localStorage.getItem(STORAGE_KEYS.EXP_TIMESTAMP) || '0',
              10
            )
          : null);

      if (!accessToken) {
        return false;
      }

      // If no expiration timestamp, assume token is valid (Tidal SDK handles refresh)
      if (!expTimestamp || isNaN(expTimestamp)) {
        return false;
      }

      return Date.now() / 1000 > expTimestamp;
    } catch (err) {
      console.error(err);

      return true;
    }
  }, [token, tokenExp]);

  const login = async (): Promise<void> => {
    try {
      await initializeAuth();

      const loginUrl = await auth.initializeLogin({
        redirectUri: REACT_APP_TIDAL_REDIRECT_URI || '',
      });

      window.open(loginUrl, '_self');
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  const storeTokenAtRedirect = useCallback(async (): Promise<void> => {
    if (finalizeDone) return;
    try {
      await initializeAuth();
      setFinalizeDone(true);
      await auth.finalizeLogin(window.location.search);

      const credentials =
        (await auth.credentialsProvider.getCredentials()) as TidalCredentials | null;

      if (credentials?.token) {
        const accessToken = credentials.token;
        const expTimestamp = credentials.expires
          ? Math.floor(credentials.expires / 1000)
          : null;

        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
        if (expTimestamp) {
          localStorage.setItem(
            STORAGE_KEYS.EXP_TIMESTAMP,
            String(expTimestamp)
          );
        }

        setToken(accessToken);
        setTokenExp(expTimestamp);
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
        if (expTimestamp) {
          localStorage.setItem(
            STORAGE_KEYS.EXP_TIMESTAMP,
            String(expTimestamp)
          );
        }
      } else {
        throw new Error('No access token received from Tidal.');
      }
    } catch (err) {
      console.error(err);
      throw new Error(`Could not store token information in local storage.`);
    }
  }, [finalizeDone, initializeAuth]);

  const fetchCurrentUserInfo = useCallback(async () => {
    try {
      if (!tidalClient) {
        throw new Error('Tidal client not initialized');
      }
      return await tidalClient.GET('/users/me');
    } catch (err) {
      console.error('Failed to fetch current user info:', err);
      throw err;
    }
  }, [tidalClient]);

  const loadCurrentUser = useCallback(async () => {
    try {
      const response = await fetchCurrentUserInfo();
      const userData = response as { data?: { data?: TidalUser } };
      if (userData.data?.data) {
        setUser(userData.data.data);
      }
    } catch (err) {
      console.error(err);

      navigate('/');
    }
  }, [navigate, fetchCurrentUserInfo]);

  // Initialize token from localStorage on mount
  useEffect(() => {
    try {
      const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      const expTimestamp = localStorage.getItem(STORAGE_KEYS.EXP_TIMESTAMP)
        ? parseInt(localStorage.getItem(STORAGE_KEYS.EXP_TIMESTAMP) || '0', 10)
        : null;

      if (accessToken && !token) {
        console.log('initializing token from localStorage');
        setToken(accessToken);
        setTokenExp(expTimestamp);
        console.log('token initialized from localStorage via setToken');
      } else if (!accessToken && token) {
        console.warn(
          'WARNING: localStorage has no token but state has token. Token may have been cleared externally.'
        );
      }
    } catch (err) {
      console.error('Failed to initialize token from localStorage:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  useEffect(() => {
    if (token) {
      if (!user) {
        void loadCurrentUser();
      } else {
        setIsLoading(false);
      }
    } else if (!token) {
      setIsLoading(false);
    }
  }, [token, user, loadCurrentUser]);

  const hasLoggedIn = useMemo(
    () => !!token && !!user && !hasTokenExpired(),
    [token, user, hasTokenExpired]
  );

  // todo create a wrapper around tidalClient that has all the methods you want

  return {
    user,
    login,
    isLoading,
    hasLoggedIn,
    storeTokenAtRedirect,
    tidalClient,
  };
};
