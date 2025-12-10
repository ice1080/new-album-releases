import React, { useEffect } from "react";
import { useTidal } from "../hooks/useTidal";

const TidalRedirect = () => {
  const { storeTokenAtRedirect } = useTidal();

  useEffect(() => {
    storeTokenAtRedirect();
  }, []);

  return <h1>Redirecting...</h1>;
};

export default TidalRedirect;
