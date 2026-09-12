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
const BloquesPage         = lazy(() => import('./pages/BloquesPage'));
const ZonasPage           = lazy(() => import('./pages/ZonasPage'));
const UsersPage           = lazy(() => import('./pages/UsersPage'));
const ConfiguracionPage   = lazy(() => import('./pages/ConfiguracionPage'));
const NotFoundPage        = lazy(() => import('./pages/NotFoundPage'));
const PrivacidadPage      = lazy(() => import('./pages/PrivacidadPage'));


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
                {/* "Mi perfil" se fusionó dentro de Configuración -- se deja un
                    redirect para no romper enlaces/marcadores viejos a /perfil. */}
                <Route path="/perfil"              element={<Navigate to="/configuracion" replace />} />
                <Route path="/privacidad"          element={<PrivacidadPage />} />

                <Route path="/upload" element={
                  <RoleRoute roles={['super_admin', 'admin', 'tecnico']}><UploadPage /></RoleRoute>
                } />
                {/* Puntos de monitoreo (antes "Bloques"/"Ubicaciones", fusionados en
                    una sola entidad): super_admin/admin/tecnico pueden entrar y CREAR
                    puntos (el backend abre POST /bloques a los 3); editar/desactivar/
                    eliminar sigue exclusivo de admin/super_admin -- BloquesPage oculta
                    esas acciones para tecnico. cliente no entra. */}
                <Route path="/puntos" element={
                  <RoleRoute roles={['super_admin', 'admin', 'tecnico']}><BloquesPage /></RoleRoute>
                } />
                {/* Zonas (= empresas/afiliaciones): el "cuadrado grande" con
                    jurisdicción total, departamento/ciudad/material y el área
                    dibujada en el mapa. Ventana de creación separada de Puntos,
                    exclusiva de super_admin (mismo backend que ya exigía
                    GET/POST/PUT /empresas solo para ese rol). */}
                <Route path="/zonas" element={
                  <RoleRoute roles={['super_admin']}><ZonasPage /></RoleRoute>
                } />
                {/* tecnico entra para dar de alta un cliente (ver CREATABLE_ROLES) aunque
                    no vea el listado -- eso ya lo devuelve 403 el backend en GET /usuarios */}
                <Route path="/usuarios" element={
                  <RoleRoute roles={['super_admin', 'admin', 'tecnico']}><UsersPage /></RoleRoute>
                } />
                {/* Configuracion de la cuenta propia -- los 4 roles la tienen */}
                <Route path="/configuracion" element={
                  <RoleRoute roles={['super_admin', 'admin', 'tecnico', 'cliente']}><ConfiguracionPage /></RoleRoute>
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
