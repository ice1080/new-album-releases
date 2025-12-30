import React, { useEffect, useRef } from "react";
import { useTidal } from "../hooks/useTidal";
import { useNavigate } from "react-router-dom";

const TidalRedirect = () => {
  const { hasLoggedIn, storeTokenAtRedirect } = useTidal();
  const navigate = useNavigate();
  const hasCalledStore = useRef(false);

  useEffect(() => {
    if (!hasCalledStore.current) {
      hasCalledStore.current = true;
      void storeTokenAtRedirect();
    }
  }, [storeTokenAtRedirect]);

  useEffect(() => {
    if (hasLoggedIn) {
      navigate("/home");
    }
  }, [hasLoggedIn, navigate]);

  return <h1>Redirecting...</h1>;
};

export default TidalRedirect;

