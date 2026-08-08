import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function RoleRoute({ roles, children }) {
  const { user } = useAuth();
  const groups = user?.groups ?? [];
  if (!roles.some(r => groups.includes(r))) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
