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
  // Sem GOOGLE_CLIENT_ID não há como validar a audiência — recusa o login por
  // segurança (evita aceitar id_token emitido para outro app).
  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error('Login com Google indisponível: GOOGLE_CLIENT_ID não configurado');
  }
  const { data } = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
    params: { id_token: idToken },
  });
  if (data.aud !== env.GOOGLE_CLIENT_ID) {
    throw new Error('Audiência do token Google inválida');
  }
  return {
    sub: data.sub,
    email: data.email,
    emailVerified: data.email_verified === 'true' || data.email_verified === true,
    name: data.name,
  };
}
