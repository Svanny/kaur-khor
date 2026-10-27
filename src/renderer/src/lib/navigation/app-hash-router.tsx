import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';

const AppRouterChildren = createContext<ReactNode>(null);

function AppRouterContent() {
  return useContext(AppRouterChildren);
}

/** Keep existing route trees while letting the router block history before unmounting editors. */
export function AppHashRouter({ basename, children }: { basename?: string; children: ReactNode }) {
  const [router, setRouter] = useState<ReturnType<typeof createHashRouter> | null>(null);

  useLayoutEffect(() => {
    const nextRouter = createHashRouter([{ path: '*', element: <AppRouterContent /> }], { basename });
    setRouter(nextRouter);
    return () => nextRouter.dispose();
  }, [basename]);

  return (
    <AppRouterChildren.Provider value={children}>
      {router ? <RouterProvider router={router} /> : null}
    </AppRouterChildren.Provider>
  );
}
