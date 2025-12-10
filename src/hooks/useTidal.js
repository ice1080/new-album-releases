import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import * as auth from "@tidal-music/auth";
import { createAPIClient } from "@tidal-music/api";

let {
  REACT_APP_TIDAL_CLIENT_ID,
  REACT_APP_TIDAL_REDIRECT_URI,
  REACT_APP_TIDAL_SCOPES,
  PORT,
} = process.env;

if (!REACT_APP_TIDAL_REDIRECT_URI) {
  REACT_APP_TIDAL_REDIRECT_URI = `http://localhost:${PORT || 3000}/tidal-redirect`;
}

if (!REACT_APP_TIDAL_SCOPES) {
  REACT_APP_TIDAL_SCOPES = [
    'collection.read',
    'playlists.read',
    'recommendations.read',
    'search.read',
  ];
}

const STORAGE_KEYS = {
  ACCESS_TOKEN: "TIDAL_ACCESS_TOKEN",
  EXP_TIMESTAMP: "TIDAL_TOKEN_EXPIRE_TIMESTAMP",
  REFRESH_TOKEN: "TIDAL_REFRESH_TOKEN",
};

export const useTidal = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [tokenExp, setTokenExp] = useState(null);

  const navigate = useNavigate();

  // Create API client once and reuse it
  const tidalClient = useMemo(() => {
    return createAPIClient(auth.credentialsProvider);
  }, []);

  const initializeAuth = async () => {
    try {
        await auth.init({
          clientId: REACT_APP_TIDAL_CLIENT_ID,
          credentialsStorageKey: "authorizationCode",
          scopes: [REACT_APP_TIDAL_SCOPES],
        });
    } catch (err) {
      console.error("Failed to initialize Tidal auth:", err);
    }
  };

  const invalidateToken = useCallback(() => {
    try {
      Object.values(STORAGE_KEYS).forEach((key) => {
        localStorage.removeItem(key);
      });
      // Clear credentials from Tidal SDK if method exists
      if (auth.credentialsProvider && typeof auth.credentialsProvider.clearCredentials === 'function') {
        auth.credentialsProvider.clearCredentials();
      }
    } catch (err) {
      console.error(err);
    }

    setUser(null);
    setToken(null);
    setTokenExp(null);
  }, []);

  const hasTokenExpired = useCallback(() => {
    try {
      const accessToken =
        token || localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      const expTimestamp =
        tokenExp ||
        (localStorage.getItem(STORAGE_KEYS.EXP_TIMESTAMP)
          ? parseInt(localStorage.getItem(STORAGE_KEYS.EXP_TIMESTAMP), 10)
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

  const login = async () => {
    try {
      await initializeAuth();

      const loginUrl = await auth.initializeLogin({ redirectUri: REACT_APP_TIDAL_REDIRECT_URI });
      
      window.open(loginUrl, "_self");
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const storeTokenAtRedirect = async () => {
    try {
      await initializeAuth();
      await auth.finalizeLogin(window.location.search);

      const credentials = await auth.credentialsProvider.getCredentials();

      if (credentials?.token) {
        const accessToken = credentials.token;
        const expTimestamp = credentials.expires
          ? Math.floor(credentials.expires / 1000)
          : null;

        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
        if (expTimestamp) {
          localStorage.setItem(STORAGE_KEYS.EXP_TIMESTAMP, expTimestamp);
        }

        setToken(accessToken);
        setTokenExp(expTimestamp);
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
        if (expTimestamp) {
          localStorage.setItem(STORAGE_KEYS.EXP_TIMESTAMP, expTimestamp);
        }
      } else {
        throw new Error("No access token received from Tidal.");
      }
    } catch (err) {
      console.error(err);
      throw new Error(`Could not store token information in local storage.`);
    }
  };

  const logout = () => {
    invalidateToken();

    window.location.reload();
  };

  const hasLoggedIn = useMemo(() => !!token && !!user && !hasTokenExpired(), [token, user, hasTokenExpired]);

  const hasRedirectedFromValidPopup = useMemo(() => {
    if (window.opener === null) {
      return false;
    }

    const { hostname: openerHostname } = new URL(window.opener.location.href);
    const { hostname } = new URL(window.location.href);

    return (
      window.opener &&
      window.opener !== window &&
      !!window.opener.tidalAuthCallback &&
      openerHostname === hostname &&
      window.history.length >= 2
    );
  }, []);

  const fetchCurrentUserInfo = useCallback(async () => {
    try {
      // Fetch current user info from Tidal API using the stored client
      const user = await tidalClient.GET("/users/me");
      console.log('user', user);
      
      return user;
    } catch (err) {
      console.error("Failed to fetch current user info:", err);
      throw err;
    }
  }, [tidalClient]);

  const loadCurrentUser = useCallback(async () => {
    try {
      const user = await fetchCurrentUserInfo();

      setUser(user);
    } catch (err) {
      console.error(err);

      navigate("/");
    }
  }, [navigate, fetchCurrentUserInfo]);

  useEffect(() => {
    const loadToken = async () => {
      try {
        await initializeAuth();
        
        const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
        const expTimestamp = localStorage.getItem(STORAGE_KEYS.EXP_TIMESTAMP)
          ? parseInt(localStorage.getItem(STORAGE_KEYS.EXP_TIMESTAMP), 10)
          : null;

        if (accessToken) {
          setToken(accessToken);
          if (expTimestamp && Number.isInteger(expTimestamp)) {
            setTokenExp(expTimestamp);
          }
        } else {
          // Try to get credentials from Tidal SDK
          try {
            const credentials = await auth.credentialsProvider.getCredentials();
            console.log('credentials', credentials);
            if (credentials?.token) {
              setToken(credentials.token);
              if (credentials.expires) {
                const expTimestamp = Math.floor(credentials.expires / 1000);
                setTokenExp(expTimestamp);
                localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, credentials.token);
                localStorage.setItem(STORAGE_KEYS.EXP_TIMESTAMP, expTimestamp);
              }
            } else {
              setIsLoading(false);
            }
          } catch (err) {
            setIsLoading(false);
          }
        }
      } catch (err) {
        console.error(err);
        setIsLoading(false);
      }
    };

    loadToken();
  }, []);

  useEffect(() => {
    if (token) {
      if (!user) {
        loadCurrentUser();
      } else {
        setIsLoading(false);
      }
    } else if (!token) {
      setIsLoading(false);
    }
  }, [token, user, loadCurrentUser]);

  return {
    user,
    login,
    logout,
    isLoading,
    hasLoggedIn,
    hasRedirectedFromValidPopup,
    storeTokenAtRedirect,
    tidalClient,
  };
};
