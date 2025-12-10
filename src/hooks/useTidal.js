import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import * as auth from "@tidal-music/auth";

let {
  REACT_APP_TIDAL_CLIENT_ID,
  REACT_APP_TIDAL_CLIENT_SECRET,
  REACT_APP_TIDAL_REDIRECT_URI,
  REACT_APP_TIDAL_SCOPES,
  PORT,
} = process.env;

if (!REACT_APP_TIDAL_REDIRECT_URI) {
  REACT_APP_TIDAL_REDIRECT_URI = `http://localhost:${PORT || 3000}/tidal-redirect`;
}

if (!REACT_APP_TIDAL_SCOPES) {
  REACT_APP_TIDAL_SCOPES = ["r_usr"];
}

const BASE_API_URL = "https://api.tidal.com/v2";

const STORAGE_KEYS = {
  ACCESS_TOKEN: "TIDAL_ACCESS_TOKEN",
  EXP_TIMESTAMP: "TIDAL_TOKEN_EXPIRE_TIMESTAMP",
  REFRESH_TOKEN: "TIDAL_REFRESH_TOKEN",
  INITIALIZED: "TIDAL_INITIALIZED",
};

export const useTidal = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [tokenExp, setTokenExp] = useState(null);

  const navigate = useNavigate();

  const initializeAuth = async () => {
    try {
      const isInitialized = window.localStorage.getItem(STORAGE_KEYS.INITIALIZED);
      
      if (!isInitialized && REACT_APP_TIDAL_CLIENT_ID) {
        await auth.init({
          clientId: REACT_APP_TIDAL_CLIENT_ID,
          clientSecret: REACT_APP_TIDAL_CLIENT_SECRET,
          credentialsStorageKey: "tidal_credentials",
          scopes: [REACT_APP_TIDAL_SCOPES],
        });
        window.localStorage.setItem(STORAGE_KEYS.INITIALIZED, "true");
      }
    } catch (err) {
      console.error("Failed to initialize Tidal auth:", err);
    }
  };

  const invalidateToken = useCallback(() => {
    try {
      Object.values(STORAGE_KEYS).forEach((key) => {
        window.localStorage.removeItem(key);
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
        token || window.localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      const expTimestamp =
        tokenExp ||
        (window.localStorage.getItem(STORAGE_KEYS.EXP_TIMESTAMP)
          ? parseInt(window.localStorage.getItem(STORAGE_KEYS.EXP_TIMESTAMP), 10)
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

  const refreshTokenIfNeeded = useCallback(async () => {
    try {
      const credentials = await auth.credentialsProvider.getCredentials();
      if (credentials?.token) {
        setToken(credentials.token);
        // Tidal SDK handles token refresh automatically, but we store expiration if available
        if (credentials.expiresAt) {
          const expTimestamp = Math.floor(credentials.expiresAt / 1000);
          setTokenExp(expTimestamp);
          window.localStorage.setItem(STORAGE_KEYS.EXP_TIMESTAMP, expTimestamp);
        }
      }
    } catch (err) {
      console.error("Failed to refresh token:", err);
      invalidateToken();
    }
  }, [invalidateToken]);

  const login = async () => {
    try {
      await initializeAuth();
      
      const loginUrl = await auth.initializeLogin({ redirectUri: REACT_APP_TIDAL_REDIRECT_URI });
      
      const popup = window.open(
        loginUrl,
        "Login with Tidal",
        "width=600,height=800"
      );

      window.tidalAuthCallback = async (accessToken, expTimestamp) => {
        popup.close();

        setToken(accessToken);
        setTokenExp(expTimestamp);
        window.localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
        if (expTimestamp) {
          window.localStorage.setItem(STORAGE_KEYS.EXP_TIMESTAMP, expTimestamp);
        }
      };
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const storeTokenAtRedirect = async () => {
    try {
      await initializeAuth();
      await auth.finalizeLogin();

      const credentials = await auth.credentialsProvider.getCredentials();
      
      if (credentials?.token) {
        const accessToken = credentials.token;
        const expTimestamp = credentials.expiresAt
          ? Math.floor(credentials.expiresAt / 1000)
          : null;

        window.localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
        if (expTimestamp) {
          window.localStorage.setItem(STORAGE_KEYS.EXP_TIMESTAMP, expTimestamp);
        }

        if (window.opener && window.opener.tidalAuthCallback) {
          window.opener.tidalAuthCallback(accessToken, expTimestamp);
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

  const hasLoggedIn = useMemo(() => {
    return !!token && !!user && !hasTokenExpired();
  }, [token, user, hasTokenExpired]);

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

  const loadCurrentUser = useCallback(async () => {
    try {
      const user = await fetchCurrentUserInfo();
      console.log(user);

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
        
        const accessToken = window.localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
        const expTimestamp = window.localStorage.getItem(STORAGE_KEYS.EXP_TIMESTAMP)
          ? parseInt(window.localStorage.getItem(STORAGE_KEYS.EXP_TIMESTAMP), 10)
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
            if (credentials?.token) {
              setToken(credentials.token);
              if (credentials.expiresAt) {
                const expTimestamp = Math.floor(credentials.expiresAt / 1000);
                setTokenExp(expTimestamp);
                window.localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, credentials.token);
                window.localStorage.setItem(STORAGE_KEYS.EXP_TIMESTAMP, expTimestamp);
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
  };
};
