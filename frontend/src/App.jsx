import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RefreshKeyProvider } from './hooks/RefreshKeyContext';
import ProtectedRoute from './auth/ProtectedRoute';
import RoleRoute from './auth/RoleRoute';
import AppLayout from './layouts/AppLayout';
import RouteFallback from './components/RouteFallback';

// LoginPage se importa de forma normal: es la primera pantalla que ve alguien
// sin sesion, asi que diferirla solo agrega un salto antes del formulario.
import LoginPage from './pages/LoginPage';

// El resto va por React.lazy. Cada pagina se descarga cuando se visita, en vez
// de mandar el mapa, los graficos y el lector de EXIF a quien solo entra a ver
// su perfil.
const DashboardPage       = lazy(() => import('./pages/DashboardPage'));
const UploadPage          = lazy(() => import('./pages/UploadPage'));
const GaleriaPage         = lazy(() => import('./pages/GaleriaPage'));
const MedicionDetailPage  = lazy(() => import('./pages/MedicionDetailPage'));
const PlantsPage          = lazy(() => import('./pages/PlantsPage'));
const UsersPage           = lazy(() => import('./pages/UsersPage'));
const ProfilePage         = lazy(() => import('./pages/ProfilePage'));
const ConfiguracionPage   = lazy(() => import('./pages/ConfiguracionPage'));
const NotFoundPage        = lazy(() => import('./pages/NotFoundPage'));


export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RefreshKeyProvider>
          <Suspense fallback={<RouteFallback />}>
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
                <Route path="/dashboard"           element={<DashboardPage />} />
                <Route path="/galeria"             element={<GaleriaPage />} />
                <Route path="/galeria/:idMedicion" element={<MedicionDetailPage />} />
                <Route path="/perfil"              element={<ProfilePage />} />

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
                  <RoleRoute roles={['admin']}><ConfiguracionPage /></RoleRoute>
                } />

                {/* Una ruta desconocida muestra un 404 dentro del layout, con
                    el sidebar disponible. Antes redirigia al dashboard en
                    silencio y el enlace roto pasaba desapercibido. Sin sesion,
                    ProtectedRoute manda a /login antes de llegar aca. */}
                <Route path="*" element={<NotFoundPage />} />
              </Route>

              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </RefreshKeyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
