import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { PrivateRoute, AdminRoute } from "./components/PrivateRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Meetings from "./pages/Meetings";
import MeetingForm from "./pages/MeetingForm";
import MeetingDetail from "./pages/MeetingDetail";
import AdminUsers from "./pages/AdminUsers";
import EventRegister from "./pages/EventRegister";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Públicas */}
          <Route path="/login" element={<Login />} />
          <Route path="/register/:token" element={<Register />} />
          <Route path="/event/:token" element={<EventRegister />} />

          {/* Privadas */}
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/meetings"
            element={
              <PrivateRoute>
                <Meetings />
              </PrivateRoute>
            }
          />
          <Route
            path="/meetings/new"
            element={
              <PrivateRoute>
                <MeetingForm />
              </PrivateRoute>
            }
          />
          <Route
            path="/meetings/:id"
            element={
              <PrivateRoute>
                <MeetingDetail />
              </PrivateRoute>
            }
          />
          <Route
            path="/meetings/:id/edit"
            element={
              <PrivateRoute>
                <MeetingForm />
              </PrivateRoute>
            }
          />

          {/* Admin */}
          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <AdminUsers />
              </AdminRoute>
            }
          />

          {/* Redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
