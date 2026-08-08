import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  signIn,
  signOut,
  confirmSignIn,
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth';

const AuthContext = createContext(null);

// Mensajes de error legibles para los códigos de Cognito
function parseAuthError(err) {
  const code = err?.name || err?.code || '';
  if (code === 'NotAuthorizedException') return 'Credenciales inválidas. Verifica tu email y contraseña.';
  if (code === 'UserNotFoundException') return 'Credenciales inválidas. Verifica tu email y contraseña.';
  if (code === 'UserNotConfirmedException') return 'Cuenta pendiente de confirmación. Contacta al administrador.';
  if (code === 'PasswordResetRequiredException') return 'Se requiere restablecer la contraseña. Contacta al administrador.';
  if (code === 'UserDisabledException') return 'Cuenta deshabilitada. Contacta al administrador.';
  if (code === 'TooManyRequestsException') return 'Demasiados intentos. Intenta de nuevo en unos minutos.';
  return err?.message || 'Error de autenticación. Intenta de nuevo.';
}

// Extrae email, nombre y grupos del idToken de Cognito
function buildUserFromSession(session) {
  const payload = session.tokens?.idToken?.payload || {};
  const groups = payload['cognito:groups'] || [];
  const email = payload.email || '';
  const name = payload.name || payload.given_name || email.split('@')[0];
  return { email, name, groups };
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

  const login = useCallback(async (email, password) => {
    try {
      const result = await signIn({ username: email, password });

      // Cognito requiere que el usuario establezca su contraseña en el primer ingreso
      if (result.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        return { needsNewPassword: true };
      }

      // Otros challenges no soportados (MFA, etc.)
      if (result.nextStep?.signInStep !== 'DONE' && result.nextStep?.signInStep !== undefined) {
        throw new Error('Se requiere un paso adicional. Contacta al administrador.');
      }

      const session = await fetchAuthSession();
      const userData = buildUserFromSession(session);
      setUser(userData);
      return userData;
    } catch (err) {
      throw new Error(parseAuthError(err));
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
      throw new Error(parseAuthError(err));
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
