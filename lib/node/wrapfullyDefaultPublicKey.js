/**
 * Default Makefully Wrapfully fleet public key (kid: makefully-wrapfully-1).
 * Private key lives only on Wrapfully workers (WRAPFULLY_PRIVATE_KEY / cred.json).
 * Safe to embed in clients — used only to wrap chore AES keys when encrypt: true.
 */
export const WRAPFULLY_DEFAULT_KID = 'makefully-wrapfully-1';

export const WRAPFULLY_DEFAULT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArbQGAXiX+XtnsdS0yUPj
dgM2Vt8lwDXPtLxzjYD45fr/NEOct0+ECsvr3jyIB/cVCjINpJJyKGEBvZk8woFj
FgyodSWjJrc1UsomeOz6IcOArWu6GnkFo0jn8R0FN8LOhEl1xjqT7VPzF4jd7/P5
4WBNeB+wjkY/XBmk5wsNLvGaREp8G4fFfMgDNPpTUy7RB8ezolTiWZH0KgiXZtM8
yUXk5YBPxTwI28wCB6Om5RGmwozWc66k29qZQRv5d4GRMSM18lMKh3gkjptZRhRD
D48bKDQwYPX8CWcpl/Q9qm2L0wtikjQWro1NsAreqa3r91wlrsYZ82stYIyKBYhW
LwIDAQAB
-----END PUBLIC KEY-----
`;
