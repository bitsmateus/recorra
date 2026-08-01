import { describe, it, expect, vi } from 'vitest';
import { PublicUsuariosController } from '@/modules/public-api/public-usuarios.controller';

/**
 * PoC de segurança — escalada de papel pela API pública.
 *
 * O token de API tem escopos limitados, mas `POST /api/v1/usuarios` agia como
 * OWNER e aceitava `role` do corpo: um token com o único escopo `usuarios:write`
 * criava um usuário OWNER e, entrando por ele no painel, obtinha todo o resto do
 * tenant — contornando o modelo de escopos que deveria conter esse token.
 *
 * Comportamento seguro: a API só concede papéis não administrativos.
 */

const controller = () => {
  const users = { criar: vi.fn(async () => ({ id: 'u1' })), list: vi.fn(async () => []) };
  return { ctrl: new PublicUsuariosController(users as never), users };
};

describe('[SEC-03] Token de API não fabrica administrador', () => {
  it('pedido de OWNER é rebaixado para OPERADOR', async () => {
    const { ctrl, users } = controller();
    await ctrl.create('tenant-A', { nome: 'X', email: 'x@x.com', senha: 'Senha!123', role: 'OWNER' });
    expect(users.criar).toHaveBeenCalledWith('tenant-A', 'ADMIN', expect.objectContaining({ role: 'OPERADOR' }));
  });

  it('pedido de ADMIN também é rebaixado', async () => {
    const { ctrl, users } = controller();
    await ctrl.create('tenant-A', { nome: 'X', email: 'x@x.com', senha: 'Senha!123', role: 'ADMIN' });
    expect(users.criar).toHaveBeenCalledWith('tenant-A', 'ADMIN', expect.objectContaining({ role: 'OPERADOR' }));
  });

  it('o token nunca age como OWNER (barreira do users.criar continua valendo)', async () => {
    const { ctrl, users } = controller();
    await ctrl.create('tenant-A', { nome: 'X', email: 'x@x.com', senha: 'Senha!123' });
    expect(users.criar).toHaveBeenCalledWith('tenant-A', 'ADMIN', expect.anything());
  });

  it('papéis operacionais continuam permitidos', async () => {
    for (const role of ['FINANCEIRO', 'OPERADOR', 'LEITURA'] as const) {
      const { ctrl, users } = controller();
      await ctrl.create('tenant-A', { nome: 'X', email: 'x@x.com', senha: 'Senha!123', role });
      expect(users.criar).toHaveBeenCalledWith('tenant-A', 'ADMIN', expect.objectContaining({ role }));
    }
  });

  it('cria sempre no tenant do token, ignorando qualquer outro', async () => {
    const { ctrl, users } = controller();
    await ctrl.create('tenant-A', { nome: 'X', email: 'x@x.com', senha: 'Senha!123' });
    expect(users.criar).toHaveBeenCalledWith('tenant-A', expect.anything(), expect.anything());
  });
});
