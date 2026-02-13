import { useCallback, useEffect } from 'react';
import logo from './tidalLogo.svg';
import './App.css';
import { useNavigate } from 'react-router-dom';
import { useTidal } from './hooks/useTidal';

export default function App() {
  const { hasLoggedIn, login } = useTidal();
  const navigate = useNavigate();

  useEffect(() => {
    if (hasLoggedIn) {
      navigate('/home');
    }
  }, [hasLoggedIn, navigate]);

  const deleteTidalLocalStorage = useCallback(() => {
    // Iterate through localStorage keys and remove the ones not starting with "tidal_"
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !key.startsWith('tidal_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }, []);

  const deleteAllLocalStorage = useCallback(() => {
    localStorage.clear();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        Album Releases
      </header>
      <button autoFocus onClick={login}>
        Login
      </button>
      <div>hasLoggedIn: {'' + hasLoggedIn}</div>
      <button onClick={deleteTidalLocalStorage}>
        Reset Tidal LocalStorage
      </button>
      <button onClick={deleteAllLocalStorage}>Reset All LocalStorage</button>
    </div>
  );
}
