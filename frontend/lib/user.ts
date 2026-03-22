const USER_ID_KEY = "lighttable_user_id";
const DEFAULT_USER_ID = "default";

/**
 * LightTable 当前按单用户 demo 交付。
 * 为避免历史随机 user_id 导致后端 profile 404，这里强制收敛到默认用户。
 */
export function getUserId(): string {
  if (typeof window === "undefined") return DEFAULT_USER_ID;

  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing !== DEFAULT_USER_ID) {
    localStorage.setItem(USER_ID_KEY, DEFAULT_USER_ID);
  }
  return DEFAULT_USER_ID;
}
