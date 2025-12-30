import { useEffect } from 'react';
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
    </div>
  );
}
