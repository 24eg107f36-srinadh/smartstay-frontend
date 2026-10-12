
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);


async function handleSubmit(e) {
  e.preventDefault();
  setError("");
  setLoading(true);

  try {
    const response = await fetch("http://localhost:8080/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
      }),
    });

    const token = (await response.text()).trim();

    if (!response.ok) {
      setError(token || "Login failed. Check your email and password.");
      return;
    }

    const parts = token.split(".");
    if (parts.length !== 3) {
      setError("The server did not return a valid login token.");
      return;
    }

    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    );

    if (!["OWNER", "TENANT"].includes(payload.role)) {
      setError("Invalid account role.");
      return;
    }

    // Verify the token and fetch the logged-in user's profile.
    const profileResponse = await fetch(
      payload.role === "OWNER"
        ? "http://localhost:8080/api/owner/profile"
        : "http://localhost:8080/api/tenant/profile",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!profileResponse.ok) {
      setError(
        payload.role === "TENANT" && profileResponse.status === 404
          ? "Tenant profile API is not created yet. Please tell me so we can add it."
          : "Login succeeded, but the profile could not be loaded. Please check the backend."
      );
      return;
    }

    const profile = await profileResponse.json();

    localStorage.setItem("smartstay_token", token);
    localStorage.setItem("smartstay_role", profile.role);
    localStorage.setItem("smartstay_email", profile.email);
    localStorage.setItem("smartstay_profile", JSON.stringify(profile));

    navigate(profile.role === "OWNER" ? "/owner" : "/tenant");
  } catch (err) {
    console.error("Login error:", err);
    setError(
      "Cannot connect to the backend or load your profile. Check that the backend is running."
    );
  } finally {
    setLoading(false);
  }
}


  return (
    <main className="auth-layout">
      <section className="brand-panel">
        <Link className="brand" to="/login">
          <span className="brand-icon">S</span> SmartStay
        </Link>
        <div className="brand-message">
          <span className="kicker">A BETTER WAY TO STAY</span>
          <h1>Your stay.<br />Made smarter.</h1>
          <p>Find your place, simplify your stay, and manage hostel life in one convenient platform.</p>
          <ul>
            <li>✓ Find a place that fits your needs</li>
            <li>✓ Simple tools for tenants and owners</li>
            <li>✓ One convenient platform</li>
          </ul>
        </div>
        <p className="brand-footer">A smarter place to call home.</p>
      </section>

      <section className="auth-side">
        <form className="auth-card" onSubmit={handleSubmit}>
          <Link className="brand mobile-brand" to="/login">
            <span className="brand-icon">S</span> SmartStay
          </Link>

          <span className="kicker">WELCOME BACK</span>
          <h2>Sign in to your account</h2>
          <p className="muted">Enter your details to continue to SmartStay.</p>

          {error && <div className="error-message" role="alert">{error}</div>}

          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <div className="label-row">
            <label htmlFor="password">Password</label>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
          <div className="password-wrap">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="button" className="text-button" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <button className="primary-button" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"} {!loading && <span>→</span>}
          </button>

          <p className="center-text">Don't have an account? <Link to="/register">Create an account</Link></p>
        </form>
      </section>
    </main>
  );
}