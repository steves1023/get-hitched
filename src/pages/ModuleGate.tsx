import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAccess } from '../lib/access';
import type { Module } from '../lib/types';

/** Sends people away from tabs they have no access to. RLS is still the real guard. */
export function ModuleGate({ module, children }: { module: Module; children: ReactNode }) {
  const { levels, wedding } = useAccess();
  if (levels[module] === 'none') return <Navigate to={`/w/${wedding.id}`} replace />;
  return <>{children}</>;
}
