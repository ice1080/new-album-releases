import React, { useEffect } from "react";
import { useTidal } from "../hooks/useTidal";
import { useNavigate } from "react-router-dom";

const TidalRedirect = () => {
  const { hasLoggedIn, storeTokenAtRedirect } = useTidal();
  const navigate = useNavigate();

  useEffect(() => {
    storeTokenAtRedirect();
  }, [storeTokenAtRedirect]);

  useEffect(() => {
    if (hasLoggedIn) {
      navigate("/home");
    }
  }, [hasLoggedIn, navigate]);

  return <h1>Redirecting...</h1>;
};

export default TidalRedirect;
