
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const email = params.get("email") || "";
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  async function verify(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(
        `http://localhost:8080/api/auth/verify-otp?email=${encodeURIComponent(email)}&otp=${encodeURIComponent(otp.trim())}`,
        { method: "POST" }
      );
      const text = await response.text();

      if (!response.ok) {
        setError(text || "OTP verification failed.");
        return;
      }

      setMessage(text || "Email verified successfully.");
      setTimeout(() => navigate("/login"), 1200);
    } catch {
      setError("Cannot connect to the backend.");
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    setError("");
    setMessage("");
    setSending(true);
    try {
      const response = await fetch(
        `http://localhost:8080/api/auth/send-otp?email=${encodeURIComponent(email)}`,
        { method: "POST" }
      );
      const text = await response.text();
      if (!response.ok) setError(text || "Could not resend the OTP.");
      else setMessage(text || "A new OTP has been sent.");
    } catch {
      setError("Cannot connect to the backend.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="simple-page">
      <form className="auth-card" onSubmit={verify}>
        <Link className="brand" to="/login"><span className="brand-icon">S</span> SmartStay</Link>
        <span className="kicker">EMAIL VERIFICATION</span>
        <h2>Check your inbox</h2>
        <p className="muted">Enter the OTP sent to <strong>{email || "your email address"}</strong>.</p>

        {error && <div className="error-message" role="alert">{error}</div>}
        {message && <div className="success-message" role="status">{message}</div>}

        <label htmlFor="otp">Verification code</label>
        <input id="otp" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Enter OTP" required />

        <button className="primary-button" disabled={loading || !email}>
          {loading ? "Verifying..." : "Verify Email"}
        </button>
        <button type="button" className="secondary-button" onClick={resendOtp} disabled={sending || !email}>
          {sending ? "Sending..." : "Resend OTP"}
        </button>

        <p className="center-text"><Link to="/login">Back to sign in</Link></p>
      </form>
    </main>
  );
}