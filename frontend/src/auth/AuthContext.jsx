import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  signIn,
  signOut,
  confirmSignIn,
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth';

const AuthContext = createContext(null);

// Readable Spanish messages for Cognito/Amplify error names. The raw English
// `err.message` is never shown: unknown errors get a generic Spanish message.
//   modo:     'email' | 'username' -- the login mode, so the text says "correo"
//             or "usuario" instead of always "email".
//   contexto: 'login' (default) | 'nueva' (new-password challenge) |
//             'cambio' (change password while signed in)
export function parseAuthError(err, { modo = 'email', contexto = 'login' } = {}) {
  const code = err?.name || err?.code || '';
  const identificador = modo === 'username' ? 'usuario' : 'correo';
  switch (code) {
    case 'NotAuthorizedException':
      if (contexto === 'cambio') return 'La contraseña actual no es correcta.';
      if (contexto === 'nueva') return 'La sesión venció. Vuelve a ingresar con tu contraseña temporal.';
      return `Credenciales inválidas. Verifica tu ${identificador} y contraseña.`;
    case 'UserNotFoundException':
      return `Credenciales inválidas. Verifica tu ${identificador} y contraseña.`;
    case 'UserNotConfirmedException':
      return 'Cuenta pendiente de confirmación. Contacta al administrador.';
    case 'PasswordResetRequiredException':
      return 'Se requiere restablecer la contraseña. Contacta al administrador.';
    case 'UserDisabledException':
      return 'Cuenta desactivada. Contacta al administrador.';
    case 'TooManyRequestsException':
    case 'LimitExceededException':
    case 'TooManyFailedAttemptsException':
      return 'Demasiados intentos. Intenta de nuevo en unos minutos.';
    case 'InvalidParameterException':
      if (contexto === 'login') return `Credenciales inválidas. Verifica tu ${identificador} y contraseña.`;
      // falls through
    case 'InvalidPasswordException':
      return 'La contraseña no cumple los requisitos: mínimo 8 caracteres, una mayúscula, una minúscula y un número.';
    case 'NetworkError':
      return 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.';
    case 'PasoAdicionalRequerido':
      return 'Se requiere un paso adicional. Contacta al administrador.';
    default:
      return 'No se pudo completar la acción. Intenta de nuevo.';
  }
}

// Extrae sub, email, nombre y grupos del idToken de Cognito
function buildUserFromSession(session) {
  const payload = session.tokens?.idToken?.payload || {};
  const sub = payload.sub || '';
  const groups = payload['cognito:groups'] || [];
  const email = payload.email || '';
  const name = payload.name || payload.given_name || email.split('@')[0];
  return { sub, email, name, groups };
}

// Determina la ruta inicial tras autenticarse o entrar a "/":
// la primera vez que esta cuenta ingresa en el navegador (o tras completar
// el cambio de contraseña inicial) va a /que-es-pixelrust; en ingresos
// posteriores va directo a /dashboard.
export function obtenerRutaInicial(user, forzarBienvenida = false, marcarVista = true) {
  const id = user?.sub || user?.email || user?.name;
  if (!id) return '/dashboard';
  const key = `pixelrust:welcomed:${id}`;
  try {
    const yaVio = localStorage.getItem(key) === '1';
    if (forzarBienvenida || !yaVio) {
      if (marcarVista) localStorage.setItem(key, '1');
      return '/que-es-pixelrust';
    }
  } catch {
    if (forzarBienvenida) return '/que-es-pixelrust';
  }
  return '/dashboard';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Verificar sesión existente al montar
  useEffect(() => {
    (async () => {
      try {
        await getCurrentUser(); // lanza si no hay sesión activa
        const session = await fetchAuthSession();
        setUser(buildUserFromSession(session));
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Escuchar el evento de 401 emitido por apiClient
  useEffect(() => {
    const handler = () => {
      setUser(null);
    };
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, []);

  // `modo` ('email' | 'username') only shapes the error wording.
  const login = useCallback(async (email, password, modo = 'email') => {
    try {
      const result = await signIn({ username: email, password });

      // Cognito requiere que el usuario establezca su contraseña en el primer ingreso
      if (result.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        return { needsNewPassword: true };
      }

      // Otros challenges no soportados (MFA, etc.)
      if (result.nextStep?.signInStep !== 'DONE' && result.nextStep?.signInStep !== undefined) {
        throw Object.assign(new Error('additional step required'), { name: 'PasoAdicionalRequerido' });
      }

      const session = await fetchAuthSession();
      const userData = buildUserFromSession(session);
      setUser(userData);
      return userData;
    } catch (err) {
      throw new Error(parseAuthError(err, { modo }));
    }
  }, []);

  // Completa el challenge NEW_PASSWORD_REQUIRED con la nueva contraseña elegida por el usuario
  const confirmNewPassword = useCallback(async (nuevaContraseña) => {
    try {
      await confirmSignIn({ challengeResponse: nuevaContraseña });
      const session = await fetchAuthSession();
      const userData = buildUserFromSession(session);
      setUser(userData);
      return userData;
    } catch (err) {
      throw new Error(parseAuthError(err, { contexto: 'nueva' }));
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut();
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
      confirmNewPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
