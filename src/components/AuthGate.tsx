import type { ReactNode } from 'react';

export function AuthGate(props: { children: ReactNode }) {
  return <>{props.children}</>;
}
