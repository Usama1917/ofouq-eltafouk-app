export type AcademicRouteBase = "/(tabs)/academic" | "/(tabs)/videos";

export function getAcademicRouteBase(pathname: string): AcademicRouteBase {
  return pathname === "/videos" || pathname.startsWith("/videos/") ? "/(tabs)/videos" : "/(tabs)/academic";
}

export function academicRoute(base: AcademicRouteBase, screen: string) {
  return `${base}/${screen}`;
}
