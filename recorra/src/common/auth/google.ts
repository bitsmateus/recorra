import axios from 'axios';
import { env } from '@/config/env';

export interface GoogleProfile {
  sub: string; // id do Google
  email: string;
  emailVerified: boolean;
  name?: string;
}

/**
 * Verifica um id_token do Google via endpoint oficial tokeninfo e valida a
 * audiência (GOOGLE_CLIENT_ID). Retorna o perfil ou lança erro.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const { data } = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
    params: { id_token: idToken },
  });
  if (env.GOOGLE_CLIENT_ID && data.aud !== env.GOOGLE_CLIENT_ID) {
    throw new Error('Audiência do token Google inválida');
  }
  return {
    sub: data.sub,
    email: data.email,
    emailVerified: data.email_verified === 'true' || data.email_verified === true,
    name: data.name,
  };
}
