import React, { useState } from 'react';
import './LoginPage.css';
import cityGif from '../aceeef81779309.5d09ccd58bf16.gif';

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Enter your username and password to continue.');
      return;
    }

    setError('');
    onLogin?.({ email: email.trim() });
  };

  return (
    <main className="login-page">
      <section className="login-shell">
        <div className="login-visual" aria-hidden="true">
          <img src={cityGif} alt="" className="login-gif" />
          <div className="login-visual-overlay">
            <span className="login-kicker">Smart City WebGIS</span>
            <h1>Navigate the city through live spatial intelligence.</h1>
            <p>Secure access for maps, analysis tools, routing, LULC, attributes, and 3D Data.</p>
          </div>
        </div>

        <form className="login-card" onSubmit={handleSubmit}>
          <div>
            <span className="login-badge">WEBGIS Portal</span>
            <h2>Welcome back</h2>
            <p className="login-copy">Sign in to continue to the Smart City dashboard.</p>
          </div>

          <label className="login-field">
            <span>Username or email</span>
            <input
              type="text"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError('');
              }}
              placeholder="admin@pcmc.gov.in"
              autoComplete="username"
            />
          </label>

          <label className="login-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError('');
              }}
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button className="login-submit" type="submit">
            Enter GIS Dashboard
          </button>

          <p className="login-note">Demo login accepts any non-empty username and password.</p>
        </form>
      </section>
    </main>
  );
}
