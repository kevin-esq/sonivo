export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

export function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

export async function performWebAuthnRegistration(
  challenge: string,
  rpId: string,
  rpName: string,
  user: { id: string; name: string; displayName: string },
): Promise<{ credentialId: string; publicKey?: string; attestationObject?: string; clientDataJSON?: string }> {
  if (typeof window === 'undefined' || !window.navigator?.credentials?.create) {
    throw new Error('WebAuthn is not supported in this browser')
  }

  const challengeBuffer = base64UrlToBuffer(challenge)
  const userIdBuffer = new TextEncoder().encode(user.id)

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: challengeBuffer,
      rp: {
        id: rpId || window.location.hostname,
        name: rpName || 'Sonivo',
      },
      user: {
        id: userIdBuffer,
        name: user.name,
        displayName: user.displayName || user.name,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: {
        userVerification: 'preferred',
        residentKey: 'preferred',
      },
    },
  })) as PublicKeyCredential

  if (!credential) {
    throw new Error('No credential was received from the browser')
  }

  const response = credential.response as AuthenticatorAttestationResponse
  const credentialId = credential.id || bufferToBase64Url(credential.rawId)
  const attestationObject = response.attestationObject ? bufferToBase64Url(response.attestationObject) : undefined
  const clientDataJSON = response.clientDataJSON ? bufferToBase64Url(response.clientDataJSON) : undefined

  return {
    credentialId,
    attestationObject,
    clientDataJSON,
  }
}

export async function performWebAuthnLogin(
  challenge: string,
  rpId: string,
): Promise<{ credentialId: string; authenticatorData?: string; clientDataJSON?: string; signature?: string }> {
  if (typeof window === 'undefined' || !window.navigator?.credentials?.get) {
    throw new Error('WebAuthn is not supported in this browser')
  }

  const challengeBuffer = base64UrlToBuffer(challenge)

  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: challengeBuffer,
      rpId: rpId || window.location.hostname,
      userVerification: 'preferred',
      timeout: 60000,
    },
  })) as PublicKeyCredential

  if (!credential) {
    throw new Error('No assertion was received from the browser')
  }

  const response = credential.response as AuthenticatorAssertionResponse
  const credentialId = credential.id || bufferToBase64Url(credential.rawId)
  const authenticatorData = response.authenticatorData ? bufferToBase64Url(response.authenticatorData) : undefined
  const clientDataJSON = response.clientDataJSON ? bufferToBase64Url(response.clientDataJSON) : undefined
  const signature = response.signature ? bufferToBase64Url(response.signature) : undefined

  return {
    credentialId,
    authenticatorData,
    clientDataJSON,
    signature,
  }
}
