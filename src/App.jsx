
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/login";
import Register from "./pages/register";
import VerifyEmail from "./pages/verifyemail";
import ForgotPassword from "./pages/forgotpassword";
import ResetPassword from "./pages/resetpassword";
import TenantDashboard from "./pages/tenantdashboard";
import OwnerDashboard from "./pages/ownerdashboard";

function ProtectedRoute({ role, children }) {
  const token = localStorage.getItem("smartstay_token");
  const savedRole = localStorage.getItem("smartstay_role");

  if (!token) return <Navigate to="/login" replace />;
  if (savedRole !== role) {
    return <Navigate to={savedRole === "OWNER" ? "/owner" : "/tenant"} replace />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          path="/tenant"
          element={
            <ProtectedRoute role="TENANT">
              <TenantDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/owner"
          element={
            <ProtectedRoute role="OWNER">
              <OwnerDashboard />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}