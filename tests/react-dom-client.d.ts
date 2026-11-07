// Minimal types for the web Jest project (react-dom ships without types and
// @types/react-dom isn't needed by the app itself).
declare module 'react-dom/client' {
  import type { ReactNode } from 'react';
  export type Root = { render(children: ReactNode): void; unmount(): void };
  export function createRoot(container: Element): Root;
}
