import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RefreshKeyProvider } from './hooks/RefreshKeyContext';
import ProtectedRoute from './auth/ProtectedRoute';
import RoleRoute from './auth/RoleRoute';
import AppLayout from './layouts/AppLayout';

// Páginas
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import GaleriaPage from './pages/GaleriaPage';
import MedicionDetailPage from './pages/MedicionDetailPage';
import PlaceholderPage from './pages/PlaceholderPage';
import ReportsPage from './pages/ReportsPage';
import PlantsPage from './pages/PlantsPage';
import UsersPage from './pages/UsersPage';
import ProfilePage from './pages/ProfilePage';


export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RefreshKeyProvider>
          <Routes>
            {/* Ruta pública */}
            <Route path="/login" element={<LoginPage />} />

            {/* Rutas autenticadas dentro del layout con sidebar */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard"          element={<DashboardPage />} />
              <Route path="/galeria"            element={<GaleriaPage />} />
              <Route path="/galeria/:idMedicion" element={<MedicionDetailPage />} />
              <Route path="/reportes"           element={<ReportsPage />} />
              <Route path="/perfil"             element={<ProfilePage />} />

              <Route path="/upload" element={
                <RoleRoute roles={['admin', 'tecnico']}><UploadPage /></RoleRoute>
              } />
              <Route path="/plantas" element={
                <RoleRoute roles={['admin', 'tecnico']}><PlantsPage /></RoleRoute>
              } />
              <Route path="/usuarios" element={
                <RoleRoute roles={['admin']}><UsersPage /></RoleRoute>
              } />
              <Route path="/configuracion" element={
                <RoleRoute roles={['admin']}><PlaceholderPage titulo="Configuración" /></RoleRoute>
              } />
            </Route>

            {/* / y cualquier ruta desconocida redirigen al dashboard */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </RefreshKeyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
