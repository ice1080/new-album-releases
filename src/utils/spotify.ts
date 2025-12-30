export const generateState = (length: number): string => {
  let text = "";

  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
};

interface QueryParams {
  [key: string]: string | string[] | number | undefined | null;
}

export const buildSpotifyQueryString = (queryParams: QueryParams): string => {
  return Object.keys(queryParams)
    .filter((key) => {
      const value = queryParams[key];

      return typeof value !== "undefined" && value !== null;
    })
    .map((key) => {
      const value = queryParams[key];

      if (Array.isArray(value)) {
        return value
          .map((valueItem) => `${key}=${encodeURIComponent(valueItem)}`)
          .join("&");
      }

      return `${key}=${encodeURIComponent(String(value))}`;
    })
    .join("&");
};

