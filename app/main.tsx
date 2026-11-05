import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Root from "./root";
import Home from "./routes/home";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Home },
    ],
  },
  // unstyled test page, outside Root. Loaded only when visited: it brings its
  // own SPARQL engine (Comunica), which the app doesn't need
  {
    path: "/rijksmuseum-test",
    lazy: async () => ({ Component: (await import("./routes/rijksmuseum-test")).default }),
  },
], {
  // the app can live under a path (GitHub Pages), see vite.config.js
  basename: import.meta.env.BASE_URL,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
