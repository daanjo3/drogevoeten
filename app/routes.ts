import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("item/:id", "routes/item.tsx"),
] satisfies RouteConfig;
