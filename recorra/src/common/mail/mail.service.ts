import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { env } from '@/config/env';

/**
 * E-mails da plataforma (verificação de e-mail, redefinição de senha).
 * Usa Resend se RESEND_API_KEY estiver configurado; caso contrário, apenas
 * loga (útil em desenvolvimento).
 *
 * Não há e-mail de convite: usuários são criados com senha direto em Equipe.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async send(to: string, subject: string, html: string): Promise<void> {
    if (!env.RESEND_API_KEY) {
      // NUNCA logar o corpo/token — em produção isso permitiria account takeover
      // por quem tem acesso a logs. Em produção, exigir provedor de e-mail.
      if (env.NODE_ENV === 'production') {
        this.logger.error(`RESEND_API_KEY ausente: e-mail para ${to} ("${subject}") NÃO enviado.`);
        throw new Error('Provedor de e-mail não configurado');
      }
      this.logger.warn(`[DEV] E-mail para ${to} — "${subject}" (corpo/token omitidos do log)`);
      return;
    }
    await axios.post(
      'https://api.resend.com/emails',
      { from: env.MAIL_FROM, to, subject, html },
      { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } },
    );
  }

  async sendVerification(to: string, token: string) {
    const link = `${env.FRONTEND_URL}/verificar-email?token=${token}`;
    await this.send(
      to,
      'Confirme seu e-mail — Recorrai',
      `<p>Bem-vindo ao Recorrai!</p><p>Confirme seu e-mail: <a href="${link}">${link}</a></p>`,
    );
  }

  async sendPasswordReset(to: string, token: string) {
    const link = `${env.FRONTEND_URL}/redefinir-senha?token=${token}`;
    await this.send(
      to,
      'Redefinir senha — Recorrai',
      `<p>Recebemos um pedido para redefinir sua senha do Recorrai.</p><p>Clique para criar uma nova senha (válido por 1 hora): <a href="${link}">${link}</a></p><p>Se não foi você, ignore este e-mail.</p>`,
    );
  }

}
