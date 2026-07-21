# Governança da Central de Ajuda

O manual funcional oficial é publicado diretamente no painel em:

`recorra-web/src/content/help-catalog.ts`

## Regra para novos commits

Todo commit que alterar comportamento em `recorra/src`, `recorra-web/src` ou no schema/migrations deve atualizar o catálogo no mesmo commit. O CI executa:

```bash
node scripts/check-help-docs.mjs
```

Para conferir alterações preparadas antes de commitar:

```bash
node scripts/check-help-docs.mjs --staged
```

Uma mudança exclusivamente técnica, sem qualquer alteração de tela, fluxo, regra, permissão, integração, estado ou automação, pode usar `[docs-nao-aplicavel]` no título do commit. A justificativa deve ficar no corpo do commit. Essa exceção é deliberadamente explícita e auditável.

## Checklist do documentador

Ao alterar uma funcionalidade, revise no catálogo:

1. O objetivo da funcionalidade.
2. O passo a passo conforme a interface atual.
3. Critérios de entrada e elegibilidade.
4. Estados e transições.
5. Automatizações, horários e recorrências.
6. Permissões e limitações por plano.
7. Efeitos no gateway, ERP, canais e dados locais.
8. Situações de bloqueio, falha, opt-out ou duplicidade.
9. Impacto em indicadores, risco e relatórios.
10. Data e versão do catálogo quando houver publicação relevante.
