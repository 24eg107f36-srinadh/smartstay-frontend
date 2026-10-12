
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(
        `http://localhost:8080/api/auth/forgot-password?email=${encodeURIComponent(email.trim().toLowerCase())}`,
        { method: "POST" }
      );
      const text = await response.text();

      if (!response.ok) {
        setError(text || "Unable to send a password reset OTP.");
        return;
      }

      navigate(`/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch {
      setError("Cannot connect to the backend on port 8080.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="simple-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <Link className="brand" to="/login"><span className="brand-icon">S</span> SmartStay</Link>
        <span className="kicker">ACCOUNT RECOVERY</span>
        <h2>Forgot your password?</h2>
        <p className="muted">Enter your registered email address to request a reset OTP.</p>

        {error && <div className="error-message" role="alert">{error}</div>}

        <label htmlFor="email">Email address</label>
        <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />

        <button className="primary-button" disabled={loading}>
          {loading ? "Requesting..." : "Send Reset OTP"}
        </button>
        <p className="center-text"><Link to="/login">Back to sign in</Link></p>
      </form>
    </main>
  );
}