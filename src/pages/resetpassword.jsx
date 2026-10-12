
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const email = params.get("email") || "";

  const [otp, setOtp] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function verifyOtp(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(
        `http://localhost:8080/api/auth/verify-reset-otp?email=${encodeURIComponent(email)}&otp=${encodeURIComponent(otp.trim())}`,
        { method: "POST" }
      );
      const text = await response.text();

      if (!response.ok) {
        setError(text || "Invalid or expired OTP.");
        return;
      }

      setOtpVerified(true);
      setMessage(text || "OTP verified. You can now reset your password.");
    } catch {
      setError("Cannot connect to the backend.");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const query = new URLSearchParams({
        email,
        newPassword: password,
        confirmPassword,
      });

      const response = await fetch(
        `http://localhost:8080/api/auth/reset-password?${query.toString()}`,
        { method: "POST" }
      );
      const text = await response.text();

      if (!response.ok) {
        setError(text || "Password reset failed.");
        return;
      }

      setMessage(text || "Password reset successfully. You can sign in now.");
    } catch {
      setError("Cannot connect to the backend.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="simple-page">
      <div className="auth-card">
        <Link className="brand" to="/login"><span className="brand-icon">S</span> SmartStay</Link>
        <span className="kicker">PASSWORD RECOVERY</span>
        <h2>Reset your password</h2>
        <p className="muted">Account: <strong>{email || "Email not provided"}</strong></p>

        {error && <div className="error-message" role="alert">{error}</div>}
        {message && <div className="success-message" role="status">{message}</div>}

        {!otpVerified ? (
          <form onSubmit={verifyOtp}>
            <label htmlFor="reset-otp">Reset OTP</label>
            <input id="reset-otp" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Enter reset OTP" required />
            <button className="primary-button" disabled={loading || !email}>
              {loading ? "Verifying..." : "Verify OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={resetPassword}>
            <label htmlFor="new-password">New password</label>
            <input id="new-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required />

            <label htmlFor="confirm-password">Confirm new password</label>
            <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Enter the password again" required />

            <button className="primary-button" disabled={loading}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>

            {message && (
              <p className="center-text"><Link to="/login">Go to sign in</Link></p>
            )}
          </form>
        )}

        <p className="center-text"><Link to="/login">Back to sign in</Link></p>
      </div>
    </main>
  );
}