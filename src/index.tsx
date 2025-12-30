import React, { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createBrowserRouter, Outlet } from 'react-router-dom';
import App from './App';
import reportWebVitals from './reportWebVitals';
import TidalRedirect from './components/TidalRedirect';
import Home from './components/Home';
import './index.css';

const router = createBrowserRouter([
  {
    element: <Outlet />,
    children: [
      {
        path: '/',
        element: <App />,
      },
      {
        path: '/tidal-redirect',
        element: <TidalRedirect />,
      },
      {
        path: '/home',
        element: <Home />,
      },
    ],
  },
]);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
