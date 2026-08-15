// Session-persisted admin token (issued by admin_login, gates all admin RPCs)
export function getAdminToken() { try { return sessionStorage.getItem('vcz_admin_token') || '' } catch { return '' } }
export function setAdminToken(t) { try { t ? sessionStorage.setItem('vcz_admin_token', t) : sessionStorage.removeItem('vcz_admin_token') } catch { } }
