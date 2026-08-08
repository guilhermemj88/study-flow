export type UserRole = "admin" | "user";

export interface LocalAuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}
