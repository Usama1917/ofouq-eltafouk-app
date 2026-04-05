export function getPostLoginRoute(role: string | null | undefined) {
  if (role === "admin") return "/admin";
  if (role === "owner") return "/owner";
  return "/";
}
