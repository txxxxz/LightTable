const USER_ID_KEY = "lighttable_user_id";

export function getUserId(): string {
  if (typeof window === "undefined") return "anonymous";

  let userId = window.localStorage.getItem(USER_ID_KEY);
  if (!userId) {
    userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem(USER_ID_KEY, userId);
  }
  return userId;
}
