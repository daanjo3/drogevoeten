import { Outlet, ScrollRestoration } from "react-router";
import "./app.css";

export default function Root() {
  return (
    <>
      <Outlet />
      <ScrollRestoration />
    </>
  );
}
